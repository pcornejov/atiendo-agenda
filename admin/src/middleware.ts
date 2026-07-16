// Gate único de autenticación del panel: reemplaza a Cloudflare Access (que
// solo se puede restringir a emails cargados a mano en el dashboard, no
// sirve para que un dueño de negocio nuevo se registre solo). Toda ruta que
// no sea /auth/* requiere sesión de Google válida.

import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { obtenerUsuarioPorId } from "./lib/db.ts";

const RUTAS_PUBLICAS = new Set(["/auth/login", "/auth/callback"]);

export const onRequest = defineMiddleware(async (context, next) => {
  if (RUTAS_PUBLICAS.has(context.url.pathname)) {
    return next();
  }

  const usuarioId = await context.session?.get<number>("usuarioId");
  if (!usuarioId) {
    return context.redirect("/auth/login");
  }

  const usuario = await obtenerUsuarioPorId(env.DB, usuarioId);
  if (!usuario) {
    context.session?.destroy();
    return context.redirect("/auth/login");
  }

  if (usuario.rol === "dueno" && usuario.negocio_id === null && context.url.pathname !== "/onboarding") {
    return context.redirect("/onboarding");
  }

  context.locals.usuario = usuario;
  return next();
});
