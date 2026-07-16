// Módulo de agendamiento de horas — es el comportamiento que tenía el bot
// antes de la arquitectura de módulos, sin cambios de comportamiento;
// movido acá para que un negocio con plan Nivel 2 pueda tener además el
// módulo de pedidos activo al mismo tiempo.

import { obtenerSlotsDisponibles, type SlotDisponible } from "../disponibilidad.ts";
import { interpretarSeleccion } from "../nlu.ts";
import { guardarEstado, limpiarEstado } from "../conversacion.ts";
import { crearCita, cancelarCitaActiva, buscarCitaActiva } from "../reserva.ts";
import {
  formatearOfertaHorarios,
  formatearRepetirOpciones,
  formatearSinHorarios,
  formatearConfirmacion,
  formatearSlotYaNoDisponible,
  formatearCancelacionExitosa,
  formatearSinCitaParaCancelar,
  formatearMiCita,
  formatearSinCitaParaConsultar,
} from "../mensajes.ts";
import type { DefinicionModulo, ContextoModulo } from "./tipos.ts";

const CODIGO = "agendamiento";
const ESTADO_ESPERANDO_SELECCION = "esperando_seleccion_horario";
const MINUTOS_EXPIRACION_ESTADO = 30;

interface ContextoSeleccion {
  slots: SlotDisponible[];
}

async function manejarCancelacion(ctx: ContextoModulo): Promise<void> {
  const { db, negocio, mensaje, ahoraUtc, enviar } = ctx;
  const resultado = await cancelarCitaActiva(db, negocio.id, mensaje.clienteTelefono, ahoraUtc, negocio.timezone);
  if (resultado.ok) {
    await enviar(formatearCancelacionExitosa(resultado.citaCancelada));
  } else {
    await enviar(formatearSinCitaParaCancelar());
  }
}

async function manejarIntent(
  solicitud: { intent: string; fechaPreferida: string | null; rangoHorarioPreferido: "manana" | "tarde" | "noche" | null },
  ctx: ContextoModulo
): Promise<boolean> {
  const { db, negocio, mensaje, ahoraUtc, enviar } = ctx;

  if (solicitud.intent === "cancelar") {
    await manejarCancelacion(ctx);
    return true;
  }

  if (solicitud.intent === "consultar_mi_cita") {
    const resultado = await buscarCitaActiva(db, negocio.id, mensaje.clienteTelefono, ahoraUtc, negocio.timezone);
    if (resultado.ok) {
      await enviar(formatearMiCita(resultado.cita, negocio.servicio_nombre));
    } else {
      await enviar(formatearSinCitaParaConsultar());
    }
    return true;
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
      return true;
    }

    await guardarEstado(
      db,
      negocio.id,
      mensaje.clienteTelefono,
      `${CODIGO}:${ESTADO_ESPERANDO_SELECCION}`,
      { slots } satisfies ContextoSeleccion,
      new Date(ahoraUtc.getTime() + MINUTOS_EXPIRACION_ESTADO * 60000)
    );
    await enviar(formatearOfertaHorarios(slots, negocio.servicio_nombre));
    return true;
  }

  return false;
}

async function manejarEstadoPendiente(
  estadoSinPrefijo: string,
  contexto: unknown,
  ctx: ContextoModulo
): Promise<void> {
  if (estadoSinPrefijo !== ESTADO_ESPERANDO_SELECCION) return;

  const { db, claude, negocio, mensaje, enviar } = ctx;
  const slotsOfrecidos = (contexto as ContextoSeleccion).slots;

  const seleccion = await interpretarSeleccion(claude, {
    mensajeCliente: mensaje.texto,
    horariosOfrecidos: slotsOfrecidos.map((s) => s.inicioLocal),
  });

  if (seleccion.intent === "cancelar") {
    await limpiarEstado(db, negocio.id, mensaje.clienteTelefono);
    await manejarCancelacion(ctx);
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

export const moduloAgendamiento: DefinicionModulo = {
  codigo: CODIGO,
  intents: [
    {
      nombre: "consultar_disponibilidad",
      descripcion: "el cliente pide hora o pregunta por horarios libres para agendar.",
    },
    {
      nombre: "consultar_mi_cita",
      descripcion:
        "el cliente pregunta por una cita que ya tiene agendada (ej. 'a qué hora es mi cita', 'cuándo agendé', 'qué día tengo hora').",
    },
    { nombre: "cancelar", descripcion: "el cliente pide cancelar una cita existente." },
  ],
  sugerenciaFallback: "Escríbeme qué día y horario te gustaría, o \"cancelar\" si quieres cancelar una cita.",
  manejarIntent,
  manejarEstadoPendiente,
};
