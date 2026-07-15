import { zonedTimeToUtc, utcToZoned, diaSemanaDeFecha, sumarDias } from "./tz.ts";

export interface HorarioDisponible {
  diaSemana: number; // 0=domingo .. 6=sábado
  horaInicio: string; // 'HH:MM'
  horaFin: string; // 'HH:MM'
}

export interface RangoOcupado {
  inicioUtc: string; // ISO8601 UTC
  finUtc: string; // ISO8601 UTC
}

export interface SlotDisponible {
  inicioUtc: string; // ISO8601 UTC — usar esto para crear la cita
  finUtc: string; // ISO8601 UTC
  inicioLocal: string; // 'YYYY-MM-DD HH:MM' — usar esto para mostrarle la hora al cliente
}

export type RangoHorario = "manana" | "tarde" | "noche";

// Franjas horarias en minutos desde medianoche, hora local del negocio.
const LIMITES_RANGO_HORARIO: Record<RangoHorario, [number, number]> = {
  manana: [0, 12 * 60],
  tarde: [12 * 60, 19 * 60],
  noche: [19 * 60, 24 * 60],
};

function estaEnRangoHorario(horaHHMM: string, rango: RangoHorario): boolean {
  const minutos = minutosDesdeHHMM(horaHHMM);
  const [desde, hasta] = LIMITES_RANGO_HORARIO[rango];
  return minutos >= desde && minutos < hasta;
}

function minutosDesdeHHMM(horaHHMM: string): number {
  const [h, m] = horaHHMM.split(":").map(Number);
  return h * 60 + m;
}

function hhmmDesdeMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutos % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function seSuperponen(aInicio: number, aFin: number, bInicio: number, bFin: number): boolean {
  return aInicio < bFin && aFin > bInicio;
}

/**
 * Calcula los slots libres de un negocio para un día calendario específico,
 * cruzando sus ventanas de horario recurrente con las citas ya ocupadas.
 * Función pura (sin acceso a D1) para que sea fácil de testear.
 */
export function calcularSlotsDelDia(params: {
  fechaYMD: string;
  timezone: string;
  duracionMinutos: number;
  horarios: HorarioDisponible[];
  ocupados: RangoOcupado[];
  ahoraUtc: Date;
  rangoHorario?: RangoHorario;
}): SlotDisponible[] {
  const { fechaYMD, timezone, duracionMinutos, horarios, ocupados, ahoraUtc, rangoHorario } = params;
  const diaSemana = diaSemanaDeFecha(fechaYMD);
  const horariosDelDia = horarios.filter((h) => h.diaSemana === diaSemana);
  if (horariosDelDia.length === 0) return [];

  const ocupadosMs = ocupados.map((o) => ({
    inicio: new Date(o.inicioUtc).getTime(),
    fin: new Date(o.finUtc).getTime(),
  }));

  const slots: SlotDisponible[] = [];

  for (const horario of horariosDelDia) {
    const inicioBloque = minutosDesdeHHMM(horario.horaInicio);
    const finBloque = minutosDesdeHHMM(horario.horaFin);

    for (
      let inicioCandidato = inicioBloque;
      inicioCandidato + duracionMinutos <= finBloque;
      inicioCandidato += duracionMinutos
    ) {
      const horaInicioLocal = hhmmDesdeMinutos(inicioCandidato);
      if (rangoHorario && !estaEnRangoHorario(horaInicioLocal, rangoHorario)) continue;

      const inicioUtc = zonedTimeToUtc(fechaYMD, horaInicioLocal, timezone);
      const finUtc = new Date(inicioUtc.getTime() + duracionMinutos * 60000);

      if (inicioUtc.getTime() <= ahoraUtc.getTime()) continue;

      const inicioMs = inicioUtc.getTime();
      const finMs = finUtc.getTime();
      const ocupado = ocupadosMs.some((o) => seSuperponen(inicioMs, finMs, o.inicio, o.fin));
      if (ocupado) continue;

      slots.push({
        inicioUtc: inicioUtc.toISOString(),
        finUtc: finUtc.toISOString(),
        inicioLocal: `${fechaYMD} ${horaInicioLocal}`,
      });
    }
  }

  slots.sort((a, b) => a.inicioUtc.localeCompare(b.inicioUtc));
  return slots;
}

