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

// El intent ya no es un enum fijo: lo componen los módulos activos del
// negocio (ver src/lib/modulos/) + 'otro'. Cada módulo aporta sus propios
// nombres de intent con su descripción; interpretarSolicitud arma la tool de
// Claude dinámicamente a partir de esa lista.
export type Intent = string;
export type RangoHorarioPreferido = "manana" | "tarde" | "noche";

export interface DescripcionIntent {
  nombre: string;
  descripcion: string;
}

export interface SolicitudInterpretada {
  intent: Intent;
  fechaPreferida: string | null; // 'YYYY-MM-DD'
  rangoHorarioPreferido: RangoHorarioPreferido | null;
}

const INTENT_OTRO: DescripcionIntent = {
  nombre: "otro",
  descripcion: "saludos, agradecimientos, o cualquier mensaje que no encaje en las intenciones anteriores.",
};

function construirToolInterpretarSolicitud(intentsDisponibles: DescripcionIntent[]): Anthropic.Tool {
  const todos = [...intentsDisponibles, INTENT_OTRO];
  return {
    name: "interpretar_solicitud",
    description:
      "Extrae la intención y la preferencia de fecha/hora del mensaje de un cliente que le escribe por WhatsApp a un negocio.",
    input_schema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: todos.map((i) => i.nombre),
          description: todos.map((i) => `'${i.nombre}': ${i.descripcion}`).join(" "),
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
}

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
    // Intents de los módulos activos del negocio (ver src/lib/modulos/) —
    // 'otro' se agrega siempre y no hace falta incluirlo acá.
    intentsDisponibles: DescripcionIntent[];
  }
): Promise<SolicitudInterpretada> {
  const nombresValidos = new Set([...params.intentsDisponibles.map((i) => i.nombre), INTENT_OTRO.nombre]);

  const respuesta = await client.messages.create({
    model: MODELO_HAIKU,
    max_tokens: 256,
    system: construirSystemPromptSolicitud(params),
    messages: [{ role: "user", content: params.mensajeCliente }],
    tools: [construirToolInterpretarSolicitud(params.intentsDisponibles)],
    tool_choice: { type: "tool", name: "interpretar_solicitud" },
  });

  const bloque = respuesta.content.find(
    (b): b is { type: "tool_use"; name: string; input: unknown } => b.type === "tool_use"
  );
  if (!bloque || typeof bloque.input !== "object" || bloque.input === null) {
    return { intent: "otro", fechaPreferida: null, rangoHorarioPreferido: null };
  }

  const input = bloque.input as Record<string, unknown>;
  const intent = typeof input.intent === "string" && nombresValidos.has(input.intent) ? input.intent : "otro";
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

export type IntentPedido = "pedido" | "cancelar" | "otro";

export interface ItemPedidoInterpretado {
  nombre: string;
  cantidad: number;
}

export interface PedidoInterpretado {
  intent: IntentPedido;
  items: ItemPedidoInterpretado[]; // vacío salvo que intent sea 'pedido'
}

const TOOL_INTERPRETAR_PEDIDO: Anthropic.Tool = {
  name: "interpretar_pedido",
  description:
    "El cliente le escribe a un negocio de comida por WhatsApp. Extrae qué ítems del menú pidió y en qué cantidad.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["pedido", "cancelar", "otro"],
        description:
          "'pedido' si el cliente especificó qué quiere pedir (aunque sea parcial). 'cancelar' si quiere cancelar un pedido. 'otro' si no se entiende o pregunta algo distinto.",
      },
      items: {
        type: "array",
        description:
          "Ítems pedidos. El nombre debe coincidir EXACTAMENTE con uno de los del menú disponible (no inventar ítems que no estén en la lista) — si el cliente pide algo que no está en el menú, no lo incluyas acá.",
        items: {
          type: "object",
          properties: {
            nombre: { type: "string" },
            cantidad: { type: "integer" },
          },
          required: ["nombre", "cantidad"],
        },
      },
    },
    required: ["intent", "items"],
  },
};

function construirSystemPromptPedido(menuDisponible: string[]): string {
  const lista = menuDisponible.map((nombre) => `- ${nombre}`).join("\n");
  return [
    "Eres el asistente de pedidos de un negocio de comida. Este es el menú disponible:",
    lista,
    "El cliente te escribió por WhatsApp para hacer un pedido. Interpreta su mensaje usando la herramienta interpretar_pedido.",
    "Usa únicamente nombres de ítems que estén EXACTAMENTE en la lista del menú de arriba.",
  ].join("\n");
}

