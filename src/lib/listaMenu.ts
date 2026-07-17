// Construye y procesa el menú como mensaje de lista interactiva de
// WhatsApp, en vez del texto plano de formatearMenu. WhatsApp permite máximo
// 10 filas EN TOTAL por mensaje de lista (sumando todas las secciones) — por
// eso, si hay más de una categoría, se manda primero un selector de
// categorías, y recién al elegir una se manda una segunda lista con sus
// ítems (categoría → ítems), en vez de una lista plana que podría no entrar.

import { listarMenuDisponible, type MenuItem } from "./pedido.ts";
import type { EnviarListaParams } from "./whatsapp.ts";

const MAX_FILAS = 10;
const SIN_CATEGORIA = "Menú";

type ParametrosLista = Omit<EnviarListaParams, "phoneNumberId" | "token" | "para">;

function agruparPorCategoria(items: MenuItem[]): Map<string, MenuItem[]> {
  const grupos = new Map<string, MenuItem[]>();
  for (const item of items) {
    const categoria = item.categoria?.trim() || SIN_CATEGORIA;
    const lista = grupos.get(categoria) ?? [];
    lista.push(item);
    grupos.set(categoria, lista);
  }
  return grupos;
}

function filaDeItem(item: MenuItem) {
  const precio = `$${item.precio_clp.toLocaleString("es-CL")}`;
  const descripcion = item.descripcion ? `${precio} · ${item.descripcion}` : precio;
  return { id: `item:${item.id}`, titulo: item.nombre.slice(0, 24), descripcion: descripcion.slice(0, 72) };
}

function listaDeCategorias(grupos: Map<string, MenuItem[]>): ParametrosLista {
  return {
    cuerpo: "Este es nuestro menú, elige una categoría:",
    textoBoton: "Ver menú",
    secciones: [
      {
        titulo: "Categorías",
        filas: [...grupos.entries()].map(([categoria, items]) => ({
          id: `cat:${categoria}`,
          titulo: categoria.slice(0, 24),
          descripcion: `${items.length} ${items.length === 1 ? "opción" : "opciones"}`,
        })),
      },
    ],
  };
}

function listaDeItems(categoria: string, items: MenuItem[]): ParametrosLista {
  return {
    cuerpo: categoria === SIN_CATEGORIA ? "Elige un producto:" : `${categoria} — elige un producto:`,
    textoBoton: "Ver opciones",
    secciones: [{ titulo: categoria.slice(0, 24), filas: items.map(filaDeItem) }],
  };
}

/**
 * Arma los parámetros para enviarListaWhatsApp, o null si el menú no entra
 * en una lista (sin categorizar y con más de 10 ítems, o más de 10
 * categorías) — el llamador debe caer al texto plano (formatearMenu) en ese caso.
 */
export function armarListaMenu(items: MenuItem[]): ParametrosLista | null {
  if (items.length === 0) return null;
  const grupos = agruparPorCategoria(items);

  if (grupos.size === 1) {
    const [[categoria, itemsUnicos]] = grupos;
    if (itemsUnicos.length > MAX_FILAS) return null;
    return listaDeItems(categoria, itemsUnicos);
  }

  if (grupos.size > MAX_FILAS) return null;
  return listaDeCategorias(grupos);
}

export interface ResultadoListaEntrante {
  /** true si ya se resolvió acá (se mandó la lista de ítems, o el id no se reconoció) — el llamador no debe hacer nada más. */
  manejado: boolean;
  /** Si viene, el llamador debe tratarlo como si el cliente lo hubiera escrito (seguir el camino normal de hacer_pedido). */
  nombreItemSeleccionado?: string;
}

/** Stateless: el id de cada fila ya trae toda la info necesaria (categoría o menu_item_id), no hace falta conversaciones_estado. */
export async function procesarListaEntrante(params: {
  db: D1Database;
  negocioId: number;
  idFila: string;
  enviarLista: (parametros: ParametrosLista) => Promise<void>;
}): Promise<ResultadoListaEntrante> {
  const { idFila } = params;

  if (idFila.startsWith("cat:")) {
    const categoria = idFila.slice("cat:".length);
    const items = await listarMenuDisponible(params.db, params.negocioId);
    const itemsCategoria = items.filter((item) => (item.categoria?.trim() || SIN_CATEGORIA) === categoria);
    if (itemsCategoria.length > 0) {
      await params.enviarLista(listaDeItems(categoria, itemsCategoria));
    }
    return { manejado: true };
  }

  if (idFila.startsWith("item:")) {
    const itemId = Number(idFila.slice("item:".length));
    const items = await listarMenuDisponible(params.db, params.negocioId);
    const item = items.find((i) => i.id === itemId);
    if (!item) return { manejado: true }; // ya no existe/disponible
    return { manejado: false, nombreItemSeleccionado: item.nombre };
  }

  return { manejado: true }; // id no reconocido
}
