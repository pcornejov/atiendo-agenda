import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { intercambiarCodigoPorIdentidad } from "../../lib/auth.ts";
import { obtenerUsuarioPorGoogleSub, crearUsuario } from "../../lib/db.ts";

export const GET: APIRoute = async ({ url, cookies, redirect, session }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const estadoCookie = cookies.get("google_oauth_state")?.value;
  cookies.delete("google_oauth_state", { path: "/" });

  if (!code || !state || !estadoCookie || state !== estadoCookie) {
    return new Response("Solicitud de login inválida o expirada. Volvé a intentar.", { status: 400 });
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
    return new Response("No se pudo verificar tu cuenta de Google. Volvé a intentar.", { status: 401 });
  }

  let usuario = await obtenerUsuarioPorGoogleSub(env.DB, identidad.sub);
  if (!usuario) {
    const rol = identidad.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase() ? "admin" : "dueno";
    usuario = await crearUsuario(env.DB, { googleSub: identidad.sub, email: identidad.email, rol });
  }

  session?.set("usuarioId", usuario.id);

  if (usuario.rol === "admin") return redirect("/admin/negocios");
  if (usuario.negocio_id) return redirect(`/negocios/${usuario.negocio_id}/editar`);
  return redirect("/onboarding");
};
