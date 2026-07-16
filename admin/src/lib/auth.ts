// Login con Google (Authorization Code flow) para el panel de administración.
// La verificación del id_token se delega al endpoint tokeninfo de Google en
// vez de validar la firma JWT nosotros mismos — evita depender de una
// librería de JWT/JWKS solo para este único uso.

import type { Rol } from "./db.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

export function construirUrlAutorizacion(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  // Sin esto, si el navegador ya tiene una sesión de Google activa, Google
  // reautentica en silencio con la última cuenta usada y nunca muestra el
  // selector — un problema real para probar con más de una cuenta de Google.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export interface IdentidadGoogle {
  sub: string;
  email: string;
}

interface RespuestaTokenInfo {
  sub?: string;
  email?: string;
  aud?: string;
  email_verified?: string;
}

/**
 * Intercambia el `code` de la redirección de Google por la identidad
 * verificada del usuario. Lanza si el intercambio falla, si el id_token no
 * pasa la verificación de Google, si fue emitido para otro client_id (evita
 * aceptar un token de otra aplicación), o si el email no está verificado.
 */
export async function intercambiarCodigoPorIdentidad(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<IdentidadGoogle> {
  const respuestaToken = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!respuestaToken.ok) {
    throw new Error(`Error intercambiando el código de Google (${respuestaToken.status})`);
  }
  const { id_token: idToken } = (await respuestaToken.json()) as { id_token?: string };
  if (!idToken) throw new Error("Google no devolvió id_token");

  const respuestaInfo = await fetch(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
  if (!respuestaInfo.ok) {
    throw new Error("El id_token de Google no pasó la verificación");
  }
  const info = (await respuestaInfo.json()) as RespuestaTokenInfo;

  if (info.aud !== params.clientId) {
    throw new Error("El id_token no fue emitido para esta aplicación");
  }
  if (!info.sub || !info.email) {
    throw new Error("Respuesta de Google incompleta (falta sub o email)");
  }
  if (info.email_verified !== "true") {
    throw new Error("El email de la cuenta de Google no está verificado");
  }

  return { sub: info.sub, email: info.email };
}

/**
 * A dónde mandar a alguien recién autenticado (por Google o por contraseña,
 * no importa el método) — usado por auth/callback.ts, auth/login.astro y
 * auth/registro.astro para no repetir esta cadena de ifs en cada uno.
 */
export function redirigirSegunUsuario(usuario: { rol: Rol; negocio_id: number | null }): string {
  if (usuario.rol === "admin") return "/admin/negocios";
  if (usuario.negocio_id) return `/negocios/${usuario.negocio_id}/editar`;
  return "/onboarding";
}
