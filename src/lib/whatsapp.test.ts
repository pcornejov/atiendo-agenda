/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { enviarMensajeWhatsApp, enviarPlantillaWhatsApp } from "./whatsapp.ts";

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

test("enviarPlantillaWhatsApp arma el body de tipo template con los parámetros en orden", async () => {
  const llamadas: Array<{ url: string; init: RequestInit }> = [];
  const fetchFalso: typeof fetch = async (url, init) => {
    llamadas.push({ url: url.toString(), init: init ?? {} });
    return new Response("{}", { status: 200 });
  };

  await enviarPlantillaWhatsApp(
    {
      phoneNumberId: "123456789012345",
      token: "tok-abc",
      para: "+56912345678",
      nombrePlantilla: "recordatorio_cita",
      idioma: "es",
      parametros: ["Corte de pelo", "10:00"],
    },
    fetchFalso
  );

  assert.equal(llamadas[0].url, "https://graph.facebook.com/v21.0/123456789012345/messages");
  assert.deepEqual(JSON.parse(llamadas[0].init.body as string), {
    messaging_product: "whatsapp",
    to: "+56912345678",
    type: "template",
    template: {
      name: "recordatorio_cita",
      language: { code: "es" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Corte de pelo" },
            { type: "text", text: "10:00" },
          ],
        },
      ],
    },
  });
});

test("enviarPlantillaWhatsApp sin parámetros omite el bloque de components", async () => {
  const llamadas: Array<{ init: RequestInit }> = [];
  const fetchFalso: typeof fetch = async (_url, init) => {
    llamadas.push({ init: init ?? {} });
    return new Response("{}", { status: 200 });
  };

  await enviarPlantillaWhatsApp(
    {
      phoneNumberId: "1",
      token: "tok",
      para: "+56900000000",
      nombrePlantilla: "sin_parametros",
      idioma: "es",
      parametros: [],
    },
    fetchFalso
  );

  const body = JSON.parse(llamadas[0].init.body as string);
  assert.equal("components" in body.template, false);
});

test("enviarPlantillaWhatsApp agrega los componentes de botón quick-reply después del body", async () => {
  const llamadas: Array<{ init: RequestInit }> = [];
  const fetchFalso: typeof fetch = async (_url, init) => {
    llamadas.push({ init: init ?? {} });
    return new Response("{}", { status: 200 });
  };

  await enviarPlantillaWhatsApp(
    {
      phoneNumberId: "1",
      token: "tok",
      para: "+56900000000",
      nombrePlantilla: "recordatorio_cita",
      idioma: "es",
      parametros: ["Corte de pelo", "10:00"],
      botones: [
        { indice: 0, payload: "confirmar_cita_123" },
        { indice: 1, payload: "cancelar_cita_123" },
      ],
    },
    fetchFalso
  );

  const body = JSON.parse(llamadas[0].init.body as string);
  assert.deepEqual(body.template.components, [
    {
      type: "body",
      parameters: [
        { type: "text", text: "Corte de pelo" },
        { type: "text", text: "10:00" },
      ],
    },
    { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "confirmar_cita_123" }] },
    { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: "cancelar_cita_123" }] },
  ]);
});

test("enviarPlantillaWhatsApp con botones pero sin parámetros de body igual arma components", async () => {
  const llamadas: Array<{ init: RequestInit }> = [];
  const fetchFalso: typeof fetch = async (_url, init) => {
    llamadas.push({ init: init ?? {} });
    return new Response("{}", { status: 200 });
  };

  await enviarPlantillaWhatsApp(
    {
      phoneNumberId: "1",
      token: "tok",
      para: "+56900000000",
      nombrePlantilla: "sin_body",
      idioma: "es",
      parametros: [],
      botones: [{ indice: 0, payload: "confirmar_cita_9" }],
    },
    fetchFalso
  );

  const body = JSON.parse(llamadas[0].init.body as string);
  assert.deepEqual(body.template.components, [
    { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "confirmar_cita_9" }] },
  ]);
});
