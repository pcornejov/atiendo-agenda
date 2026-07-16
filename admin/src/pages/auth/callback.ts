import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { intercambiarCodigoPorIdentidad, redirigirSegunUsuario } from "../../lib/auth.ts";
import { obtenerUsuarioPorGoogleSub, obtenerUsuarioPorEmail, crearUsuario } from "../../lib/db.ts";

export const GET: APIRoute = async ({ url, cookies, redirect, session }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const estadoCookie = cookies.get("google_oauth_state")?.value;
  cookies.delete("google_oauth_state", { path: "/" });

  if (!code || !state || !estadoCookie || state !== estadoCookie) {
    return new Response("Solicitud de login inválida o expirada. Vuelve a intentar.", { status: 400 });
  }

  let identidad;
  try {
    identidad = await intercambiarCodigoPorIdentidad({
      code,
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${url.origin}/auth/callback`,
    });
  } catch (error) {
    console.error("Error en login con Google:", error);
    return new Response("No se pudo verificar tu cuenta de Google. Vuelve a intentar.", { status: 401 });
  }

  let usuario = await obtenerUsuarioPorGoogleSub(env.DB, identidad.sub);
  if (!usuario) {
    const existente = await obtenerUsuarioPorEmail(env.DB, identidad.email);
    if (existente && existente.google_sub === null) {
      // Ya existe una cuenta con este email creada por contraseña — no se
      // auto-vincula con esta cuenta de Google (podría ser otra persona
      // reclamando el mismo email por error o a propósito).
      return new Response(
        "Ya existe una cuenta con este email usando contraseña. Inicia sesión con tu contraseña en /auth/login.",
        { status: 409 }
      );
    }
    const rol = identidad.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase() ? "admin" : "dueno";
    usuario = await crearUsuario(env.DB, { googleSub: identidad.sub, email: identidad.email, rol, passwordHash: null });
  }

  session?.set("usuarioId", usuario.id);
  return redirect(redirigirSegunUsuario(usuario));
};
