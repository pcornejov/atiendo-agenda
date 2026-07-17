// Módulo de venta de comida (plan Nivel 2): ver menú, hacer un pedido
// (con posibilidad de seguir agregando ítems y dejar un comentario),
// elegir retiro/despacho (pidiendo dirección si es despacho), confirmarlo,
// consultar su estado, cancelarlo. Mismo patrón que agendamiento.ts:
// "ofrecer y luego pedir confirmación explícita" antes de escribir nada en
// la base, para no crear un pedido por una mala interpretación de Claude.

import {
  interpretarPedido,
  interpretarConfirmacion,
  interpretarTipoEntrega,
  type SolicitudInterpretada,
} from "../nlu.ts";
import { guardarEstado, limpiarEstado } from "../conversacion.ts";
import { listarMenuDisponible, crearPedido, buscarPedidoActivo, cancelarPedidoActivo, type MenuItem } from "../pedido.ts";
import { armarListaMenu } from "../listaMenu.ts";
import {
  formatearMenu,
  formatearSinMenu,
  formatearPreguntaAlgoMas,
  formatearPreguntaComentario,
  formatearPreguntaDireccion,
  formatearPreguntaTipoEntrega,
  formatearRepetirPreguntaTipoEntrega,
  formatearResumenPedido,
  formatearRepetirConfirmacionPedido,
  formatearSinItemsValidos,
  formatearPedidoConfirmado,
  formatearPedidoCancelado,
  formatearSinPedidoParaCancelar,
  formatearMiPedido,
  formatearSinPedidoActivo,
  type TipoEntrega,
} from "../mensajes.ts";
import type { DefinicionModulo, ContextoModulo } from "./tipos.ts";

const CODIGO = "pedidos";
const ESTADO_ESPERANDO_MAS_ITEMS = "esperando_mas_items";
const ESTADO_ESPERANDO_COMENTARIO = "esperando_comentario";
const ESTADO_ESPERANDO_TIPO_ENTREGA = "esperando_tipo_entrega";
const ESTADO_ESPERANDO_DIRECCION = "esperando_direccion";
const ESTADO_ESPERANDO_CONFIRMACION = "esperando_confirmacion_pedido";
const MINUTOS_EXPIRACION_ESTADO = 15;

interface ItemContexto {
  menuItemId: number;
  nombre: string;
  cantidad: number;
  precioUnitarioClp: number;
}

interface ContextoItemsPendientes {
  items: ItemContexto[];
  totalClp: number;
}

interface ContextoConComentario extends ContextoItemsPendientes {
  comentario: string | null;
}

interface ContextoPedidoPendiente extends ContextoConComentario {
  tipoEntrega: TipoEntrega;
  direccionDespacho: string | null;
}

/** Interpreta un mensaje de texto libre contra el menú real y lo mapea a ItemContexto — usado tanto al armar el pedido inicial como al agregar más ítems. */
async function interpretarItemsPedido(
  claude: ContextoModulo["claude"],
  mensajeTexto: string,
  menu: MenuItem[]
): Promise<{ intent: "pedido" | "cancelar" | "otro"; items: ItemContexto[] }> {
  const interpretado = await interpretarPedido(claude, {
    mensajeCliente: mensajeTexto,
    menuDisponible: menu.map((m) => m.nombre),
  });

  const menuPorNombre = new Map(menu.map((m) => [m.nombre, m]));
  const items: ItemContexto[] = interpretado.items.map((item) => {
    const menuItem = menuPorNombre.get(item.nombre);
    // No debería pasar: interpretarPedido ya filtra contra este mismo
    // menú, pero si pasara, mejor un error explícito que un total mal
    // calculado por un ítem fantasma.
    if (!menuItem) throw new Error(`Ítem de menú inesperado: ${item.nombre}`);
    return {
      menuItemId: menuItem.id,
      nombre: menuItem.nombre,
      cantidad: item.cantidad,
      precioUnitarioClp: menuItem.precio_clp,
    };
  });

  return { intent: interpretado.intent, items };
}

/** Suma cantidades si el ítem nuevo ya estaba en el carrito, o lo agrega como línea nueva. */
function combinarItems(existentes: ItemContexto[], nuevos: ItemContexto[]): ItemContexto[] {
  const combinados = existentes.map((item) => ({ ...item }));
  for (const nuevo of nuevos) {
    const yaEnCarrito = combinados.find((item) => item.menuItemId === nuevo.menuItemId);
    if (yaEnCarrito) {
      yaEnCarrito.cantidad += nuevo.cantidad;
    } else {
      combinados.push(nuevo);
    }
  }
  return combinados;
}

function calcularTotal(items: ItemContexto[]): number {
  return items.reduce((acc, item) => acc + item.cantidad * item.precioUnitarioClp, 0);
}

const PATRON_RESPUESTA_NEGATIVA =
  /^(no|no,?\s*gracias|nada|nada\s+m[aá]s|ning[uú]no?a?|as[ií]\s+est[aá]\s+bien|est[aá]\s+bien\s+as[ií])[.!]?$/i;

