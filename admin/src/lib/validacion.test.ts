/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esEnteroPositivo,
  esHorarioValido,
  esRangoHorarioValido,
  esTimezoneValida,
  validarNegocioForm,
  validarRegistroForm,
  validarLoginForm,
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

const REGISTRO_VALIDO = {
  email: "Dueno@Ejemplo.cl",
  password: "contraseña-segura",
  password_confirmacion: "contraseña-segura",
};

test("validarRegistroForm acepta valores correctos y normaliza el email (trim + minúsculas)", () => {
  const resultado = validarRegistroForm(REGISTRO_VALIDO);
  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.equal(resultado.datos.email, "dueno@ejemplo.cl");
  }
});

test("validarRegistroForm rechaza email vacío o mal formado", () => {
  assert.equal(validarRegistroForm({ ...REGISTRO_VALIDO, email: "" }).ok, false);
  assert.equal(validarRegistroForm({ ...REGISTRO_VALIDO, email: "no-es-un-email" }).ok, false);
});

test("validarRegistroForm exige contraseña de al menos 8 caracteres", () => {
  const resultado = validarRegistroForm({ ...REGISTRO_VALIDO, password: "1234567", password_confirmacion: "1234567" });
  assert.equal(resultado.ok, false);
});

test("validarRegistroForm exige que la confirmación coincida", () => {
  const resultado = validarRegistroForm({ ...REGISTRO_VALIDO, password_confirmacion: "otra-cosa" });
  assert.equal(resultado.ok, false);
});

test("validarRegistroForm junta todos los errores en vez de cortar en el primero", () => {
  const resultado = validarRegistroForm({ email: "", password: "123", password_confirmacion: "456" });
  assert.equal(resultado.ok, false);
  if (!resultado.ok) {
    assert.equal(resultado.errores.length, 3);
  }
});

test("validarLoginForm acepta valores correctos y normaliza el email", () => {
  const resultado = validarLoginForm({ email: "Dueno@Ejemplo.cl", password: "cualquiera" });
  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.equal(resultado.datos.email, "dueno@ejemplo.cl");
  }
});

test("validarLoginForm rechaza email o password vacíos, sin exigir largo mínimo de password", () => {
  assert.equal(validarLoginForm({ email: "", password: "1234567" }).ok, false);
  assert.equal(validarLoginForm({ email: "a@b.cl", password: "" }).ok, false);
  // password corta (menor al mínimo de registro) igual pasa en login — no es una regla de login
  assert.equal(validarLoginForm({ email: "a@b.cl", password: "1234" }).ok, true);
});
