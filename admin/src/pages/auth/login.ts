import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { construirUrlAutorizacion } from "../../lib/auth.ts";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const state = crypto.randomUUID();
  cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const urlAutorizacion = construirUrlAutorizacion({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: `${url.origin}/auth/callback`,
    state,
  });
  return redirect(urlAutorizacion);
};
