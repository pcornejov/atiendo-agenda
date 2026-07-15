// Conversión entre hora local (de una zona horaria IANA, ej. 'America/Santiago')
// y UTC, usando solo el Intl nativo — sin dependencias externas.

function offsetMinutos(fechaUtc: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const partes = Object.fromEntries(
    dtf.formatToParts(fechaUtc).map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const comoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second)
  );
  // Diferencia entre "la hora que se ve en timeZone" y el instante UTC real.
  return (comoUtc - fechaUtc.getTime()) / 60000;
}

/** Convierte una fecha/hora local ('YYYY-MM-DD', 'HH:MM') de una zona horaria a un instante UTC. */
export function zonedTimeToUtc(fechaYMD: string, horaHHMM: string, timeZone: string): Date {
  const [anio, mes, dia] = fechaYMD.split("-").map(Number);
  const [hora, minuto] = horaHHMM.split(":").map(Number);
  // Primera estimación tratando los componentes como si fueran UTC, luego se
  // corrige con el offset real de la zona horaria en ese instante.
  const estimado = new Date(Date.UTC(anio, mes - 1, dia, hora, minuto, 0));
  const offset = offsetMinutos(estimado, timeZone);
  return new Date(estimado.getTime() - offset * 60000);
}

/** Convierte un instante UTC a sus componentes de fecha/hora local en una zona horaria. */
export function utcToZoned(fechaUtc: Date, timeZone: string): { fechaYMD: string; horaHHMM: string } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const partes = Object.fromEntries(
    dtf.formatToParts(fechaUtc).map((p) => [p.type, p.value])
  ) as Record<string, string>;
  return {
    fechaYMD: `${partes.year}-${partes.month}-${partes.day}`,
    horaHHMM: `${partes.hour}:${partes.minute}`,
  };
}

/** Día de la semana (0=domingo..6=sábado) de una fecha calendario 'YYYY-MM-DD'. */
export function diaSemanaDeFecha(fechaYMD: string): number {
  const [anio, mes, dia] = fechaYMD.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}

const NOMBRES_DIA_SEMANA = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

/** Nombre en español de un día de la semana (0=domingo..6=sábado). */
export function nombreDiaSemana(diaSemana: number): string {
  return NOMBRES_DIA_SEMANA[diaSemana];
}

/** Suma `dias` días calendario a una fecha 'YYYY-MM-DD' (sin componente horario). */
export function sumarDias(fechaYMD: string, dias: number): string {
  const [anio, mes, dia] = fechaYMD.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return fecha.toISOString().slice(0, 10);
}
