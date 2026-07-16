/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { firmarParametros } from "./flow.ts";

test("firmarParametros ordena las claves alfabéticamente antes de firmar (el orden de entrada no debería importar)", async () => {
  const secretKey = "un-secreto-de-prueba";
  const firmaA = await firmarParametros({ zeta: "2", apiKey: "abc", email: "a@b.cl" }, secretKey);
  const firmaB = await firmarParametros({ email: "a@b.cl", apiKey: "abc", zeta: "2" }, secretKey);
  assert.equal(firmaA, firmaB);
});

test("firmarParametros produce una firma hexadecimal de 64 caracteres (HMAC-SHA256)", async () => {
  const firma = await firmarParametros({ apiKey: "abc" }, "secreto");
  assert.match(firma, /^[0-9a-f]{64}$/);
});

test("firmarParametros produce firmas distintas para parámetros distintos", async () => {
  const firmaA = await firmarParametros({ apiKey: "abc" }, "secreto");
  const firmaB = await firmarParametros({ apiKey: "xyz" }, "secreto");
  assert.notEqual(firmaA, firmaB);
});

test("firmarParametros produce firmas distintas con secretos distintos", async () => {
  const firmaA = await firmarParametros({ apiKey: "abc" }, "secreto-1");
  const firmaB = await firmarParametros({ apiKey: "abc" }, "secreto-2");
  assert.notEqual(firmaA, firmaB);
});
