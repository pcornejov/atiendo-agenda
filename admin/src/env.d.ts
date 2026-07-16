/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    usuario: import("./lib/db.ts").Usuario;
  }
}

// GOOGLE_CLIENT_SECRET es un secret (`wrangler secret put`, `.dev.vars` en
// local) — no aparece en wrangler.jsonc "vars", así que `wrangler types` no
// lo agrega solo a worker-configuration.d.ts. Se extiende acá vía
// declaration merging sobre el mismo namespace que genera ese archivo.
declare namespace Cloudflare {
  interface Env {
    GOOGLE_CLIENT_SECRET: string;
  }
}
