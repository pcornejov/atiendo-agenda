/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { procesarBotonEntrante } from "./confirmacionCita.ts";
import type { BotonEntrante } from "./webhook.ts";

interface CitaFalsa {
  id: number;
  estado: string;
  servicio_nombre: string;
  whatsapp_phone_number_id: string;
}

/** D1Database falso: el SELECT busca en `citas` por id, el UPDATE queda registrado en `actualizados`. */
function crearDbFalsa(citas: CitaFalsa[]) {
  const actualizados: Array<{ id: number; estado: string }> = [];
  const db = {
    prepare(sql: string) {
      const esSelect = sql.trim().toUpperCase().startsWith("SELECT");
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (!esSelect) throw new Error("first() llamado sobre un UPDATE");
              const [citaId, phoneNumberId] = args as [number, string];
              const cita = citas.find((c) => c.id === citaId && c.whatsapp_phone_number_id === phoneNumberId);
              return cita ? { id: cita.id, estado: cita.estado, servicio_nombre: cita.servicio_nombre } : null;
            },
            async run() {
              if (esSelect) throw new Error("run() llamado sobre un SELECT");
              const [estado, citaId] = args as [string, number];
              actualizados.push({ id: citaId, estado });
              return {};
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, actualizados };
}

const PHONE_NUMBER_ID = "123456789012345";
const CITA_PENDIENTE: CitaFalsa = { id: 1, estado: "pendiente", servicio_nombre: "Corte de pelo", whatsapp_phone_number_id: PHONE_NUMBER_ID };

function boton(overrides: Partial<BotonEntrante> = {}): BotonEntrante {
  return {
    phoneNumberId: PHONE_NUMBER_ID,
    clienteTelefono: "+56912345678",
    payload: "confirmar_cita_1",
    ...overrides,
  };
}

test("confirmar_cita_N deja la cita en 'confirmada' y manda un mensaje de texto", async () => {
  const { db, actualizados } = crearDbFalsa([CITA_PENDIENTE]);
  const enviados: Array<{ para: string; texto: string }> = [];
  const fetchFalso: typeof fetch = async (_url, init) => {
    const body = JSON.parse((init?.body as string) ?? "{}");
    enviados.push({ para: body.to, texto: body.text?.body });
    return new Response("{}", { status: 200 });
  };

  await procesarBotonEntrante({ db, whatsappToken: "tok", boton: boton(), fetchImpl: fetchFalso });

  assert.deepEqual(actualizados, [{ id: 1, estado: "confirmada" }]);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].para, "+56912345678");
  assert.match(enviados[0].texto, /confirmado/i);
});

test("cancelar_cita_N deja la cita en 'cancelada'", async () => {
  const { db, actualizados } = crearDbFalsa([CITA_PENDIENTE]);
  const fetchFalso: typeof fetch = async () => new Response("{}", { status: 200 });

  await procesarBotonEntrante({ db, whatsappToken: "tok", boton: boton({ payload: "cancelar_cita_1" }), fetchImpl: fetchFalso });

  assert.deepEqual(actualizados, [{ id: 1, estado: "cancelada" }]);
});

test("una cita ya confirmada (doble tap) no se vuelve a actualizar ni se reenvía mensaje", async () => {
  const { db, actualizados } = crearDbFalsa([{ ...CITA_PENDIENTE, estado: "confirmada" }]);
  let llamadasFetch = 0;
  const fetchFalso: typeof fetch = async () => {
    llamadasFetch++;
    return new Response("{}", { status: 200 });
  };

  await procesarBotonEntrante({ db, whatsappToken: "tok", boton: boton(), fetchImpl: fetchFalso });

  assert.deepEqual(actualizados, []);
  assert.equal(llamadasFetch, 0);
});

test("un payload de otro negocio (phone_number_id distinto) se ignora", async () => {
  const { db, actualizados } = crearDbFalsa([CITA_PENDIENTE]);
  await procesarBotonEntrante({ db, whatsappToken: "tok", boton: boton({ phoneNumberId: "otro-negocio" }) });
  assert.deepEqual(actualizados, []);
});

test("un payload que no matchea el patrón esperado se ignora sin lanzar", async () => {
  const { db, actualizados } = crearDbFalsa([CITA_PENDIENTE]);
  await procesarBotonEntrante({ db, whatsappToken: "tok", boton: boton({ payload: "algo_random" }) });
  assert.deepEqual(actualizados, []);
});
