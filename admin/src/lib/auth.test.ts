/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirUrlAutorizacion } from "./auth.ts";

test("construirUrlAutorizacion arma la URL de autorización de Google con los parámetros esperados", () => {
  const url = new URL(
    construirUrlAutorizacion({
      clientId: "client-123",
      redirectUri: "https://ejemplo.workers.dev/auth/callback",
      state: "estado-abc",
    })
  );
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "client-123");
  assert.equal(url.searchParams.get("redirect_uri"), "https://ejemplo.workers.dev/auth/callback");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("state"), "estado-abc");
  assert.equal(url.searchParams.get("prompt"), "select_account");
});
