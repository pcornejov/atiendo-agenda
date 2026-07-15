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
    "Respondé con el número de la opción que prefieras.",
  ].join("\n");
}

export function formatearRepetirOpciones(slots: SlotDisponible[], servicioNombre: string): string {
  const lineas = slots.map((s, i) => `${i + 1}) ${formatearFechaLegible(s.inicioLocal)}`);
  return [
    "No entendí cuál preferís. Estas son las opciones de nuevo:",
    ...lineas,
    "",
    "Respondé con el número de la opción, o escribí \"cancelar\" si ya no la necesitás.",
  ].join("\n");
}

export function formatearSinHorarios(): string {
  return "Por ahora no tengo horarios disponibles en esas fechas. ¿Querés que busque otro día?";
}

export function formatearConfirmacion(slot: SlotDisponible, servicioNombre: string): string {
  return `¡Listo! Quedaste agendado para ${servicioNombre} el ${formatearFechaLegible(slot.inicioLocal)}. Te voy a escribir 1 hora antes para recordarte.`;
}

export function formatearSlotYaNoDisponible(): string {
  return "Uy, justo se acaba de ocupar ese horario. ¿Querés que te muestre otras opciones?";
}

export function formatearCancelacionExitosa(slot: { inicioLocal: string }): string {
  return `Listo, cancelé tu cita del ${formatearFechaLegible(slot.inicioLocal)}.`;
}

export function formatearSinCitaParaCancelar(): string {
  return "No encontré ninguna cita activa a tu nombre para cancelar.";
}

export function formatearFallback(servicioNombre: string): string {
  return `¡Hola! Soy el asistente de agendamiento para ${servicioNombre}. Escribime qué día y horario te gustaría, o "cancelar" si querés cancelar una cita.`;
}
