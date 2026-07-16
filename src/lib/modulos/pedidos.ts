// Módulo de venta de comida (plan Nivel 2): ver menú, hacer un pedido, elegir
// retiro/despacho, confirmarlo, consultar su estado, cancelarlo. Mismo
// patrón que agendamiento.ts: "ofrecer y luego pedir confirmación explícita"
// antes de escribir nada en la base, para no crear un pedido por una mala
// interpretación de Claude.

import {
  interpretarPedido,
  interpretarConfirmacion,
  interpretarTipoEntrega,
  type SolicitudInterpretada,
} from "../nlu.ts";
import { guardarEstado, limpiarEstado } from "../conversacion.ts";
import { listarMenuDisponible, crearPedido, buscarPedidoActivo, cancelarPedidoActivo } from "../pedido.ts";
import {
  formatearMenu,
  formatearSinMenu,
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
const ESTADO_ESPERANDO_TIPO_ENTREGA = "esperando_tipo_entrega";
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

interface ContextoPedidoPendiente extends ContextoItemsPendientes {
  tipoEntrega: TipoEntrega;
}

async function manejarIntent(solicitud: SolicitudInterpretada, ctx: ContextoModulo): Promise<boolean> {
  const { db, claude, negocio, mensaje, ahoraUtc, enviar } = ctx;

  if (solicitud.intent === "ver_menu") {
    const menu = await listarMenuDisponible(db, negocio.id);
    if (menu.length === 0) {
      await enviar(formatearSinMenu());
    } else {
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

    const interpretado = await interpretarPedido(claude, {
      mensajeCliente: mensaje.texto,
      menuDisponible: menu.map((m) => m.nombre),
    });
    if (interpretado.items.length === 0) {
      await enviar(formatearSinItemsValidos());
      return true;
    }

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
    const totalClp = items.reduce((acc, item) => acc + item.cantidad * item.precioUnitarioClp, 0);

    await guardarEstado(
      db,
      negocio.id,
      mensaje.clienteTelefono,
      `${CODIGO}:${ESTADO_ESPERANDO_TIPO_ENTREGA}`,
      { items, totalClp } satisfies ContextoItemsPendientes,
      new Date(ahoraUtc.getTime() + MINUTOS_EXPIRACION_ESTADO * 60000)
    );
    await enviar(formatearPreguntaTipoEntrega());
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

  if (estadoSinPrefijo === ESTADO_ESPERANDO_TIPO_ENTREGA) {
    const pendiente = contexto as ContextoItemsPendientes;
    const respuesta = await interpretarTipoEntrega(claude, { mensajeCliente: mensaje.texto });

    if (respuesta.intent === "cancelar") {
      await limpiarEstado(db, negocio.id, mensaje.clienteTelefono);
      await enviar(formatearPedidoCancelado());
      return;
    }

    if (respuesta.intent === "retiro" || respuesta.intent === "despacho") {
      await guardarEstado(
        db,
        negocio.id,
        mensaje.clienteTelefono,
        `${CODIGO}:${ESTADO_ESPERANDO_CONFIRMACION}`,
        { ...pendiente, tipoEntrega: respuesta.intent } satisfies ContextoPedidoPendiente,
        new Date(ahoraUtc.getTime() + MINUTOS_EXPIRACION_ESTADO * 60000)
      );
      await enviar(formatearResumenPedido(pendiente.items, pendiente.totalClp, respuesta.intent));
      return;
    }

    // "otro": no quedó claro — se repite la pregunta (el estado sigue vigente).
    await enviar(formatearRepetirPreguntaTipoEntrega());
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
      });
      await limpiarEstado(db, negocio.id, mensaje.clienteTelefono);
      await enviar(formatearPedidoConfirmado(resultado.id, pendiente.totalClp));
      return;
    }

    // "otro": no quedó claro — se repite el resumen (el estado sigue vigente).
    await enviar(formatearRepetirConfirmacionPedido(pendiente.items, pendiente.totalClp, pendiente.tipoEntrega));
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
