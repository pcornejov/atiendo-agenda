/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatearOfertaHorarios,
  formatearConfirmacion,
  formatearCancelacionExitosa,
  formatearMiCita,
  formatearSinCitaParaConsultar,
  formatearFallback,
  formatearMenu,
  formatearSinMenu,
  formatearPreguntaAlgoMas,
  formatearPreguntaComentario,
  formatearPreguntaDireccion,
  formatearResumenPedido,
  formatearRepetirConfirmacionPedido,
  formatearPedidoConfirmado,
  formatearMiPedido,
  formatearPreguntaTipoEntrega,
  formatearRepetirPreguntaTipoEntrega,
} from "./mensajes.ts";
import type { SlotDisponible } from "./disponibilidad.ts";

const SLOTS: SlotDisponible[] = [
  { inicioUtc: "2026-07-16T14:00:00.000Z", finUtc: "2026-07-16T14:45:00.000Z", inicioLocal: "2026-07-16 10:00" },
  { inicioUtc: "2026-07-16T14:45:00.000Z", finUtc: "2026-07-16T15:30:00.000Z", inicioLocal: "2026-07-16 10:45" },
];

test("formatearOfertaHorarios numera las opciones desde 1 (no desde 0)", () => {
  const texto = formatearOfertaHorarios(SLOTS, "Corte de pelo");
  assert.match(texto, /^Tengo estos horarios disponibles para Corte de pelo:/);
  assert.match(texto, /1\) jueves 16\/07 10:00/);
  assert.match(texto, /2\) jueves 16\/07 10:45/);
});

test("formatearConfirmacion incluye el día en español y la hora local", () => {
  const texto = formatearConfirmacion(SLOTS[0], "Corte de pelo");
  assert.match(texto, /jueves 16\/07 10:00/);
  assert.match(texto, /Corte de pelo/);
});

test("formatearCancelacionExitosa incluye la fecha legible de la cita cancelada", () => {
  const texto = formatearCancelacionExitosa({ inicioLocal: "2026-07-16 10:00" });
  assert.match(texto, /jueves 16\/07 10:00/);
});

test("formatearMiCita incluye el servicio y la fecha legible de la cita", () => {
  const texto = formatearMiCita({ inicioLocal: "2026-07-16 10:00" }, "Corte de pelo");
  assert.match(texto, /jueves 16\/07 10:00/);
  assert.match(texto, /Corte de pelo/);
});

test("formatearSinCitaParaConsultar no lanza y devuelve texto no vacío", () => {
  assert.ok(formatearSinCitaParaConsultar().length > 0);
});

test("formatearFallback usa el nombre del negocio y agrega una línea por cada sugerencia de módulo activo", () => {
  const texto = formatearFallback("Peluquería Demo", ["Sugerencia de agendamiento.", "Sugerencia de pedidos."]);
  assert.match(texto, /Peluquería Demo/);
  assert.match(texto, /Sugerencia de agendamiento\./);
  assert.match(texto, /Sugerencia de pedidos\./);
});

const MENU = [
  { nombre: "Empanada de pino", precio_clp: 2000 },
  { nombre: "Bebida 350ml", precio_clp: 1200 },
];

test("formatearMenu lista los ítems con precio formateado en CLP", () => {
  const texto = formatearMenu(MENU);
  assert.match(texto, /Empanada de pino — \$2\.000/);
  assert.match(texto, /Bebida 350ml — \$1\.200/);
});

test("formatearMenu incluye la descripción del ítem cuando existe", () => {
  const texto = formatearMenu([{ nombre: "Bebida 350ml", precio_clp: 1200, descripcion: "Coca-Cola, Sprite o Fanta" }]);
  assert.match(texto, /Bebida 350ml — \$1\.200 \(Coca-Cola, Sprite o Fanta\)/);
});

test("formatearSinMenu no lanza y devuelve texto no vacío", () => {
  assert.ok(formatearSinMenu().length > 0);
});