/** Interpreta un mensaje del cliente pidiendo comida, contra el menú real disponible. */
export async function interpretarPedido(
  client: ClienteClaude,
  params: { mensajeCliente: string; menuDisponible: string[] }
): Promise<PedidoInterpretado> {
  const respuesta = await client.messages.create({
    model: MODELO_HAIKU,
    max_tokens: 512,
    system: construirSystemPromptPedido(params.menuDisponible),
    messages: [{ role: "user", content: params.mensajeCliente }],
    tools: [TOOL_INTERPRETAR_PEDIDO],
    tool_choice: { type: "tool", name: "interpretar_pedido" },
  });

  const bloque = respuesta.content.find(
    (b): b is { type: "tool_use"; name: string; input: unknown } => b.type === "tool_use"
  );
  if (!bloque || typeof bloque.input !== "object" || bloque.input === null) {
    return { intent: "otro", items: [] };
  }

  const input = bloque.input as Record<string, unknown>;
  const intentsValidos: readonly IntentPedido[] = ["pedido", "cancelar", "otro"];
  const intent = intentsValidos.includes(input.intent as IntentPedido) ? (input.intent as IntentPedido) : "otro";

  const menuValido = new Set(params.menuDisponible);
  const itemsCrudos = Array.isArray(input.items) ? input.items : [];
  const items: ItemPedidoInterpretado[] = itemsCrudos
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({ nombre: String(item.nombre), cantidad: Number(item.cantidad) }))
    .filter((item) => menuValido.has(item.nombre) && Number.isInteger(item.cantidad) && item.cantidad > 0);

  return { intent, items: intent === "pedido" ? items : [] };
}

export type IntentConfirmacion = "confirmar" | "cancelar" | "otro";

const TOOL_INTERPRETAR_CONFIRMACION: Anthropic.Tool = {
  name: "interpretar_confirmacion",
  description:
    "El negocio le mostró al cliente un resumen y le pidió que confirme. Interpreta si el cliente confirma, cancela, o dice algo distinto.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["confirmar", "cancelar", "otro"],
        description:
          "'confirmar' si el cliente aprueba tal como se le mostró (ej. 'sí', 'dale', 'confirmo'). 'cancelar' si no lo quiere. 'otro' si no queda claro o pide un cambio.",
      },
    },
    required: ["intent"],
  },
};

/** Interpreta una respuesta de sí/no/cancelar a una confirmación pendiente. */
export async function interpretarConfirmacion(
  client: ClienteClaude,
  params: { mensajeCliente: string }
): Promise<{ intent: IntentConfirmacion }> {
  const respuesta = await client.messages.create({
    model: MODELO_HAIKU,
    max_tokens: 128,
    system:
      "Eres el asistente de un negocio. Le pediste al cliente que confirme algo pendiente. El cliente respondió por WhatsApp — interpreta su respuesta usando la herramienta interpretar_confirmacion.",
    messages: [{ role: "user", content: params.mensajeCliente }],
    tools: [TOOL_INTERPRETAR_CONFIRMACION],
    tool_choice: { type: "tool", name: "interpretar_confirmacion" },
  });

  const bloque = respuesta.content.find(
    (b): b is { type: "tool_use"; name: string; input: unknown } => b.type === "tool_use"
  );
  if (!bloque || typeof bloque.input !== "object" || bloque.input === null) {
    return { intent: "otro" };
  }

  const input = bloque.input as Record<string, unknown>;
  const intentsValidos: readonly IntentConfirmacion[] = ["confirmar", "cancelar", "otro"];
  return { intent: intentsValidos.includes(input.intent as IntentConfirmacion) ? (input.intent as IntentConfirmacion) : "otro" };
}

export type TipoEntrega = "retiro" | "despacho" | "cancelar" | "otro";

const TOOL_INTERPRETAR_TIPO_ENTREGA: Anthropic.Tool = {
  name: "interpretar_tipo_entrega",
  description:
    "El negocio le preguntó al cliente si va a retirar su pedido en el local o si prefiere que se lo despachen. Interpreta la respuesta.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["retiro", "despacho", "cancelar", "otro"],
        description:
          "'retiro' si el cliente va a pasar a buscarlo. 'despacho' si quiere que se lo lleven/envíen. 'cancelar' si en este punto prefiere cancelar el pedido. 'otro' si no queda claro.",
      },
    },
    required: ["intent"],
  },
};

/** Interpreta si el cliente eligió retiro en el local o despacho. */
export async function interpretarTipoEntrega(
  client: ClienteClaude,
  params: { mensajeCliente: string }
): Promise<{ intent: TipoEntrega }> {
  const respuesta = await client.messages.create({
    model: MODELO_HAIKU,
    max_tokens: 128,
    system:
      "Eres el asistente de un negocio de comida. Le preguntaste al cliente si retira su pedido en el local o si prefiere despacho. El cliente respondió por WhatsApp — interpreta su respuesta usando la herramienta interpretar_tipo_entrega.",
    messages: [{ role: "user", content: params.mensajeCliente }],
    tools: [TOOL_INTERPRETAR_TIPO_ENTREGA],
    tool_choice: { type: "tool", name: "interpretar_tipo_entrega" },
  });

  const bloque = respuesta.content.find(
    (b): b is { type: "tool_use"; name: string; input: unknown } => b.type === "tool_use"
  );
  if (!bloque || typeof bloque.input !== "object" || bloque.input === null) {
    return { intent: "otro" };
  }

  const input = bloque.input as Record<string, unknown>;
  const intentsValidos: readonly TipoEntrega[] = ["retiro", "despacho", "cancelar", "otro"];
  return { intent: intentsValidos.includes(input.intent as TipoEntrega) ? (input.intent as TipoEntrega) : "otro" };
}
