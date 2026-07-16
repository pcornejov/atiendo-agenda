// Plantillas de texto para las respuestas de WhatsApp. Centralizadas acá para
// poder ajustar el tono/redacción sin tocar la lógica del flujo.

import type { SlotDisponible } from "./disponibilidad.ts";
import { diaSemanaDeFecha, nombreDiaSemana } from "./tz.ts";

function formatearFechaLegible(inicioLocal: string): string {
  // '2026-07-16 10:00' -> 'jueves 16/07 10:00'
  const [fechaYMD, horaHHMM] = inicioLocal.split(" ");
  const [, mes, diaNum] = fechaYMD.split("-");
  const dia = nombreDiaSemana(diaSemanaDeFecha(fechaYMD));
  return `${dia} ${diaNum}/${mes} ${horaHHMM}`;
}

/**
 * Numera las opciones empezando en 1 — debe coincidir con la numeración que
 * usa interpretarSeleccion en nlu.ts para que "el 2" del cliente y el índice
 * que interpreta Claude se refieran a la misma opción.
 */
export function formatearOfertaHorarios(slots: SlotDisponible[], servicioNombre: string): string {
  const lineas = slots.map((s, i) => `${i + 1}) ${formatearFechaLegible(s.inicioLocal)}`);
  return [
    `Tengo estos horarios disponibles para ${servicioNombre}:`,
    ...lineas,
    "",
    "Responde con el número de la opción que prefieras.",
  ].join("\n");
}

export function formatearRepetirOpciones(slots: SlotDisponible[], servicioNombre: string): string {
  const lineas = slots.map((s, i) => `${i + 1}) ${formatearFechaLegible(s.inicioLocal)}`);
  return [
    "No entendí cuál prefieres. Estas son las opciones de nuevo:",
    ...lineas,
    "",
    "Responde con el número de la opción, o escribe \"cancelar\" si ya no la necesitas.",
  ].join("\n");
}

export function formatearSinHorarios(): string {
  return "Por ahora no tengo horarios disponibles en esas fechas. ¿Quieres que busque otro día?";
}

export function formatearConfirmacion(slot: SlotDisponible, servicioNombre: string): string {
  return `¡Listo! Quedaste agendado para ${servicioNombre} el ${formatearFechaLegible(slot.inicioLocal)}. Te voy a escribir 1 hora antes para recordarte.`;
}

export function formatearSlotYaNoDisponible(): string {
  return "Uy, justo se acaba de ocupar ese horario. ¿Quieres que te muestre otras opciones?";
}

export function formatearCancelacionExitosa(slot: { inicioLocal: string }): string {
  return `Listo, cancelé tu cita del ${formatearFechaLegible(slot.inicioLocal)}.`;
}

export function formatearSinCitaParaCancelar(): string {
  return "No encontré ninguna cita activa a tu nombre para cancelar.";
}

export function formatearMiCita(cita: { inicioLocal: string }, servicioNombre: string): string {
  return `Tienes agendado ${servicioNombre} para el ${formatearFechaLegible(cita.inicioLocal)}.`;
}

export function formatearSinCitaParaConsultar(): string {
  return "No encontré ninguna cita activa a tu nombre. ¿Quieres que te muestre horarios disponibles?";
}

/**
 * `sugerencias` viene de los módulos activos del negocio (una línea por
 * módulo, ver DefinicionModulo.sugerenciaFallback) — así el mensaje no
 * asume que el negocio solo agenda horas cuando también puede tener, por
 * ejemplo, el módulo de pedidos activo.
 */
export function formatearFallback(negocioNombre: string, sugerencias: string[]): string {
  return [`¡Hola! Soy el asistente de ${negocioNombre}.`, ...sugerencias].join(" ");
}

export function formatearMenu(items: Array<{ nombre: string; precio_clp: number }>): string {
  const lineas = items.map((i) => `- ${i.nombre} — $${i.precio_clp.toLocaleString("es-CL")}`);
  return ["Este es nuestro menú:", ...lineas, "", "Dime qué quieres pedir y en qué cantidad."].join("\n");
}

export function formatearSinMenu(): string {
  return "Por ahora no tenemos ítems disponibles en el menú.";
}

interface ItemResumen {
  nombre: string;
  cantidad: number;
  precioUnitarioClp: number;
}

function formatearLineasPedido(items: ItemResumen[]): string[] {
  return items.map((i) => `- ${i.cantidad}x ${i.nombre} — $${(i.cantidad * i.precioUnitarioClp).toLocaleString("es-CL")}`);
}

export function formatearResumenPedido(items: ItemResumen[], totalClp: number): string {
  return [
    "Tu pedido:",
    ...formatearLineasPedido(items),
    `Total: $${totalClp.toLocaleString("es-CL")}`,
    "",
    "¿Confirmas el pedido?",
  ].join("\n");
}

export function formatearRepetirConfirmacionPedido(items: ItemResumen[], totalClp: number): string {
  return [
    "No entendí tu respuesta. Tu pedido pendiente es:",
    ...formatearLineasPedido(items),
    `Total: $${totalClp.toLocaleString("es-CL")}`,
    "",
    "Responde \"sí\" para confirmar, o \"cancelar\" si ya no lo quieres.",
  ].join("\n");
}

export function formatearSinItemsValidos(): string {
  return "No reconocí ningún ítem de nuestro menú en tu mensaje. ¿Puedes decirme qué quieres pedir?";
}

export function formatearPedidoConfirmado(pedidoId: number, totalClp: number): string {
  return `¡Listo! Tu pedido #${pedidoId} quedó confirmado por un total de $${totalClp.toLocaleString("es-CL")}. Te avisamos cuando esté listo.`;
}

export function formatearPedidoCancelado(): string {
  return "Listo, cancelé tu pedido.";
}

export function formatearSinPedidoParaCancelar(): string {
  return "No encontré ningún pedido activo a tu nombre para cancelar.";
}

export function formatearMiPedido(pedido: { id: number; estado: string; total_clp: number }): string {
  const estados: Record<string, string> = {
    pendiente: "pendiente de confirmar",
    confirmado: "confirmado",
    preparando: "en preparación",
    listo: "listo para retirar/entregar",
  };
  const estadoTexto = estados[pedido.estado] ?? pedido.estado;
  return `Tu pedido #${pedido.id} está ${estadoTexto}. Total: $${pedido.total_clp.toLocaleString("es-CL")}.`;
}

export function formatearSinPedidoActivo(): string {
  return "No encontré ningún pedido activo a tu nombre.";
}
