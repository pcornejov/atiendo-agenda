// Creación y cancelación de citas contra D1.

import { utcToZoned } from "./tz.ts";

export type ResultadoCrearCita = { ok: true } | { ok: false; razon: "conflicto" };

/**
 * Crea una cita, re-chequeando justo antes de insertar que el horario siga
 * libre (por si otro mensaje llegó primero y ya lo tomó entre que se ofreció
 * el slot y que el cliente confirmó).
 */
export async function crearCita(
  db: D1Database,
  params: {
    negocioId: number;
    clienteTelefono: string;
    clienteNombre: string | null;
    inicioUtc: string;
    finUtc: string;
  }
): Promise<ResultadoCrearCita> {
  const conflicto = await db
    .prepare(
      `SELECT id FROM citas
       WHERE negocio_id = ? AND estado IN ('pendiente', 'confirmada')
         AND fecha_hora_inicio < ? AND fecha_hora_fin > ?
       LIMIT 1`
    )
    .bind(params.negocioId, params.finUtc, params.inicioUtc)
    .first();
  if (conflicto) return { ok: false, razon: "conflicto" };

  await db
    .prepare(
      `INSERT INTO citas (negocio_id, cliente_telefono, cliente_nombre, fecha_hora_inicio, fecha_hora_fin, estado)
       VALUES (?, ?, ?, ?, ?, 'confirmada')`
    )
    .bind(params.negocioId, params.clienteTelefono, params.clienteNombre, params.inicioUtc, params.finUtc)
    .run();

  return { ok: true };
}

export type ResultadoCancelarCita =
  | { ok: true; citaCancelada: { inicioLocal: string } }
  | { ok: false };

/** Cancela la próxima cita activa (futura, pendiente o confirmada) de un cliente en un negocio. */
export async function cancelarCitaActiva(
  db: D1Database,
  negocioId: number,
  clienteTelefono: string,
  ahoraUtc: Date,
  timezone: string
): Promise<ResultadoCancelarCita> {
  const cita = await db
    .prepare(
      `SELECT id, fecha_hora_inicio FROM citas
       WHERE negocio_id = ? AND cliente_telefono = ?
         AND estado IN ('pendiente', 'confirmada') AND fecha_hora_inicio > ?
       ORDER BY fecha_hora_inicio ASC
       LIMIT 1`
    )
    .bind(negocioId, clienteTelefono, ahoraUtc.toISOString())
    .first<{ id: number; fecha_hora_inicio: string }>();
  if (!cita) return { ok: false };

  await db.prepare("UPDATE citas SET estado = 'cancelada' WHERE id = ?").bind(cita.id).run();

  const { fechaYMD, horaHHMM } = utcToZoned(new Date(cita.fecha_hora_inicio), timezone);
  return { ok: true, citaCancelada: { inicioLocal: `${fechaYMD} ${horaHHMM}` } };
}
