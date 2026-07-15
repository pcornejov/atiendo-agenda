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
