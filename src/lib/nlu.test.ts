/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  interpretarSolicitud,
  interpretarSeleccion,
  interpretarPedido,
  interpretarConfirmacion,
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

const INTENTS_AGENDAMIENTO = [
  { nombre: "consultar_disponibilidad", descripcion: "el cliente pide hora." },
  { nombre: "consultar_mi_cita", descripcion: "el cliente pregunta por una cita ya agendada." },
  { nombre: "cancelar", descripcion: "el cliente pide cancelar." },
];

const PARAMS_BASE = {
  mensajeCliente: "tienen hora el jueves en la tarde?",
  servicioNombre: "Corte de pelo",
  duracionMinutos: 45,
  hoyYMD: "2026-07-15",
  diaSemanaHoyTexto: "miércoles",
  intentsDisponibles: INTENTS_AGENDAMIENTO,
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

test("interpretarSolicitud: reconoce 'consultar_mi_cita' (preguntar por una cita ya agendada)", async () => {
  const client = clienteFalso({
    intent: "consultar_mi_cita",
    fecha_preferida: null,
    rango_horario_preferido: null,
  });
  const resultado = await interpretarSolicitud(client, {
    ...PARAMS_BASE,
    mensajeCliente: "a que hora tengo mi cita?",
  });
  assert.equal(resultado.intent, "consultar_mi_cita");
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

test("interpretarSeleccion: numero_elegido=2 (1-based) mapea a indiceSeleccionado=1 (0-based)", async () => {
  const client = clienteFalso({ intent: "seleccion", numero_elegido: 2 });
  const resultado = await interpretarSeleccion(client, {
    mensajeCliente: "el de las 10:45",
    horariosOfrecidos: HORARIOS_OFRECIDOS,
  });
  assert.deepEqual(resultado, { intent: "seleccion", indiceSeleccionado: 1 });
});

test("interpretarSeleccion: numero_elegido=1 mapea al primero (indiceSeleccionado=0)", async () => {
  const client = clienteFalso({ intent: "seleccion", numero_elegido: 1 });
  const resultado = await interpretarSeleccion(client, {
    mensajeCliente: "el primero",
    horariosOfrecidos: HORARIOS_OFRECIDOS,
  });
  assert.deepEqual(resultado, { intent: "seleccion", indiceSeleccionado: 0 });
});

test("interpretarSeleccion: numero_elegido fuera de rango se descarta", async () => {
  const client = clienteFalso({ intent: "seleccion", numero_elegido: 99 });
  const resultado = await interpretarSeleccion(client, {
    mensajeCliente: "el último",
    horariosOfrecidos: HORARIOS_OFRECIDOS,
  });
  assert.deepEqual(resultado, { intent: "seleccion", indiceSeleccionado: null });
});

test("interpretarSeleccion: numero_elegido=0 (fuera de rango, no es 1-based válido) se descarta", async () => {
  const client = clienteFalso({ intent: "seleccion", numero_elegido: 0 });
  const resultado = await interpretarSeleccion(client, {
    mensajeCliente: "el cero",
    horariosOfrecidos: HORARIOS_OFRECIDOS,
  });
  assert.deepEqual(resultado, { intent: "seleccion", indiceSeleccionado: null });
});

test("interpretarSeleccion: intent 'cancelar' ignora cualquier número", async () => {
  const client = clienteFalso({ intent: "cancelar", numero_elegido: 1 });
  const resultado = await interpretarSeleccion(client, {
    mensajeCliente: "mejor cancela",
    horariosOfrecidos: HORARIOS_OFRECIDOS,
  });
  assert.deepEqual(resultado, { intent: "cancelar", indiceSeleccionado: null });
});

const MENU_DISPONIBLE = ["Empanada de pino", "Completo italiano", "Bebida 350ml"];

test("interpretarPedido: mapea items válidos del menú", async () => {
  const client = clienteFalso({
    intent: "pedido",
    items: [
      { nombre: "Empanada de pino", cantidad: 2 },
      { nombre: "Bebida 350ml", cantidad: 1 },
    ],
  });
  const resultado = await interpretarPedido(client, {
    mensajeCliente: "quiero 2 empanadas de pino y una bebida",
    menuDisponible: MENU_DISPONIBLE,
  });
  assert.deepEqual(resultado, {
    intent: "pedido",
    items: [
      { nombre: "Empanada de pino", cantidad: 2 },
      { nombre: "Bebida 350ml", cantidad: 1 },
    ],
  });
});

test("interpretarPedido: descarta items que no están en el menú (alucinación de Claude)", async () => {
  const client = clienteFalso({
    intent: "pedido",
    items: [
      { nombre: "Empanada de pino", cantidad: 1 },
      { nombre: "Pizza familiar", cantidad: 1 }, // no está en MENU_DISPONIBLE
    ],
  });
  const resultado = await interpretarPedido(client, {
    mensajeCliente: "una empanada y una pizza familiar",
    menuDisponible: MENU_DISPONIBLE,
  });
  assert.deepEqual(resultado.items, [{ nombre: "Empanada de pino", cantidad: 1 }]);
});

test("interpretarPedido: descarta cantidades inválidas (0, negativas, no enteras)", async () => {
  const client = clienteFalso({
    intent: "pedido",
    items: [
      { nombre: "Empanada de pino", cantidad: 0 },
      { nombre: "Bebida 350ml", cantidad: -1 },
      { nombre: "Completo italiano", cantidad: 1.5 },
    ],
  });
  const resultado = await interpretarPedido(client, {
    mensajeCliente: "mensaje raro",
    menuDisponible: MENU_DISPONIBLE,
  });
  assert.deepEqual(resultado.items, []);
});

test("interpretarPedido: intent 'cancelar' no procesa items", async () => {
  const client = clienteFalso({ intent: "cancelar", items: [{ nombre: "Empanada de pino", cantidad: 1 }] });
  const resultado = await interpretarPedido(client, {
    mensajeCliente: "mejor cancela mi pedido",
    menuDisponible: MENU_DISPONIBLE,
  });
  assert.deepEqual(resultado, { intent: "cancelar", items: [] });
});

test("interpretarConfirmacion: mapea 'confirmar'/'cancelar'/'otro'", async () => {
  const confirmar = await interpretarConfirmacion(clienteFalso({ intent: "confirmar" }), {
    mensajeCliente: "sí, dale",
  });
  assert.deepEqual(confirmar, { intent: "confirmar" });

  const cancelar = await interpretarConfirmacion(clienteFalso({ intent: "cancelar" }), {
    mensajeCliente: "no, mejor no",
  });
  assert.deepEqual(cancelar, { intent: "cancelar" });

  const otro = await interpretarConfirmacion(clienteFalso({ intent: "algo_invalido" }), {
    mensajeCliente: "eh?",
  });
  assert.deepEqual(otro, { intent: "otro" });
});
