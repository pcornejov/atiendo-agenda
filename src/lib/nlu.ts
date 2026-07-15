// Interpretación de mensajes de WhatsApp en lenguaje natural con Claude Haiku.
//
// `ClienteClaude` es la porción mínima de la API de mensajes de Anthropic que
// este módulo necesita (no todo el SDK), para poder testear la lógica de
// construcción de prompt / parseo de respuesta con un cliente falso, sin red
// ni ANTHROPIC_API_KEY. Un `new Anthropic({ apiKey })` real del SDK cumple
// esta interfaz de sobra (se usan los tipos de tools/tool_choice del SDK
// para que la asignación sea válida en ambas direcciones).

import type Anthropic from "@anthropic-ai/sdk";

export interface ClienteClaude {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user"; content: string }>;
      tools: Anthropic.Tool[];
      tool_choice: Anthropic.ToolChoiceTool;
    }): Promise<{ content: Array<{ type: string; name?: string; input?: unknown }> }>;
  };
}

export const MODELO_HAIKU = "claude-haiku-4-5-20251001";

export type Intent = "consultar_disponibilidad" | "cancelar" | "otro";
export type RangoHorarioPreferido = "manana" | "tarde" | "noche";

export interface SolicitudInterpretada {
  intent: Intent;
  fechaPreferida: string | null; // 'YYYY-MM-DD'
  rangoHorarioPreferido: RangoHorarioPreferido | null;
}

const TOOL_INTERPRETAR_SOLICITUD: Anthropic.Tool = {
  name: "interpretar_solicitud",
  description:
    "Extrae la intención y la preferencia de fecha/hora del mensaje de un cliente que le escribe por WhatsApp a un negocio para agendar una cita.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["consultar_disponibilidad", "cancelar", "otro"],
        description:
          "'consultar_disponibilidad' si el cliente pide hora o pregunta por disponibilidad. 'cancelar' si pide cancelar una cita existente. 'otro' para saludos, agradecimientos, o cualquier cosa que no encaje en las anteriores.",
      },
      fecha_preferida: {
        type: ["string", "null"],
        description:
          "Fecha en formato YYYY-MM-DD si el cliente mencionó o se puede inferir un día específico (ej. 'jueves', 'mañana', 'el 20'). null si no mencionó ninguna fecha.",
      },
      rango_horario_preferido: {
        type: ["string", "null"],
        enum: ["manana", "tarde", "noche", null],
        description:
          "Franja horaria si el cliente la mencionó explícitamente (ej. 'en la tarde'). null si no aplica.",
      },
    },
    required: ["intent", "fecha_preferida", "rango_horario_preferido"],
  },
};

function construirSystemPromptSolicitud(params: {
  servicioNombre: string;
  duracionMinutos: number;
  hoyYMD: string;
  diaSemanaHoyTexto: string;
}): string {
  return [
    `Eres el asistente de agendamiento de un negocio que ofrece "${params.servicioNombre}" (dura ${params.duracionMinutos} minutos).`,
    `Hoy es ${params.diaSemanaHoyTexto} ${params.hoyYMD} (formato YYYY-MM-DD), hora local del negocio.`,
    "Un cliente te escribió por WhatsApp. Interpreta su mensaje usando la herramienta interpretar_solicitud.",
    "Si el cliente menciona un día relativo (ej. 'mañana', 'el jueves', 'el próximo lunes'), calcula la fecha absoluta a partir de la fecha de hoy.",
    "Si no se menciona ninguna fecha ni franja horaria, deja esos campos en null.",
  ].join("\n");
}

