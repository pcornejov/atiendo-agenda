// Validaciones puras para los formularios del panel admin — sin acceso a D1,
// fáciles de testear.

export function esEnteroPositivo(valor: string): boolean {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0;
}

export function esHorarioValido(horaHHMM: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(horaHHMM);
}

export function esRangoHorarioValido(horaInicio: string, horaFin: string): boolean {
  return esHorarioValido(horaInicio) && esHorarioValido(horaFin) && horaFin > horaInicio;
}

const ZONAS_HORARIAS_VALIDAS = new Set(Intl.supportedValuesOf("timeZone"));

export function esTimezoneValida(tz: string): boolean {
  return ZONAS_HORARIAS_VALIDAS.has(tz);
}

// Regex permisiva ("¿tiene forma de email?"), no validación RFC completa —
// no hay envío de correos en el proyecto todavía, así que no hace falta más.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function pareceEmail(valor: string): boolean {
  return EMAIL_REGEX.test(valor.trim());
}

const LARGO_MINIMO_PASSWORD = 8;

export interface RegistroFormValores {
  email: string;
  password: string;
  password_confirmacion: string;
}

export interface RegistroFormDatos {
  email: string;
  password: string;
}

export type ResultadoValidacionRegistro =
  | { ok: true; datos: RegistroFormDatos }
  | { ok: false; errores: string[] };

/** Valida el formulario de registro (email + contraseña). No revisa si el email ya existe — eso lo hace el caller contra la base. */
export function validarRegistroForm(valores: RegistroFormValores): ResultadoValidacionRegistro {
  const errores: string[] = [];

  if (valores.email.trim().length === 0) {
    errores.push("El email no puede estar vacío.");
  } else if (!pareceEmail(valores.email)) {
    errores.push("Ese email no parece válido.");
  }

  if (valores.password.length < LARGO_MINIMO_PASSWORD) {
    errores.push(`La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`);
  }
  if (valores.password !== valores.password_confirmacion) {
    errores.push("Las contraseñas no coinciden.");
  }

  if (errores.length > 0) return { ok: false, errores };

  return {
    ok: true,
    datos: {
      email: valores.email.trim().toLowerCase(),
      password: valores.password,
    },
  };
}

export interface LoginFormValores {
  email: string;
  password: string;
}

export type ResultadoValidacionLogin =
  | { ok: true; datos: { email: string; password: string } }
  | { ok: false; errores: string[] };

/**
 * Valida el formulario de login. A propósito no revalida el largo mínimo de
 * la contraseña acá — una cuenta ya creada podría predatar un mínimo futuro,
 * y el login no debería rechazar una contraseña correcta por una regla de
 * política de registro.
 */
export function validarLoginForm(valores: LoginFormValores): ResultadoValidacionLogin {
  const errores: string[] = [];

  if (valores.email.trim().length === 0) {
    errores.push("El email no puede estar vacío.");
  } else if (!pareceEmail(valores.email)) {
    errores.push("Ese email no parece válido.");
  }
  if (valores.password.length === 0) errores.push("La contraseña no puede estar vacía.");

  if (errores.length > 0) return { ok: false, errores };

  return { ok: true, datos: { email: valores.email.trim().toLowerCase(), password: valores.password } };
}

export interface NegocioFormValores {
  nombre: string;
  telefono_whatsapp: string;
  whatsapp_phone_number_id: string;
  servicio_nombre: string;
  duracion_minutos: string;
  timezone: string;
}

export interface NegocioFormDatos {
  nombre: string;
  telefono_whatsapp: string;
  whatsapp_phone_number_id: string;
  servicio_nombre: string;
  duracion_minutos: number;
  timezone: string;
}

export type ResultadoValidacion =
  | { ok: true; datos: NegocioFormDatos }
  | { ok: false; errores: string[] };

/** Valida los campos del formulario de alta/edición de un negocio. */
export function validarNegocioForm(valores: NegocioFormValores): ResultadoValidacion {
  const errores: string[] = [];

  if (valores.nombre.trim().length === 0) errores.push("El nombre no puede estar vacío.");
  if (valores.telefono_whatsapp.trim().length === 0) errores.push("El teléfono de WhatsApp no puede estar vacío.");
  if (valores.whatsapp_phone_number_id.trim().length === 0) {
    errores.push("El Phone Number ID no puede estar vacío.");
  }
  if (valores.servicio_nombre.trim().length === 0) errores.push("El nombre del servicio no puede estar vacío.");
  if (!esEnteroPositivo(valores.duracion_minutos)) {
    errores.push("La duración debe ser un número entero mayor a 0.");
  }
  if (!esTimezoneValida(valores.timezone)) {
    errores.push(`"${valores.timezone}" no es una zona horaria IANA válida (ej. America/Santiago).`);
  }

  if (errores.length > 0) return { ok: false, errores };

  return {
    ok: true,
    datos: {
      nombre: valores.nombre.trim(),
      telefono_whatsapp: valores.telefono_whatsapp.trim(),
      whatsapp_phone_number_id: valores.whatsapp_phone_number_id.trim(),
      servicio_nombre: valores.servicio_nombre.trim(),
      duracion_minutos: Number(valores.duracion_minutos),
      timezone: valores.timezone.trim(),
    },
  };
}
