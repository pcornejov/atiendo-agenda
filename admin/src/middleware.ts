// Gate único de autenticación del panel: reemplaza a Cloudflare Access (que
// solo se puede restringir a emails cargados a mano en el dashboard, no
// sirve para que un dueño de negocio nuevo se registre solo).
//
// La raíz "/" es la landing page pública — a diferencia del resto de
// RUTAS_PUBLICAS, igual necesita que se cargue `locals.usuario` cuando SÍ hay
// sesión activa (para que index.astro mande a un usuario ya logueado directo
// a su panel en vez de mostrarle la landing). Por eso el gate siempre intenta
// cargar el usuario si hay sesión, y solo fuerza el redirect a /auth/login
// cuando la ruta no es pública y no hay usuario válido.

import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { obtenerUsuarioPorId } from "./lib/db.ts";

// /webhook/flow lo llama Flow directamente (no tiene sesión) — se autentica
// solo, verificando el token contra la API de Flow, no acá.
const RUTAS_PUBLICAS = new Set(["/", "/auth/login", "/auth/registro", "/auth/google", "/auth/callback", "/webhook/flow"]);

export const onRequest = defineMiddleware(async (context, next) => {
  const esPublica = RUTAS_PUBLICAS.has(context.url.pathname);

  const usuarioId = await context.session?.get<number>("usuarioId");
  let usuario = usuarioId ? await obtenerUsuarioPorId(env.DB, usuarioId) : null;

  if (usuarioId && !usuario) {
    context.session?.destroy();
  }

  if (!usuario && !esPublica) {
    return context.redirect("/auth/login");
  }

  if (usuario) {
    // /auth/logout queda exceptuado a propósito: un dueño a mitad del
    // onboarding (sin negocio_id todavía) igual tiene que poder cerrar
    // sesión — si no, queda atrapado sin forma de salir o cambiar de cuenta.
    if (
      usuario.rol === "dueno" &&
      usuario.negocio_id === null &&
      context.url.pathname !== "/onboarding" &&
      context.url.pathname !== "/auth/logout"
    ) {
      return context.redirect("/onboarding");
    }
    context.locals.usuario = usuario;
  }

  return next();
});
