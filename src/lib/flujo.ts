// Orquesta un mensaje entrante de WhatsApp: mira qué módulos tiene activos
// el negocio (según su plan/suscripción), arma la tool de Claude con los
// intents de esos módulos (con ayuda de nlu.ts), y despacha al módulo dueño
// del intent devuelto. No tiene tests unitarios propios porque es pegamento
// de I/O (D1 + Claude + WhatsApp) — se verifica de punta a punta con
// wrangler dev (ver README).

import { interpretarSolicitud, type ClienteClaude } from "./nlu.ts";
import { obtenerEstadoVigente, limpiarEstado } from "./conversacion.ts";
import { enviarMensajeWhatsApp, enviarListaWhatsApp, type EnviarListaParams } from "./whatsapp.ts";
import { utcToZoned, diaSemanaDeFecha, nombreDiaSemana } from "./tz.ts";
import { formatearFallback } from "./mensajes.ts";
import { moduloAgendamiento } from "./modulos/agendamiento.ts";
import { moduloPedidos } from "./modulos/pedidos.ts";
import type { DefinicionModulo, NegocioRow, ContextoModulo } from "./modulos/tipos.ts";
import type { MensajeEntrante } from "./webhook.ts";

// Catálogo de módulos que el bot sabe manejar. Cuáles están ACTIVOS para un
// negocio en particular se decide en obtenerModulosActivos, por su
// suscripción — no acá.
const MODULOS_DISPONIBLES: DefinicionModulo[] = [moduloAgendamiento, moduloPedidos];

async function obtenerModulosActivos(db: D1Database, negocioId: number): Promise<DefinicionModulo[]> {
  const resultado = await db
    .prepare(
      `SELECT DISTINCT m.codigo
       FROM negocio_suscripciones s
       JOIN plan_modulos pm ON pm.plan_id = s.plan_id
       JOIN modulos m ON m.id = pm.modulo_id
       WHERE s.negocio_id = ? AND s.estado = 'activa'`
    )
    .bind(negocioId)
    .all<{ codigo: string }>();
  const codigosActivos = new Set(resultado.results.map((r) => r.codigo));
  return MODULOS_DISPONIBLES.filter((modulo) => codigosActivos.has(modulo.codigo));
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
      "SELECT id, nombre, servicio_nombre, duracion_minutos, timezone, whatsapp_phone_number_id FROM negocios WHERE whatsapp_phone_number_id = ? AND activo = 1"
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
  const enviarLista = (params: Omit<EnviarListaParams, "phoneNumberId" | "token" | "para">) =>
    enviarListaWhatsApp({
      phoneNumberId: negocio.whatsapp_phone_number_id,
      token: whatsappToken,
      para: mensaje.clienteTelefono,
      ...params,
    });

  const modulos = await obtenerModulosActivos(db, negocio.id);
  if (modulos.length === 0) {
    // Sin plan activo (suscripción vencida/cancelada, o negocio recién
    // creado sin plan asignado todavía) — no hay nada que el bot pueda
    // responder. No se manda ningún mensaje para no facturarle un mensaje de
    // servicio a un negocio que no está pagando.
    return;
  }

  const ctx: ContextoModulo = { db, claude, negocio, mensaje, ahoraUtc, enviar, enviarLista };

  const estadoVigente = await obtenerEstadoVigente(db, negocio.id, mensaje.clienteTelefono, ahoraUtc);
  if (estadoVigente) {
    const separador = estadoVigente.estado.indexOf(":");
    const codigoModulo = separador === -1 ? estadoVigente.estado : estadoVigente.estado.slice(0, separador);
    const estadoSinPrefijo = separador === -1 ? "" : estadoVigente.estado.slice(separador + 1);
    const modulo = modulos.find((m) => m.codigo === codigoModulo);

    if (modulo?.manejarEstadoPendiente) {
      await modulo.manejarEstadoPendiente(estadoSinPrefijo, estadoVigente.contexto, ctx);
      return;
    }
    // Estado de un módulo que ya no está activo (ej. downgrade de plan a
    // mitad de una conversación) — se descarta y se sigue como mensaje nuevo.
    await limpiarEstado(db, negocio.id, mensaje.clienteTelefono);
  }

  const { fechaYMD: hoyYMD } = utcToZoned(ahoraUtc, negocio.timezone);
  const diaSemanaHoyTexto = nombreDiaSemana(diaSemanaDeFecha(hoyYMD));

  const solicitud = await interpretarSolicitud(claude, {
    mensajeCliente: mensaje.texto,
    servicioNombre: negocio.servicio_nombre,
    duracionMinutos: negocio.duracion_minutos,
    hoyYMD,
    diaSemanaHoyTexto,
    intentsDisponibles: modulos.flatMap((m) => m.intents),
  });

  for (const modulo of modulos) {
    if (await modulo.manejarIntent(solicitud, ctx)) return;
  }

  await enviar(formatearFallback(negocio.nombre, modulos.map((m) => m.sugerenciaFallback)));
}
