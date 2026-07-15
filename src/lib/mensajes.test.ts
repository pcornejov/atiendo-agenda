/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatearOfertaHorarios,
  formatearConfirmacion,
  formatearCancelacionExitosa,
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
