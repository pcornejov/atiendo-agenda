/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearMensajeWhatsApp } from "./webhook.ts";

function payloadMensajeTexto(overrides: { texto?: string; from?: string; nombrePerfil?: string } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry-1",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "56900000000", phone_number_id: "123456789012345" },
              contacts: [{ profile: { name: overrides.nombrePerfil ?? "Juan Pérez" }, wa_id: "56912345678" }],
              messages: [
                {
                  from: overrides.from ?? "56912345678",
                  id: "wamid.xyz",
                  timestamp: "1721059200",
                  text: { body: overrides.texto ?? "tienen hora el jueves en la tarde?" },
                  type: "text",
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

test("parsea un mensaje de texto entrante", () => {
  const resultado = parsearMensajeWhatsApp(payloadMensajeTexto());
  assert.deepEqual(resultado, {
    phoneNumberId: "123456789012345",
    clienteTelefono: "+56912345678",
    clienteNombrePerfil: "Juan Pérez",
    texto: "tienen hora el jueves en la tarde?",
  });
});

test("agrega '+' al teléfono si no lo trae", () => {
  const resultado = parsearMensajeWhatsApp(payloadMensajeTexto({ from: "56912345678" }));
  assert.equal(resultado?.clienteTelefono, "+56912345678");
});

test("una actualización de estado (delivered/read) no trae 'messages' y se ignora", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "123456789012345" },
              statuses: [{ id: "wamid.xyz", status: "delivered" }],
            },
          },
        ],
      },
    ],
  };
  assert.equal(parsearMensajeWhatsApp(payload), null);
});

test("un mensaje que no es de texto (ej. imagen) se ignora", () => {
  const payload = payloadMensajeTexto();
  // @ts-expect-error -- payload de test, mutamos el mensaje a tipo imagen
  payload.entry[0].changes[0].value.messages[0] = { from: "56912345678", type: "image", image: {} };
  assert.equal(parsearMensajeWhatsApp(payload), null);
});

test("payload sin 'entry' devuelve null en vez de lanzar", () => {
  assert.equal(parsearMensajeWhatsApp({}), null);
  assert.equal(parsearMensajeWhatsApp(null), null);
  assert.equal(parsearMensajeWhatsApp("texto plano"), null);
  assert.equal(parsearMensajeWhatsApp(undefined), null);
});

test("sin contacts.profile.name, clienteNombrePerfil queda null", () => {
  const payload = payloadMensajeTexto();
  // @ts-expect-error -- payload de test
  delete payload.entry[0].changes[0].value.contacts;
  const resultado = parsearMensajeWhatsApp(payload);
  assert.equal(resultado?.clienteNombrePerfil, null);
});