const ITEMS_PEDIDO = [
  { nombre: "Empanada de pino", cantidad: 2, precioUnitarioClp: 2000 },
  { nombre: "Bebida 350ml", cantidad: 1, precioUnitarioClp: 1200 },
];

test("formatearResumenPedido incluye cada ítem, su subtotal, el total, y el tipo de entrega", () => {
  const texto = formatearResumenPedido(ITEMS_PEDIDO, 5200, "retiro", null, null);
  assert.match(texto, /2x Empanada de pino — \$4\.000/);
  assert.match(texto, /1x Bebida 350ml — \$1\.200/);
  assert.match(texto, /Total: \$5\.200/);
  assert.match(texto, /Retiro en el local/);
});

test("formatearResumenPedido incluye la dirección solo si es despacho y viene informada", () => {
  const conDireccion = formatearResumenPedido(ITEMS_PEDIDO, 5200, "despacho", null, "Av. Siempre Viva 742");
  assert.match(conDireccion, /Dirección: Av\. Siempre Viva 742/);

  const retiroConDireccionIgnorada = formatearResumenPedido(ITEMS_PEDIDO, 5200, "retiro", null, "Av. Siempre Viva 742");
  assert.doesNotMatch(retiroConDireccionIgnorada, /Dirección/);
});

test("formatearResumenPedido incluye el comentario solo si no es null", () => {
  const conComentario = formatearResumenPedido(ITEMS_PEDIDO, 5200, "retiro", "sin cebolla", null);
  assert.match(conComentario, /Comentario: sin cebolla/);

  const sinComentario = formatearResumenPedido(ITEMS_PEDIDO, 5200, "retiro", null, null);
  assert.doesNotMatch(sinComentario, /Comentario/);
});

test("formatearRepetirConfirmacionPedido incluye el resumen del pedido pendiente y el despacho", () => {
  const texto = formatearRepetirConfirmacionPedido(ITEMS_PEDIDO, 5200, "despacho", null, "Av. Siempre Viva 742");
  assert.match(texto, /2x Empanada de pino/);
  assert.match(texto, /Total: \$5\.200/);
  assert.match(texto, /Despacho/);
  assert.match(texto, /Dirección: Av\. Siempre Viva 742/);
});

test("formatearPedidoConfirmado incluye el id del pedido y el total", () => {
  const texto = formatearPedidoConfirmado(42, 5200);
  assert.match(texto, /#42/);
  assert.match(texto, /\$5\.200/);
});

test("formatearMiPedido traduce el estado interno a un texto legible e incluye el tipo de entrega", () => {
  const texto = formatearMiPedido({ id: 7, estado: "preparando", total_clp: 3000, tipo_entrega: "despacho" });
  assert.match(texto, /#7/);
  assert.match(texto, /en preparación/);
  assert.match(texto, /Despacho/);
  assert.match(texto, /\$3\.000/);
});

test("formatearMiPedido no falla si tipo_entrega es null", () => {
  const texto = formatearMiPedido({ id: 7, estado: "pendiente", total_clp: 3000, tipo_entrega: null });
  assert.match(texto, /#7/);
});

test("formatearPreguntaTipoEntrega y formatearRepetirPreguntaTipoEntrega no lanzan y devuelven texto no vacío", () => {
  assert.ok(formatearPreguntaTipoEntrega().length > 0);
  assert.ok(formatearRepetirPreguntaTipoEntrega().length > 0);
});

test("formatearPreguntaAlgoMas recapitula el carrito y pregunta si falta algo", () => {
  const texto = formatearPreguntaAlgoMas(ITEMS_PEDIDO, 5200);
  assert.match(texto, /2x Empanada de pino — \$4\.000/);
  assert.match(texto, /Total: \$5\.200/);
  assert.match(texto, /¿Quieres agregar algo más\?/);
});

test("formatearPreguntaComentario y formatearPreguntaDireccion no lanzan y devuelven texto no vacío", () => {
  assert.ok(formatearPreguntaComentario().length > 0);
  assert.ok(formatearPreguntaDireccion().length > 0);
});