/** Sin NLU: heurística chica para distinguir "no, nada" de un comentario real. Si es ambiguo, se guarda tal cual (no se pierde información). */
function esRespuestaNegativa(texto: string): boolean {
  return PATRON_RESPUESTA_NEGATIVA.test(texto.trim());
}

async function preguntarAlgoMas(
  ctx: ContextoModulo,
  negocioId: number,
  items: ItemContexto[],
  totalClp: number
): Promise<void> {
  await guardarEstado(
    ctx.db,
    negocioId,
    ctx.mensaje.clienteTelefono,
    `${CODIGO}:${ESTADO_ESPERANDO_MAS_ITEMS}`,
    { items, totalClp } satisfies ContextoItemsPendientes,
    new Date(ctx.ahoraUtc.getTime() + MINUTOS_EXPIRACION_ESTADO * 60000)
  );
  await ctx.enviar(formatearPreguntaAlgoMas(items, totalClp));
}

async function manejarIntent(solicitud: SolicitudInterpretada, ctx: ContextoModulo): Promise<boolean> {
  const { db, claude, negocio, mensaje, enviar, enviarLista } = ctx;

  if (solicitud.intent === "ver_menu") {
    const menu = await listarMenuDisponible(db, negocio.id);
    if (menu.length === 0) {
      await enviar(formatearSinMenu());
      return true;
    }
    const lista = armarListaMenu(menu);
    if (lista) {
      await enviarLista(lista);
    } else {
      // Demasiados ítems sin categorizar para entrar en una lista (más de
      // 10, ver listaMenu.ts) — cae al texto plano de siempre.
      await enviar(formatearMenu(menu));
    }
    return true;
  }

  if (solicitud.intent === "cancelar_pedido") {
    const resultado = await cancelarPedidoActivo(db, negocio.id, mensaje.clienteTelefono);
    if (resultado.ok) {
      await enviar(formatearPedidoCancelado());
    } else {
      await enviar(formatearSinPedidoParaCancelar());
    }
    return true;
  }

  if (solicitud.intent === "consultar_estado_pedido") {
    const pedido = await buscarPedidoActivo(db, negocio.id, mensaje.clienteTelefono);
    if (pedido) {
      await enviar(formatearMiPedido(pedido));
    } else {
      await enviar(formatearSinPedidoActivo());
    }
    return true;
  }

  if (solicitud.intent === "hacer_pedido") {
    const menu = await listarMenuDisponible(db, negocio.id);
    if (menu.length === 0) {
      await enviar(formatearSinMenu());
      return true;
    }

    const { items } = await interpretarItemsPedido(claude, mensaje.texto, menu);
    if (items.length === 0) {
      await enviar(formatearSinItemsValidos());
      return true;
    }

    await preguntarAlgoMas(ctx, negocio.id, items, calcularTotal(items));
    return true;
  }

  return false;
}

