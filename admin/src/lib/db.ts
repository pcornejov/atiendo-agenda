// Consultas D1 del panel admin. Cada función toma `negocioId` explícito
// (nunca "traer todo y filtrar en memoria") para que, cuando exista un login
// por negocio (fase 2), agregar la verificación de autorización sea un único
// chequeo por request y no un rediseño de estas consultas.

import type { NegocioFormDatos } from "./validacion.ts";

export interface Negocio {
  id: number;
  nombre: string;
  telefono_whatsapp: string;
  whatsapp_phone_number_id: string;
  servicio_nombre: string;
  duracion_minutos: number;
  timezone: string;
  activo: number;
  created_at: string;
}

export async function listarNegocios(db: D1Database): Promise<Negocio[]> {
  const resultado = await db
    .prepare("SELECT * FROM negocios ORDER BY created_at DESC")
    .all<Negocio>();
  return resultado.results;
}

export interface NegocioConSuscripcion extends Negocio {
  plan_codigo: string | null;
  suscripcion_estado: string | null;
}

/** Igual que listarNegocios, pero con el plan/estado de suscripción para la vista de administrador. */
export async function listarNegociosConSuscripcion(db: D1Database): Promise<NegocioConSuscripcion[]> {
  const resultado = await db
    .prepare(
      `SELECT n.*, p.codigo AS plan_codigo, s.estado AS suscripcion_estado
       FROM negocios n
       LEFT JOIN negocio_suscripciones s ON s.negocio_id = n.id
       LEFT JOIN planes p ON p.id = s.plan_id
       ORDER BY n.created_at DESC`
    )
    .all<NegocioConSuscripcion>();
  return resultado.results;
}

export async function obtenerNegocio(db: D1Database, negocioId: number): Promise<Negocio | null> {
  const negocio = await db.prepare("SELECT * FROM negocios WHERE id = ?").bind(negocioId).first<Negocio>();
  return negocio ?? null;
}

export type ResultadoGuardarNegocio = { ok: true; id: number } | { ok: false; error: string };

export async function crearNegocio(db: D1Database, datos: NegocioFormDatos): Promise<ResultadoGuardarNegocio> {
  try {
    const resultado = await db
      .prepare(
        `INSERT INTO negocios (nombre, telefono_whatsapp, whatsapp_phone_number_id, servicio_nombre, duracion_minutos, timezone, activo)
         VALUES (?, ?, ?, ?, ?, ?, 1)`
      )
      .bind(
        datos.nombre,
        datos.telefono_whatsapp,
        datos.whatsapp_phone_number_id,
        datos.servicio_nombre,
        datos.duracion_minutos,
        datos.timezone
      )
      .run();
    return { ok: true, id: resultado.meta.last_row_id };
  } catch (error) {
    return { ok: false, error: mensajeErrorD1(error) };
  }
}

export async function actualizarNegocio(
  db: D1Database,
  negocioId: number,
  datos: NegocioFormDatos
): Promise<ResultadoGuardarNegocio> {
  try {
    await db
      .prepare(
        `UPDATE negocios SET nombre = ?, telefono_whatsapp = ?, whatsapp_phone_number_id = ?,
           servicio_nombre = ?, duracion_minutos = ?, timezone = ?
         WHERE id = ?`
      )
      .bind(
        datos.nombre,
        datos.telefono_whatsapp,
        datos.whatsapp_phone_number_id,
        datos.servicio_nombre,
        datos.duracion_minutos,
        datos.timezone,
        negocioId
      )
      .run();
    return { ok: true, id: negocioId };
  } catch (error) {
    return { ok: false, error: mensajeErrorD1(error) };
  }
}

export async function cambiarActivo(db: D1Database, negocioId: number, activo: boolean): Promise<void> {
  await db.prepare("UPDATE negocios SET activo = ? WHERE id = ?").bind(activo ? 1 : 0, negocioId).run();
}

function mensajeErrorD1(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error);
  if (texto.includes("UNIQUE constraint failed") && texto.includes("whatsapp_phone_number_id")) {
    return "Ya existe un negocio con ese Phone Number ID.";
  }
  return "No se pudo guardar el negocio. Revisá los datos e intentá de nuevo.";
}

