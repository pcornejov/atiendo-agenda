/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirUrlAutorizacion, redirigirSegunUsuario } from "./auth.ts";

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

test("redirigirSegunUsuario manda a un admin a /admin/negocios", () => {
  assert.equal(redirigirSegunUsuario({ rol: "admin", negocio_id: null }), "/admin/negocios");
});

test("redirigirSegunUsuario manda a un dueño con negocio a editar su negocio", () => {
  assert.equal(redirigirSegunUsuario({ rol: "dueno", negocio_id: 7 }), "/negocios/7/editar");
});

test("redirigirSegunUsuario manda a un dueño sin negocio al onboarding", () => {
  assert.equal(redirigirSegunUsuario({ rol: "dueno", negocio_id: null }), "/onboarding");
});