function esFechaValida(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

const INTENTS_SOLICITUD: readonly Intent[] = ["consultar_disponibilidad", "cancelar", "otro"];
const RANGOS_VALIDOS: readonly RangoHorarioPreferido[] = ["manana", "tarde", "noche"];

/** Interpreta un mensaje nuevo del cliente (sin conversación pendiente). */
export async function interpretarSolicitud(
  client: ClienteClaude,
  params: {
    mensajeCliente: string;
    servicioNombre: string;
    duracionMinutos: number;
    hoyYMD: string;
    diaSemanaHoyTexto: string;
  }
): Promise<SolicitudInterpretada> {
  const respuesta = await client.messages.create({
    model: MODELO_HAIKU,
    max_tokens: 256,
    system: construirSystemPromptSolicitud(params),
    messages: [{ role: "user", content: params.mensajeCliente }],
    tools: [TOOL_INTERPRETAR_SOLICITUD],
    tool_choice: { type: "tool", name: "interpretar_solicitud" },
  });

  const bloque = respuesta.content.find(
    (b): b is { type: "tool_use"; name: string; input: unknown } => b.type === "tool_use"
  );
  if (!bloque || typeof bloque.input !== "object" || bloque.input === null) {
    return { intent: "otro", fechaPreferida: null, rangoHorarioPreferido: null };
  }

  const input = bloque.input as Record<string, unknown>;
  const intent = INTENTS_SOLICITUD.includes(input.intent as Intent)
    ? (input.intent as Intent)
    : "otro";
  const fechaPreferida = esFechaValida(input.fecha_preferida) && input.fecha_preferida >= params.hoyYMD
    ? input.fecha_preferida
    : null;
  const rangoHorarioPreferido = RANGOS_VALIDOS.includes(input.rango_horario_preferido as RangoHorarioPreferido)
    ? (input.rango_horario_preferido as RangoHorarioPreferido)
    : null;

  return { intent, fechaPreferida, rangoHorarioPreferido };
}

export type IntentSeleccion = "seleccion" | "cancelar" | "otro";

export interface SeleccionInterpretada {
  intent: IntentSeleccion;
  indiceSeleccionado: number | null;
}

const TOOL_INTERPRETAR_SELECCION: Anthropic.Tool = {
  name: "interpretar_seleccion",
  description:
    "El negocio ya le ofreció al cliente una lista de horarios disponibles. Interpreta la respuesta del cliente: si eligió uno de los horarios ofrecidos (y cuál), si ahora quiere cancelar, o si dijo algo distinto.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["seleccion", "cancelar", "otro"],
        description:
          "'seleccion' si el cliente eligió claramente uno de los horarios de la lista. 'cancelar' si pidió cancelar. 'otro' si no queda claro cuál eligió o pidió algo distinto (ej. otro día, otra pregunta).",
      },
      numero_elegido: {
        type: ["integer", "null"],
        description:
          "Número de la opción que el cliente eligió (empezando en 1, tal como se le mostró la lista al cliente), solo si intent es 'seleccion'. null en cualquier otro caso.",
      },
    },
    required: ["intent", "numero_elegido"],
  },
};

// Numerado desde 1: debe coincidir exactamente con cómo se le muestra la
// lista al cliente en el mensaje de WhatsApp (ver formatearOfertaHorarios en
// mensajes.ts), para que "el 2" del cliente y el número que interpreta Claude
// se refieran a la misma opción.
function construirSystemPromptSeleccion(horariosOfrecidos: string[]): string {
  const lista = horariosOfrecidos.map((h, i) => `${i + 1}: ${h}`).join("\n");
  return [
    "Eres el asistente de agendamiento de un negocio. Le ofreciste al cliente estos horarios, numerados igual que se los mostraste (número: fecha y hora local):",
    lista,
    "El cliente respondió por WhatsApp. Interpreta su respuesta usando la herramienta interpretar_seleccion.",
  ].join("\n");
}

/** Interpreta la respuesta del cliente cuando hay una lista de horarios ofrecidos pendiente. */
export async function interpretarSeleccion(
  client: ClienteClaude,
  params: { mensajeCliente: string; horariosOfrecidos: string[] }
): Promise<SeleccionInterpretada> {
  const respuesta = await client.messages.create({
    model: MODELO_HAIKU,
    max_tokens: 256,
    system: construirSystemPromptSeleccion(params.horariosOfrecidos),
    messages: [{ role: "user", content: params.mensajeCliente }],
    tools: [TOOL_INTERPRETAR_SELECCION],
    tool_choice: { type: "tool", name: "interpretar_seleccion" },
  });

  const bloque = respuesta.content.find(
    (b): b is { type: "tool_use"; name: string; input: unknown } => b.type === "tool_use"
  );
  if (!bloque || typeof bloque.input !== "object" || bloque.input === null) {
    return { intent: "otro", indiceSeleccionado: null };
  }

  const input = bloque.input as Record<string, unknown>;
  const intentesValidos: readonly IntentSeleccion[] = ["seleccion", "cancelar", "otro"];
  const intent = intentesValidos.includes(input.intent as IntentSeleccion)
    ? (input.intent as IntentSeleccion)
    : "otro";

  const numeroCrudo = input.numero_elegido;
  const numeroValido =
    intent === "seleccion" &&
    typeof numeroCrudo === "number" &&
    Number.isInteger(numeroCrudo) &&
    numeroCrudo >= 1 &&
    numeroCrudo <= params.horariosOfrecidos.length;

  return {
    intent,
    indiceSeleccionado: numeroValido ? (numeroCrudo as number) - 1 : null,
  };
}