export interface Horario {
  id: number;
  negocio_id: number;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

export async function listarHorarios(db: D1Database, negocioId: number): Promise<Horario[]> {
  const resultado = await db
    .prepare("SELECT * FROM horarios_disponibles WHERE negocio_id = ? ORDER BY dia_semana, hora_inicio")
    .bind(negocioId)
    .all<Horario>();
  return resultado.results;
}

export async function crearHorario(
  db: D1Database,
  negocioId: number,
  diaSemana: number,
  horaInicio: string,
  horaFin: string
): Promise<void> {
  await db
    .prepare("INSERT INTO horarios_disponibles (negocio_id, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)")
    .bind(negocioId, diaSemana, horaInicio, horaFin)
    .run();
}

export async function eliminarHorario(db: D1Database, negocioId: number, horarioId: number): Promise<void> {
  // Scoped por negocioId además del id — evita que, el día de mañana con
  // login por negocio, un dueño borre un horario de otro negocio adivinando el id.
  await db
    .prepare("DELETE FROM horarios_disponibles WHERE id = ? AND negocio_id = ?")
    .bind(horarioId, negocioId)
    .run();
}

export interface CitaProxima {
  id: number;
  cliente_telefono: string;
  cliente_nombre: string | null;
  fecha_hora_inicio: string;
  fecha_hora_fin: string;
  estado: string;
}

export async function listarCitasProximas(db: D1Database, negocioId: number): Promise<CitaProxima[]> {
  const resultado = await db
    .prepare(
      `SELECT id, cliente_telefono, cliente_nombre, fecha_hora_inicio, fecha_hora_fin, estado
       FROM citas
       WHERE negocio_id = ? AND estado IN ('pendiente', 'confirmada')
       ORDER BY fecha_hora_inicio ASC`
    )
    .bind(negocioId)
    .all<CitaProxima>();
  return resultado.results;
}

/** Cancela una cita específica por id (a diferencia de cancelarCitaActiva del bot, que cancela "la próxima" de un cliente). */
export async function cancelarCitaPorId(db: D1Database, negocioId: number, citaId: number): Promise<void> {
  await db
    .prepare("UPDATE citas SET estado = 'cancelada' WHERE id = ? AND negocio_id = ?")
    .bind(citaId, negocioId)
    .run();
}

export type Rol = "admin" | "dueno";

export interface Usuario {
  id: number;
  google_sub: string;
  email: string;
  rol: Rol;
  negocio_id: number | null;
}

const COLUMNAS_USUARIO = "id, google_sub, email, rol, negocio_id";

export async function obtenerUsuarioPorGoogleSub(db: D1Database, googleSub: string): Promise<Usuario | null> {
  const usuario = await db
    .prepare(`SELECT ${COLUMNAS_USUARIO} FROM usuarios WHERE google_sub = ?`)
    .bind(googleSub)
    .first<Usuario>();
  return usuario ?? null;
}

export async function obtenerUsuarioPorId(db: D1Database, id: number): Promise<Usuario | null> {
  const usuario = await db
    .prepare(`SELECT ${COLUMNAS_USUARIO} FROM usuarios WHERE id = ?`)
    .bind(id)
    .first<Usuario>();
  return usuario ?? null;
}

export async function crearUsuario(
  db: D1Database,
  params: { googleSub: string; email: string; rol: Rol }
): Promise<Usuario> {
  const usuario = await db
    .prepare(`INSERT INTO usuarios (google_sub, email, rol) VALUES (?, ?, ?) RETURNING ${COLUMNAS_USUARIO}`)
    .bind(params.googleSub, params.email, params.rol)
    .first<Usuario>();
  if (!usuario) throw new Error("No se pudo crear el usuario");
  return usuario;
}

/** Vincula un usuario 'dueno' recién registrado a un negocio nuevo, completando su onboarding. */
export async function vincularUsuarioANegocio(db: D1Database, usuarioId: number, negocioId: number): Promise<void> {
  await db.prepare("UPDATE usuarios SET negocio_id = ? WHERE id = ?").bind(negocioId, usuarioId).run();
}