interface NegocioRow {
  duracion_minutos: number;
  timezone: string;
}

interface HorarioRow {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

interface CitaRow {
  fecha_hora_inicio: string;
  fecha_hora_fin: string;
}

/**
 * Busca los próximos slots libres de un negocio, consultando D1. Recorre
 * días calendario (en la zona horaria del negocio) desde `fechaInicio` (o
 * hoy si no se especifica) hacia adelante, hasta juntar `limite` slots o
 * agotar `diasHaciaAdelante`. Si se pasa `fechaInicio` y ese día no tiene
 * cupo, sigue buscando en los días siguientes — así "el jueves" naturalmente
 * ofrece el próximo día disponible si el jueves ya está lleno.
 */
export async function obtenerSlotsDisponibles(
  db: D1Database,
  negocioId: number,
  opciones: {
    diasHaciaAdelante?: number;
    limite?: number;
    ahoraUtc?: Date;
    fechaInicio?: string; // 'YYYY-MM-DD'; se ignora si cae antes de hoy
    rangoHorario?: RangoHorario;
  } = {}
): Promise<SlotDisponible[]> {
  const diasHaciaAdelante = opciones.diasHaciaAdelante ?? 14;
  const limite = opciones.limite ?? 3;
  const ahoraUtc = opciones.ahoraUtc ?? new Date();

  const negocio = await db
    .prepare("SELECT duracion_minutos, timezone FROM negocios WHERE id = ? AND activo = 1")
    .bind(negocioId)
    .first<NegocioRow>();
  if (!negocio) return [];

  const horariosResult = await db
    .prepare("SELECT dia_semana, hora_inicio, hora_fin FROM horarios_disponibles WHERE negocio_id = ?")
    .bind(negocioId)
    .all<HorarioRow>();
  const horarios: HorarioDisponible[] = horariosResult.results.map((r) => ({
    diaSemana: r.dia_semana,
    horaInicio: r.hora_inicio,
    horaFin: r.hora_fin,
  }));
  if (horarios.length === 0) return [];

  const { fechaYMD: hoyYMD } = utcToZoned(ahoraUtc, negocio.timezone);
  const fechaInicioBusqueda =
    opciones.fechaInicio && opciones.fechaInicio > hoyYMD ? opciones.fechaInicio : hoyYMD;
  const fechaLimiteYMD = sumarDias(fechaInicioBusqueda, diasHaciaAdelante);

  // Rango de sobra para la query (no necesita ser exacto: el cruce fino de
  // horarios ocurre en calcularSlotsDelDia). Se usa medianoche UTC de las
  // fechas límite, que siempre es igual o anterior a la medianoche local.
  const [y1, m1, d1] = fechaInicioBusqueda.split("-").map(Number);
  const [y2, m2, d2] = fechaLimiteYMD.split("-").map(Number);
  const desdeUtc = new Date(Date.UTC(y1, m1 - 1, d1)).toISOString();
  const hastaUtc = new Date(Date.UTC(y2, m2 - 1, d2, 23, 59, 59)).toISOString();

  const citasResult = await db
    .prepare(
      `SELECT fecha_hora_inicio, fecha_hora_fin FROM citas
       WHERE negocio_id = ? AND estado IN ('pendiente', 'confirmada')
         AND fecha_hora_inicio < ? AND fecha_hora_fin > ?`
    )
    .bind(negocioId, hastaUtc, desdeUtc)
    .all<CitaRow>();
  const ocupados: RangoOcupado[] = citasResult.results.map((r) => ({
    inicioUtc: r.fecha_hora_inicio,
    finUtc: r.fecha_hora_fin,
  }));

  const slots: SlotDisponible[] = [];
  let fechaYMD = fechaInicioBusqueda;
  for (let i = 0; i < diasHaciaAdelante && slots.length < limite; i++) {
    const slotsDelDia = calcularSlotsDelDia({
      fechaYMD,
      timezone: negocio.timezone,
      duracionMinutos: negocio.duracion_minutos,
      horarios,
      ocupados,
      ahoraUtc,
      rangoHorario: opciones.rangoHorario,
    });
    slots.push(...slotsDelDia);
    fechaYMD = sumarDias(fechaYMD, 1);
  }

  return slots.slice(0, limite);
}
