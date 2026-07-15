// Estado de conversación multi-turno (tabla conversaciones_estado): una fila
// por (negocio_id, cliente_telefono), upserted en cada mensaje que deja una
// respuesta pendiente. Ver migrations/0001_init.sql para el porqué de este
// diseño (una fila por cliente, no un log).

export interface EstadoConversacion {
  estado: string;
  contexto: unknown;
}

interface EstadoRow {
  estado: string;
  contexto: string;
  expira_en: string;
}

/** Devuelve el estado vigente, o null si no hay ninguno o ya expiró. */
export async function obtenerEstadoVigente(
  db: D1Database,
  negocioId: number,
  clienteTelefono: string,
  ahoraUtc: Date
): Promise<EstadoConversacion | null> {
  const fila = await db
    .prepare(
      "SELECT estado, contexto, expira_en FROM conversaciones_estado WHERE negocio_id = ? AND cliente_telefono = ?"
    )
    .bind(negocioId, clienteTelefono)
    .first<EstadoRow>();
  if (!fila) return null;
  if (fila.expira_en <= ahoraUtc.toISOString()) return null;

  return { estado: fila.estado, contexto: JSON.parse(fila.contexto) };
}

/** Crea o reemplaza el estado pendiente de un cliente (upsert por negocio+teléfono). */
export async function guardarEstado(
  db: D1Database,
  negocioId: number,
  clienteTelefono: string,
  estado: string,
  contexto: unknown,
  expiraEnUtc: Date
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO conversaciones_estado (negocio_id, cliente_telefono, estado, contexto, expira_en, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (negocio_id, cliente_telefono) DO UPDATE SET
         estado = excluded.estado,
         contexto = excluded.contexto,
         expira_en = excluded.expira_en,
         updated_at = excluded.updated_at`
    )
    .bind(
      negocioId,
      clienteTelefono,
      estado,
      JSON.stringify(contexto),
      expiraEnUtc.toISOString(),
      new Date().toISOString()
    )
    .run();
}

/** Limpia el estado pendiente (después de confirmar, cancelar, o abandonar el flujo). */
export async function limpiarEstado(db: D1Database, negocioId: number, clienteTelefono: string): Promise<void> {
  await db
    .prepare("DELETE FROM conversaciones_estado WHERE negocio_id = ? AND cliente_telefono = ?")
    .bind(negocioId, clienteTelefono)
    .run();
}
