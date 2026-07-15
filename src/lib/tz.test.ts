/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { zonedTimeToUtc, utcToZoned, diaSemanaDeFecha, sumarDias } from "./tz.ts";

test("zonedTimeToUtc: America/Santiago en invierno (UTC-4)", () => {
  const utc = zonedTimeToUtc("2026-07-16", "14:00", "America/Santiago");
  assert.equal(utc.toISOString(), "2026-07-16T18:00:00.000Z");
});

test("zonedTimeToUtc: America/New_York respeta DST (verano, UTC-4)", () => {
  const utc = zonedTimeToUtc("2026-07-16", "09:00", "America/New_York");
  assert.equal(utc.toISOString(), "2026-07-16T13:00:00.000Z");
});

test("zonedTimeToUtc: America/New_York fuera de DST (invierno, UTC-5)", () => {
  const utc = zonedTimeToUtc("2026-01-16", "09:00", "America/New_York");
  assert.equal(utc.toISOString(), "2026-01-16T14:00:00.000Z");
});

test("utcToZoned es la inversa de zonedTimeToUtc", () => {
  const utc = zonedTimeToUtc("2026-03-10", "08:30", "America/Santiago");
  const { fechaYMD, horaHHMM } = utcToZoned(utc, "America/Santiago");
  assert.equal(fechaYMD, "2026-03-10");
  assert.equal(horaHHMM, "08:30");
});

test("diaSemanaDeFecha: jueves 16 de julio de 2026", () => {
  // Verificado con calendario: 2026-07-16 es jueves.
  assert.equal(diaSemanaDeFecha("2026-07-16"), 4);
});

test("diaSemanaDeFecha: domingo", () => {
  assert.equal(diaSemanaDeFecha("2026-07-19"), 0);
});

test("sumarDias avanza cruzando fin de mes", () => {
  assert.equal(sumarDias("2026-07-30", 3), "2026-08-02");
});

test("sumarDias con 0 no cambia la fecha", () => {
  assert.equal(sumarDias("2026-07-16", 0), "2026-07-16");
});
