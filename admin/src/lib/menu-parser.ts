// Lee una carta (foto y/o PDF) y extrae los ítems con nombre/descripción/
// precio usando Claude. Es una acción puntual por negocio (no un hot path
// por mensaje como el NLU del bot), así que usa Sonnet en vez de Haiku,
// priorizando precisión de lectura sobre costo/latencia.
//
// Mismo patrón que src/lib/nlu.ts del bot: una interfaz mínima del cliente
// de Anthropic para poder testear sin red, y separación entre "armar la
// llamada" y "validar/sanear la respuesta".

import type Anthropic from "@anthropic-ai/sdk";

export interface ClienteClaude {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user"; content: Anthropic.ContentBlockParam[] }>;
      tools: Anthropic.Tool[];
      tool_choice: Anthropic.ToolChoiceTool;
    }): Promise<{ content: Array<{ type: string; name?: string; input?: unknown }> }>;
  };
}

export const MODELO_SONNET = "claude-sonnet-5";

export type MediaTypeImagen = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export type ArchivoCarta =
  | { tipo: "imagen"; mediaType: MediaTypeImagen; base64: string }
  | { tipo: "pdf"; base64: string };

export interface ItemMenuExtraido {
  nombre: string;
  descripcion: string | null;
  precioClp: number;
}

const TOOL_EXTRAER_ITEMS: Anthropic.Tool = {
  name: "extraer_items_menu",
  description:
    "Extrae los ítems de comida/bebida de la carta de un negocio (foto o PDF) con su nombre, una descripción breve si aparece (ej. ingredientes, sabores), y el precio en pesos chilenos (sin el símbolo $ ni puntos de miles).",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "Un ítem por cada producto distinto que aparece en la carta, en el orden en que aparecen.",
        items: {
          type: "object",
          properties: {
            nombre: { type: "string" },
            descripcion: {
              type: ["string", "null"],
              description: "Detalle breve si la carta lo menciona (ingredientes, sabores, tamaño). null si no hay.",
            },
            precio_clp: { type: "integer" },
          },
          required: ["nombre", "descripcion", "precio_clp"],
        },
      },
    },
    required: ["items"],
  },
};

function construirContentBlocks(archivos: ArchivoCarta[]): Anthropic.ContentBlockParam[] {
  const bloques: Anthropic.ContentBlockParam[] = archivos.map((archivo) =>
    archivo.tipo === "imagen"
      ? { type: "image", source: { type: "base64", media_type: archivo.mediaType, data: archivo.base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: archivo.base64 } }
  );
  bloques.push({
    type: "text",
    text: "Esta es la carta/menú de un negocio. Extrae todos los ítems que puedas leer usando la herramienta extraer_items_menu.",
  });
  return bloques;
}

/** Lee una o más fotos/PDF de una carta y devuelve los ítems que Claude pudo extraer, ya validados. */
export async function extraerItemsDeCarta(
  client: ClienteClaude,
  archivos: ArchivoCarta[]
): Promise<ItemMenuExtraido[]> {
  if (archivos.length === 0) return [];

  const respuesta = await client.messages.create({
    model: MODELO_SONNET,
    max_tokens: 4096,
    system:
      "Eres un asistente que ayuda a un negocio a digitalizar su carta/menú. Lee la imagen o PDF que te pasan y extrae cada producto con su nombre, descripción (si la hay) y precio, usando la herramienta extraer_items_menu.",
    messages: [{ role: "user", content: construirContentBlocks(archivos) }],
    tools: [TOOL_EXTRAER_ITEMS],
    tool_choice: { type: "tool", name: "extraer_items_menu" },
  });

  const bloque = respuesta.content.find(
    (b): b is { type: "tool_use"; name: string; input: unknown } => b.type === "tool_use"
  );
  if (!bloque || typeof bloque.input !== "object" || bloque.input === null) {
    return [];
  }

  const input = bloque.input as Record<string, unknown>;
  const itemsCrudos = Array.isArray(input.items) ? input.items : [];

  return itemsCrudos
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      nombre: typeof item.nombre === "string" ? item.nombre.trim() : "",
      descripcion: typeof item.descripcion === "string" && item.descripcion.trim().length > 0 ? item.descripcion.trim() : null,
      precioClp: Number(item.precio_clp),
    }))
    .filter((item) => item.nombre.length > 0 && Number.isInteger(item.precioClp) && item.precioClp >= 0);
}
