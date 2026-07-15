/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { enviarMensajeWhatsApp } from "./whatsapp.ts";

test("enviarMensajeWhatsApp arma la URL, headers y body correctos", async () => {
  const llamadas: Array<{ url: string; init: RequestInit }> = [];
  const fetchFalso: typeof fetch = async (url, init) => {
    llamadas.push({ url: url.toString(), init: init ?? {} });
    return new Response("{}", { status: 200 });
  };

  await enviarMensajeWhatsApp(
    { phoneNumberId: "123456789012345", token: "tok-abc", para: "+56912345678", texto: "hola" },
    fetchFalso
  );

  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].url, "https://graph.facebook.com/v21.0/123456789012345/messages");
  assert.equal(llamadas[0].init.method, "POST");
  const headers = llamadas[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer tok-abc");
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(llamadas[0].init.body as string), {
    messaging_product: "whatsapp",
    to: "+56912345678",
    type: "text",
    text: { body: "hola" },
  });
});

test("enviarMensajeWhatsApp lanza un error legible si la API responde con error", async () => {
  const fetchFalso: typeof fetch = async () =>
    new Response('{"error":{"message":"Invalid token"}}', { status: 401 });

  await assert.rejects(
    enviarMensajeWhatsApp(
      { phoneNumberId: "1", token: "malo", para: "+56900000000", texto: "hola" },
      fetchFalso
    ),
    /401/
  );
});
