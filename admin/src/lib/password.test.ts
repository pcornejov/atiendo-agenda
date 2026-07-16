/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verificarPassword } from "./password.ts";

test("hashPassword + verificarPassword: la misma contraseña verifica correcta", async () => {
  const hash = await hashPassword("una-contraseña-segura");
  assert.equal(await verificarPassword("una-contraseña-segura", hash), true);
});

test("verificarPassword rechaza una contraseña incorrecta", async () => {
  const hash = await hashPassword("una-contraseña-segura");
  assert.equal(await verificarPassword("otra-contraseña", hash), false);
});

test("hashPassword produce un hash distinto cada vez (sal aleatoria)", async () => {
  const hashA = await hashPassword("misma-contraseña");
  const hashB = await hashPassword("misma-contraseña");
  assert.notEqual(hashA, hashB);
  // pero ambos verifican correcto contra la misma contraseña
  assert.equal(await verificarPassword("misma-contraseña", hashA), true);
  assert.equal(await verificarPassword("misma-contraseña", hashB), true);
});

test("verificarPassword devuelve false (sin lanzar) contra un hash corrupto o con formato inesperado", async () => {
  assert.equal(await verificarPassword("cualquiera", "esto-no-es-un-hash-valido"), false);
  assert.equal(await verificarPassword("cualquiera", "pbkdf2$no-numero$aabb$ccdd"), false);
  assert.equal(await verificarPassword("cualquiera", ""), false);
});
