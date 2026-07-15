/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { procesarRecordatorios } from "./recordatorios.ts";

interface FilaFalsa {
  id: number;
  cliente_telefono: string;
  fecha_hora_inicio: string;
  whatsapp_phone_number_id: string;
  servicio_nombre: string;
  timezone: string;
}

/** D1Database falso: el SELECT siempre devuelve `filas`, el UPDATE queda registrado en `actualizados`. */
function crearDbFalsa(filas: FilaFalsa[]) {
  const actualizados: number[] = [];
  const db = {
    prepare(sql: string) {
      const esSelect = sql.trim().toUpperCase().startsWith("SELECT");
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              if (!esSelect) throw new Error("all() llamado sobre un UPDATE");
              return { results: filas };
            },
            async run() {
              if (esSelect) throw new Error("run() llamado sobre un SELECT");
              actualizados.push(args[0] as number);
              return {};
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, actualizados };
}

const CITA_1: FilaFalsa = {
  id: 1,
  cliente_telefono: "+56911110001",
  fecha_hora_inicio: "2026-07-15T14:30:00.000Z",
  whatsapp_phone_number_id: "123456789012345",
  servicio_nombre: "Corte de pelo",
  timezone: "America/Santiago",
};
const CITA_2: FilaFalsa = { ...CITA_1, id: 2, cliente_telefono: "+56911110002" };

test("procesarRecordatorios envía y marca recordatorio_enviado solo para las citas que se enviaron con éxito", async () => {
  const { db, actualizados } = crearDbFalsa([CITA_1, CITA_2]);
  let llamadaN = 0;
  const fetchFalso: typeof fetch = async () => {
    llamadaN++;
    // La primera cita falla (ej. número inválido), la segunda se envía bien.
    return llamadaN === 1 ? new Response("error", { status: 400 }) : new Response("{}", { status: 200 });
  };

  const resultado = await procesarRecordatorios({
    db,
    whatsappToken: "tok",
    nombrePlantilla: "recordatorio_cita",
    idiomaPlantilla: "es",
    fetchImpl: fetchFalso,
  });

  assert.deepEqual(resultado, { enviados: 1, fallidos: 1 });
  assert.deepEqual(actualizados, [2]); // solo la cita 2 (la que sí se envió) se marca
});

test("procesarRecordatorios sin citas pendientes no llama a fetch ni actualiza nada", async () => {
  const { db, actualizados } = crearDbFalsa([]);
  let llamadasFetch = 0;
  const fetchFalso: typeof fetch = async () => {
    llamadasFetch++;
    return new Response("{}", { status: 200 });
  };

  const resultado = await procesarRecordatorios({
    db,
    whatsappToken: "tok",
    nombrePlantilla: "recordatorio_cita",
    idiomaPlantilla: "es",
    fetchImpl: fetchFalso,
  });

  assert.deepEqual(resultado, { enviados: 0, fallidos: 0 });
  assert.equal(llamadasFetch, 0);
  assert.deepEqual(actualizados, []);
});
