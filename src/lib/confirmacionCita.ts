// Resuelve el botón "Confirmar"/"Cancelar" del recordatorio (ver
// recordatorios.ts + whatsapp.ts). Es una acción determinística — se
// resuelve directo contra la base, sin pasar por Claude/flujo.ts.

import { enviarMensajeWhatsApp } from "./whatsapp.ts";
import type { BotonEntrante } from "./webhook.ts";

const PATRON_PAYLOAD = /^(confirmar|cancelar)_cita_(\d+)$/;

interface CitaRow {
  id: number;
  estado: string;
  servicio_nombre: string;
}

export async function procesarBotonEntrante(params: {
  db: D1Database;
  whatsappToken: string;
  boton: BotonEntrante;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const { db, whatsappToken, boton } = params;
  const fetchImpl = params.fetchImpl ?? fetch;

  const match = PATRON_PAYLOAD.exec(boton.payload);
  if (!match) return; // payload no reconocido (de otra plantilla, o corrupto) — nada que hacer

  const [, accion, citaIdTexto] = match;
  const citaId = Number(citaIdTexto);
  const nuevoEstado = accion === "confirmar" ? "confirmada" : "cancelada";

  // Se correlaciona con negocios.whatsapp_phone_number_id además del id de
  // la cita: evita que un payload manipulado apunte a la cita de otro
  // negocio distinto del que mandó el webhook.
  const cita = await db
    .prepare(
      `SELECT c.id, c.estado, n.servicio_nombre
       FROM citas c
       JOIN negocios n ON n.id = c.negocio_id
       WHERE c.id = ? AND n.whatsapp_phone_number_id = ?`
    )
    .bind(citaId, boton.phoneNumberId)
    .first<CitaRow>();

  // No existe, es de otro negocio, o ya se resolvió por otro medio (doble
  // tap, o ya se había cancelado desde el panel) — no se reenvía mensaje.
  if (!cita || cita.estado !== "pendiente") return;

  await db
    .prepare("UPDATE citas SET estado = ? WHERE id = ? AND estado = 'pendiente'")
    .bind(nuevoEstado, citaId)
    .run();

  const texto =
    accion === "confirmar"
      ? `¡Listo! Quedaste confirmado para ${cita.servicio_nombre}. Te esperamos.`
      : `Tu cita para ${cita.servicio_nombre} quedó cancelada. Escríbenos si quieres agendar otro horario.`;

  await enviarMensajeWhatsApp(
    {
      phoneNumberId: boton.phoneNumberId,
      token: whatsappToken,
      para: boton.clienteTelefono,
      texto,
    },
    fetchImpl
  );
}
