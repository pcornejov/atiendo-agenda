/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esEnteroPositivo,
  esHorarioValido,
  esRangoHorarioValido,
  esTimezoneValida,
  validarNegocioForm,
} from "./validacion.ts";

test("esEnteroPositivo", () => {
  assert.equal(esEnteroPositivo("45"), true);
  assert.equal(esEnteroPositivo("0"), false);
  assert.equal(esEnteroPositivo("-5"), false);
  assert.equal(esEnteroPositivo("3.5"), false);
  assert.equal(esEnteroPositivo("abc"), false);
});

test("esHorarioValido", () => {
  assert.equal(esHorarioValido("09:00"), true);
  assert.equal(esHorarioValido("23:59"), true);
  assert.equal(esHorarioValido("24:00"), false);
  assert.equal(esHorarioValido("9:00"), false);
  assert.equal(esHorarioValido("09:60"), false);
});

test("esRangoHorarioValido exige que el fin sea posterior al inicio", () => {
  assert.equal(esRangoHorarioValido("09:00", "13:00"), true);
  assert.equal(esRangoHorarioValido("13:00", "09:00"), false);
  assert.equal(esRangoHorarioValido("09:00", "09:00"), false);
});

test("esTimezoneValida acepta zonas IANA reales y rechaza inventadas", () => {
  assert.equal(esTimezoneValida("America/Santiago"), true);
  assert.equal(esTimezoneValida("America/New_York"), true);
  assert.equal(esTimezoneValida("Marte/Cráter"), false);
  assert.equal(esTimezoneValida(""), false);
});

const VALORES_VALIDOS = {
  nombre: "Peluquería Demo",
  telefono_whatsapp: "+56912345678",
  whatsapp_phone_number_id: "123456789012345",
  servicio_nombre: "Corte de pelo",
  duracion_minutos: "45",
  timezone: "America/Santiago",
};

test("validarNegocioForm acepta valores correctos y devuelve datos con el tipo correcto", () => {
  const resultado = validarNegocioForm(VALORES_VALIDOS);
  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.equal(resultado.datos.duracion_minutos, 45);
    assert.equal(typeof resultado.datos.duracion_minutos, "number");
  }
});

test("validarNegocioForm junta todos los errores en vez de cortar en el primero", () => {
  const resultado = validarNegocioForm({
    ...VALORES_VALIDOS,
    nombre: "",
    duracion_minutos: "0",
    timezone: "no-existe",
  });
  assert.equal(resultado.ok, false);
  if (!resultado.ok) {
    assert.equal(resultado.errores.length, 3);
  }
});

test("validarNegocioForm recorta espacios en los campos de texto", () => {
  const resultado = validarNegocioForm({ ...VALORES_VALIDOS, nombre: "  Peluquería Demo  " });
  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.equal(resultado.datos.nombre, "Peluquería Demo");
  }
});