async function manejarEstadoPendiente(
  estadoSinPrefijo: string,
  contexto: unknown,
  ctx: ContextoModulo
): Promise<void> {
  const { db, claude, negocio, mensaje, ahoraUtc, enviar } = ctx;

  if (estadoSinPrefijo === ESTADO_ESPERANDO_MAS_ITEMS) {
    const pendiente = contexto as ContextoItemsPendientes;
    const menu = await listarMenuDisponible(db, negocio.id);
    const { intent, items: itemsNuevos } = await interpretarItemsPedido(claude, mensaje.texto, menu);

    if (intent === "cancelar") {
      await limpiarEstado(db, negocio.id, mensaje.clienteTelefono);
      await enviar(formatearPedidoCancelado());
      return;
    }

    if (itemsNuevos.length > 0) {
      const items = combinarItems(pendiente.items, itemsNuevos);
      await preguntarAlgoMas(ctx, negocio.id, items, calcularTotal(items));
      return;
    }

    // No se reconoció ningún ítem nuevo: se entiende como "no, nada más".
    await guardarEstado(
      db,
      negocio.id,
      mensaje.clienteTelefono,
      `${CODIGO}:${ESTADO_ESPERANDO_COMENTARIO}`,
      pendiente satisfies ContextoItemsPendientes,
      new Date(ahoraUtc.getTime() + MINUTOS_EXPIRACION_ESTADO * 60000)
    );
    await enviar(formatearPreguntaComentario());
    return;
  }

  if (estadoSinPrefijo === ESTADO_ESPERANDO_COMENTARIO) {
    const pendiente = contexto as ContextoItemsPendientes;
    const texto = mensaje.texto.trim();
    const comentario = esRespuestaNegativa(texto) ? null : texto;

    await guardarEstado(
      db,
      negocio.id,
      mensaje.clienteTelefono,
      `${CODIGO}:${ESTADO_ESPERANDO_TIPO_ENTREGA}`,
      { ...pendiente, comentario } satisfies ContextoConComentario,
      new Date(ahoraUtc.getTime() + MINUTOS_EXPIRACION_ESTADO * 60000)
    );
    await enviar(formatearPreguntaTipoEntrega());
    return;
  }

  if (estadoSinPrefijo === ESTADO_ESPERANDO_TIPO_ENTREGA) {
    const pendiente = contexto as ContextoConComentario;
    const respuesta = await interpretarTipoEntrega(claude, { mensajeCliente: mensaje.texto });

    if (respuesta.intent === "cancelar") {
      await limpiarEstado(db, negocio.id, mensaje.clienteTelefono);
      await enviar(formatearPedidoCancelado());
      return;
    }

    if (respuesta.intent === "retiro") {
      await guardarEstado(
        db,
        negocio.id,
        mensaje.clienteTelefono,
        `${CODIGO}:${ESTADO_ESPERANDO_CONFIRMACION}`,
        { ...pendiente, tipoEntrega: "retiro", direccionDespacho: null } satisfies ContextoPedidoPendiente,
        new Date(ahoraUtc.getTime() + MINUTOS_EXPIRACION_ESTADO * 60000)
      );
      await enviar(formatearResumenPedido(pendiente.items, pendiente.totalClp, "retiro", pendiente.comentario, null));
      return;
    }

    if (respuesta.intent === "despacho") {
      await guardarEstado(
        db,
        negocio.id,
        mensaje.clienteTelefono,
        `${CODIGO}:${ESTADO_ESPERANDO_DIRECCION}`,
        pendiente satisfies ContextoConComentario,
        new Date(ahoraUtc.getTime() + MINUTOS_EXPIRACION_ESTADO * 60000)
      );
      await enviar(formatearPreguntaDireccion());
      return;
    }

    // "otro": no quedó claro — se repite la pregunta (el estado sigue vigente).
    await enviar(formatearRepetirPreguntaTipoEntrega());
    return;
  }

  if (estadoSinPrefijo === ESTADO_ESPERANDO_DIRECCION) {
    const pendiente = contexto as ContextoConComentario;
    const direccionDespacho = mensaje.texto.trim();

    await guardarEstado(
      db,
      negocio.id,
      mensaje.clienteTelefono,
      `${CODIGO}:${ESTADO_ESPERANDO_CONFIRMACION}`,
      { ...pendiente, tipoEntrega: "despacho", direccionDespacho } satisfies ContextoPedidoPendiente,
      new Date(ahoraUtc.getTime() + MINUTOS_EXPIRACION_ESTADO * 60000)
    );
    await enviar(
      formatearResumenPedido(pendiente.items, pendiente.totalClp, "despacho", pendiente.comentario, direccionDespacho)
    );
    return;
  }

  if (estadoSinPrefijo === ESTADO_ESPERANDO_CONFIRMACION) {
    const pendiente = contexto as ContextoPedidoPendiente;
    const confirmacion = await interpretarConfirmacion(claude, { mensajeCliente: mensaje.texto });

    if (confirmacion.intent === "cancelar") {
      await limpiarEstado(db, negocio.id, mensaje.clienteTelefono);
      await enviar(formatearPedidoCancelado());
      return;
    }

    if (confirmacion.intent === "confirmar") {
      const resultado = await crearPedido(db, {
        negocioId: negocio.id,
        clienteTelefono: mensaje.clienteTelefono,
        clienteNombre: mensaje.clienteNombrePerfil,
        items: pendiente.items.map((item) => ({
          menuItemId: item.menuItemId,
          cantidad: item.cantidad,
          precioUnitarioClp: item.precioUnitarioClp,
        })),
        totalClp: pendiente.totalClp,
        tipoEntrega: pendiente.tipoEntrega,
        direccionDespacho: pendiente.direccionDespacho,
        notas: pendiente.comentario,
      });
      await limpiarEstado(db, negocio.id, mensaje.clienteTelefono);
      await enviar(formatearPedidoConfirmado(resultado.id, pendiente.totalClp));
      return;
    }

    // "otro": no quedó claro — se repite el resumen (el estado sigue vigente).
    await enviar(
      formatearRepetirConfirmacionPedido(
        pendiente.items,
        pendiente.totalClp,
        pendiente.tipoEntrega,
        pendiente.comentario,
        pendiente.direccionDespacho
      )
    );
  }
}

export const moduloPedidos: DefinicionModulo = {
  codigo: CODIGO,
  intents: [
    { nombre: "ver_menu", descripcion: "el cliente pregunta qué hay disponible para pedir o pide ver el menú." },
    { nombre: "hacer_pedido", descripcion: "el cliente especifica qué quiere pedir (aunque sea parcial)." },
    {
      nombre: "consultar_estado_pedido",
      descripcion: "el cliente pregunta por el estado de un pedido que ya hizo.",
    },
    { nombre: "cancelar_pedido", descripcion: "el cliente pide cancelar un pedido." },
  ],
  sugerenciaFallback: "Escríbeme qué quieres pedir, o \"ver menú\" para ver las opciones.",
  manejarIntent,
  manejarEstadoPendiente,
};
