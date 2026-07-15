/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  interpretarSolicitud,
  interpretarSeleccion,
  type ClienteClaude,
} from "./nlu.ts";

/** Cliente Claude falso: devuelve el input de tool_use que se le pase, sin red. */
function clienteFalso(inputToolUse: unknown, nombreHerramienta?: string): ClienteClaude {
  return {
    messages: {
      async create(params) {
        return {
          content: [
            {
              type: "tool_use",
              name: nombreHerramienta ?? params.tool_choice.name,
              input: inputToolUse,
            },
          ],
        };
      },
    },
  };
}

const PARAMS_BASE = {
  mensajeCliente: "tienen hora el jueves en la tarde?",
  servicioNombre: "Corte de pelo",
  duracionMinutos: 45,
  hoyYMD: "2026-07-15",
  diaSemanaHoyTexto: "miércoles",
};

test("interpretarSolicitud: mapea una respuesta válida de Claude", async () => {
  const client = clienteFalso({
    intent: "consultar_disponibilidad",
    fecha_preferida: "2026-07-16",
    rango_horario_preferido: "tarde",
  });
  const resultado = await interpretarSolicitud(client, PARAMS_BASE);
  assert.deepEqual(resultado, {
    intent: "consultar_disponibilidad",
    fechaPreferida: "2026-07-16",
    rangoHorarioPreferido: "tarde",
  });
});

test("interpretarSolicitud: intent inválido cae a 'otro'", async () => {
  const client = clienteFalso({
    intent: "algo_que_no_existe",
    fecha_preferida: null,
    rango_horario_preferido: null,
  });
  const resultado = await interpretarSolicitud(client, PARAMS_BASE);
  assert.equal(resultado.intent, "otro");
});

test("interpretarSolicitud: descarta una fecha_preferida en el pasado", async () => {
  const client = clienteFalso({
    intent: "consultar_disponibilidad",
    fecha_preferida: "2026-01-01", // antes de hoyYMD (2026-07-15)
    rango_horario_preferido: null,
  });
  const resultado = await interpretarSolicitud(client, PARAMS_BASE);
  assert.equal(resultado.fechaPreferida, null);
});

test("interpretarSolicitud: descarta una fecha_preferida mal formada", async () => {
  const client = clienteFalso({
    intent: "consultar_disponibilidad",
    fecha_preferida: "el jueves que viene",
    rango_horario_preferido: null,
  });
  const resultado = await interpretarSolicitud(client, PARAMS_BASE);
  assert.equal(resultado.fechaPreferida, null);
});

test("interpretarSolicitud: rango_horario_preferido inválido cae a null", async () => {
  const client = clienteFalso({
    intent: "consultar_disponibilidad",
    fecha_preferida: null,
    rango_horario_preferido: "madrugada",
  });
  const resultado = await interpretarSolicitud(client, PARAMS_BASE);
  assert.equal(resultado.rangoHorarioPreferido, null);
});

test("interpretarSolicitud: si no hay bloque tool_use, cae a 'otro' sin lanzar", async () => {
  const client: ClienteClaude = {
    messages: {
      async create() {
        return { content: [{ type: "text" }] };
      },
    },
  };
  const resultado = await interpretarSolicitud(client, PARAMS_BASE);
  assert.deepEqual(resultado, { intent: "otro", fechaPreferida: null, rangoHorarioPreferido: null });
});

const HORARIOS_OFRECIDOS = ["2026-07-16 10:00", "2026-07-16 10:45", "2026-07-16 11:30"];

test("interpretarSeleccion: mapea un índice válido", async () => {
  const client = clienteFalso({ intent: "seleccion", indice_seleccionado: 1 });
  const resultado = await interpretarSeleccion(client, {
    mensajeCliente: "el de las 10:45",
    horariosOfrecidos: HORARIOS_OFRECIDOS,
  });
  assert.deepEqual(resultado, { intent: "seleccion", indiceSeleccionado: 1 });
});

test("interpretarSeleccion: índice fuera de rango se descarta", async () => {
  const client = clienteFalso({ intent: "seleccion", indice_seleccionado: 99 });
  const resultado = await interpretarSeleccion(client, {
    mensajeCliente: "el último",
    horariosOfrecidos: HORARIOS_OFRECIDOS,
  });
  assert.deepEqual(resultado, { intent: "seleccion", indiceSeleccionado: null });
});

test("interpretarSeleccion: intent 'cancelar' ignora cualquier índice", async () => {
  const client = clienteFalso({ intent: "cancelar", indice_seleccionado: 0 });
  const resultado = await interpretarSeleccion(client, {
    mensajeCliente: "mejor cancela",
    horariosOfrecidos: HORARIOS_OFRECIDOS,
  });
  assert.deepEqual(resultado, { intent: "cancelar", indiceSeleccionado: null });
});
