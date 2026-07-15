// Orquesta un mensaje entrante de WhatsApp: decide qué está pidiendo el
// cliente (con ayuda de nlu.ts), consulta/actualiza disponibilidad y citas,
// y responde por WhatsApp. No tiene tests unitarios propios porque es
// pegamento de I/O (D1 + Claude + WhatsApp) — se verifica de punta a punta
// con wrangler dev (ver README).

import { obtenerSlotsDisponibles, type SlotDisponible } from "./disponibilidad.ts";
import { interpretarSolicitud, interpretarSeleccion, type ClienteClaude } from "./nlu.ts";
import { obtenerEstadoVigente, guardarEstado, limpiarEstado } from "./conversacion.ts";
import { crearCita, cancelarCitaActiva } from "./reserva.ts";
import { enviarMensajeWhatsApp } from "./whatsapp.ts";
import { utcToZoned, diaSemanaDeFecha, nombreDiaSemana } from "./tz.ts";
import {
  formatearOfertaHorarios,
  formatearRepetirOpciones,
  formatearSinHorarios,
  formatearConfirmacion,
  formatearSlotYaNoDisponible,
  formatearCancelacionExitosa,
  formatearSinCitaParaCancelar,
  formatearFallback,
} from "./mensajes.ts";
import type { MensajeEntrante } from "./webhook.ts";

const MINUTOS_EXPIRACION_ESTADO = 30;

interface NegocioRow {
  id: number;
  servicio_nombre: string;
  duracion_minutos: number;
  timezone: string;
  whatsapp_phone_number_id: string;
}

interface ContextoSeleccion {
  slots: SlotDisponible[];
}

export async function procesarMensajeEntrante(params: {
  db: D1Database;
  claude: ClienteClaude;
  whatsappToken: string;
  mensaje: MensajeEntrante;
  ahoraUtc?: Date;
}): Promise<void> {
  const { db, claude, whatsappToken, mensaje } = params;
  const ahoraUtc = params.ahoraUtc ?? new Date();

  const negocio = await db
    .prepare(
      "SELECT id, servicio_nombre, duracion_minutos, timezone, whatsapp_phone_number_id FROM negocios WHERE whatsapp_phone_number_id = ? AND activo = 1"
    )
    .bind(mensaje.phoneNumberId)
    .first<NegocioRow>();
  if (!negocio) return; // número no reconocido/inactivo: no hay a quién responderle con contexto

  const enviar = (texto: string) =>
    enviarMensajeWhatsApp({
      phoneNumberId: negocio.whatsapp_phone_number_id,
      token: whatsappToken,
      para: mensaje.clienteTelefono,
      texto,
    });

  const { fechaYMD: hoyYMD } = utcToZoned(ahoraUtc, negocio.timezone);
  const diaSemanaHoyTexto = nombreDiaSemana(diaSemanaDeFecha(hoyYMD));

  const estadoVigente = await obtenerEstadoVigente(db, negocio.id, mensaje.clienteTelefono, ahoraUtc);

  if (estadoVigente?.estado === "esperando_seleccion_horario") {
    await manejarSeleccion(db, claude, negocio, mensaje, estadoVigente.contexto as ContextoSeleccion, enviar);
    return;
  }

  const solicitud = await interpretarSolicitud(claude, {
    mensajeCliente: mensaje.texto,
    servicioNombre: negocio.servicio_nombre,
    duracionMinutos: negocio.duracion_minutos,
    hoyYMD,
    diaSemanaHoyTexto,
  });

  if (solicitud.intent === "cancelar") {
    await manejarCancelacion(db, negocio, mensaje, ahoraUtc, enviar);
    return;
  }

  if (solicitud.intent === "consultar_disponibilidad") {
    const slots = await obtenerSlotsDisponibles(db, negocio.id, {
      limite: 3,
      ahoraUtc,
      fechaInicio: solicitud.fechaPreferida ?? undefined,
      rangoHorario: solicitud.rangoHorarioPreferido ?? undefined,
    });

    if (slots.length === 0) {
      await enviar(formatearSinHorarios());
      return;
    }

    await guardarEstado(
      db,
      negocio.id,
      mensaje.clienteTelefono,
      "esperando_seleccion_horario",
      { slots } satisfies ContextoSeleccion,
      new Date(ahoraUtc.getTime() + MINUTOS_EXPIRACION_ESTADO * 60000)
    );
    await enviar(formatearOfertaHorarios(slots, negocio.servicio_nombre));
    return;
  }

  await enviar(formatearFallback(negocio.servicio_nombre));
}

async function manejarSeleccion(
  db: D1Database,
  claude: ClienteClaude,
  negocio: NegocioRow,
  mensaje: MensajeEntrante,
  contexto: ContextoSeleccion,
  enviar: (texto: string) => Promise<void>
): Promise<void> {
  const slotsOfrecidos = contexto.slots;
  const seleccion = await interpretarSeleccion(claude, {
    mensajeCliente: mensaje.texto,
    horariosOfrecidos: slotsOfrecidos.map((s) => s.inicioLocal),
  });

  if (seleccion.intent === "cancelar") {
    await limpiarEstado(db, negocio.id, mensaje.clienteTelefono);
    await manejarCancelacion(db, negocio, mensaje, new Date(), enviar);
    return;
  }

  if (seleccion.intent === "seleccion" && seleccion.indiceSeleccionado !== null) {
    const slot = slotsOfrecidos[seleccion.indiceSeleccionado];
    const resultado = await crearCita(db, {
      negocioId: negocio.id,
      clienteTelefono: mensaje.clienteTelefono,
      clienteNombre: mensaje.clienteNombrePerfil,
      inicioUtc: slot.inicioUtc,
      finUtc: slot.finUtc,
    });
    await limpiarEstado(db, negocio.id, mensaje.clienteTelefono);

    if (resultado.ok) {
      await enviar(formatearConfirmacion(slot, negocio.servicio_nombre));
    } else {
      await enviar(formatearSlotYaNoDisponible());
    }
    return;
  }

  // "otro": no quedó claro cuál eligió — se le repiten las mismas opciones
  // (el estado ya guardado sigue vigente, no hace falta volver a guardarlo).
  await enviar(formatearRepetirOpciones(slotsOfrecidos, negocio.servicio_nombre));
}

async function manejarCancelacion(
  db: D1Database,
  negocio: NegocioRow,
  mensaje: MensajeEntrante,
  ahoraUtc: Date,
  enviar: (texto: string) => Promise<void>
): Promise<void> {
  const resultado = await cancelarCitaActiva(
    db,
    negocio.id,
    mensaje.clienteTelefono,
    ahoraUtc,
    negocio.timezone
  );
  if (resultado.ok) {
    await enviar(formatearCancelacionExitosa(resultado.citaCancelada));
  } else {
    await enviar(formatearSinCitaParaCancelar());
  }
}
