/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularSlotsDelDia } from "./disponibilidad.ts";

// 2026-07-16 es jueves. Ejemplo del README: negocio martes-sábado 10:00-19:00,
// timezone America/Santiago (UTC-4 en julio), servicio de 45 minutos.
const HORARIOS = [{ diaSemana: 4, horaInicio: "10:00", horaFin: "12:30" }];
const AHORA_MUY_TEMPRANO = new Date("2026-07-10T00:00:00.000Z");

test("genera slots alineados a la duración del servicio, sin superposición", () => {
  const slots = calcularSlotsDelDia({
    fechaYMD: "2026-07-16",
    timezone: "America/Santiago",
    duracionMinutos: 45,
    horarios: HORARIOS,
    ocupados: [],
    ahoraUtc: AHORA_MUY_TEMPRANO,
  });
  // 10:00-12:30 con slots de 45min: 10:00, 10:45, 11:30, 12:15 (12:15+45=13:00 > 12:30 no cabría)
  // en realidad 12:15+45min=13:00 excede 12:30, así que el último válido es 11:30 (11:30+45=12:15<=12:30)
  const horasLocales = slots.map((s) => s.inicioLocal);
  assert.deepEqual(horasLocales, [
    "2026-07-16 10:00",
    "2026-07-16 10:45",
    "2026-07-16 11:30",
  ]);
});

test("un día sin horario configurado no genera slots", () => {
  const slots = calcularSlotsDelDia({
    fechaYMD: "2026-07-19", // domingo, no está en HORARIOS
    timezone: "America/Santiago",
    duracionMinutos: 45,
    horarios: HORARIOS,
    ocupados: [],
    ahoraUtc: AHORA_MUY_TEMPRANO,
  });
  assert.deepEqual(slots, []);
});

test("una cita ocupada excluye el slot que se superpone", () => {
  // 10:45 local (America/Santiago, UTC-4 en julio) = 14:45 UTC
  const slots = calcularSlotsDelDia({
    fechaYMD: "2026-07-16",
    timezone: "America/Santiago",
    duracionMinutos: 45,
    horarios: HORARIOS,
    ocupados: [{ inicioUtc: "2026-07-16T14:45:00.000Z", finUtc: "2026-07-16T15:30:00.000Z" }],
    ahoraUtc: AHORA_MUY_TEMPRANO,
  });
  const horasLocales = slots.map((s) => s.inicioLocal);
  assert.deepEqual(horasLocales, ["2026-07-16 10:00", "2026-07-16 11:30"]);
});

test("slots en el pasado (respecto a ahoraUtc) se excluyen", () => {
  // 10:45 local = 14:45 UTC; si "ahora" es 15:00 UTC, 10:00 y 10:45 ya pasaron
  const slots = calcularSlotsDelDia({
    fechaYMD: "2026-07-16",
    timezone: "America/Santiago",
    duracionMinutos: 45,
    horarios: HORARIOS,
    ocupados: [],
    ahoraUtc: new Date("2026-07-16T15:00:00.000Z"),
  });
  const horasLocales = slots.map((s) => s.inicioLocal);
  assert.deepEqual(horasLocales, ["2026-07-16 11:30"]);
});

test("rangoHorario filtra por franja, respetando el límite manana/tarde a las 12:00", () => {
  // Bloque 11:00-14:00, servicio de 60min: candidatos 11:00, 12:00, 13:00.
  const horarios = [{ diaSemana: 4, horaInicio: "11:00", horaFin: "14:00" }];

  const soloManana = calcularSlotsDelDia({
    fechaYMD: "2026-07-16",
    timezone: "America/Santiago",
    duracionMinutos: 60,
    horarios,
    ocupados: [],
    ahoraUtc: AHORA_MUY_TEMPRANO,
    rangoHorario: "manana",
  });
  assert.deepEqual(
    soloManana.map((s) => s.inicioLocal),
    ["2026-07-16 11:00"]
  );

  const soloTarde = calcularSlotsDelDia({
    fechaYMD: "2026-07-16",
    timezone: "America/Santiago",
    duracionMinutos: 60,
    horarios,
    ocupados: [],
    ahoraUtc: AHORA_MUY_TEMPRANO,
    rangoHorario: "tarde",
  });
  assert.deepEqual(
    soloTarde.map((s) => s.inicioLocal),
    ["2026-07-16 12:00", "2026-07-16 13:00"]
  );
});

test("dos citas que se tocan en el borde no se consideran superpuestas", () => {
  // La cita ocupa exactamente 10:00-10:45; el slot 10:45-11:30 debe seguir libre
  const slots = calcularSlotsDelDia({
    fechaYMD: "2026-07-16",
    timezone: "America/Santiago",
    duracionMinutos: 45,
    horarios: HORARIOS,
    ocupados: [{ inicioUtc: "2026-07-16T14:00:00.000Z", finUtc: "2026-07-16T14:45:00.000Z" }],
    ahoraUtc: AHORA_MUY_TEMPRANO,
  });
  const horasLocales = slots.map((s) => s.inicioLocal);
  assert.deepEqual(horasLocales, ["2026-07-16 10:45", "2026-07-16 11:30"]);
});
