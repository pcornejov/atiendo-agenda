// Utilidades de formato de fecha/hora para mostrar en el panel. Versión
// minimalista de src/lib/tz.ts del bot — proyectos separados, sin imports
// cruzados, así que se duplica solo lo que este panel necesita.

export function utcToZonedTexto(fechaUtcIso: string, timezone: string): string {
  const fecha = new Date(fechaUtcIso);
  return new Intl.DateTimeFormat("es", {
    timeZone: timezone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);
}

const NOMBRES_DIA_SEMANA = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

export function nombreDiaSemana(diaSemana: number): string {
  return NOMBRES_DIA_SEMANA[diaSemana] ?? "?";
}
