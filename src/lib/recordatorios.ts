// Job del cron: busca citas que empiezan en la próxima hora (con margen) y
// les manda el recordatorio, marcándolas para no reenviarlo. Corre cada 5
// minutos (wrangler.jsonc); la ventana de 70 min garantiza que toda cita se
// detecte entre 55-65 min antes de empezar aunque el cron caiga justo antes
// del límite — ver migrations/0001_init.sql para el razonamiento completo.

import { enviarPlantillaWhatsApp } from "./whatsapp.ts";
import { utcToZoned } from "./tz.ts";

const MINUTOS_VENTANA = 70;

interface CitaPendienteRow {
  id: number;
  cliente_telefono: string;
  fecha_hora_inicio: string;
  whatsapp_phone_number_id: string;
  servicio_nombre: string;
  timezone: string;
}

export interface ResultadoRecordatorios {
  enviados: number;
  fallidos: number;
}

export async function procesarRecordatorios(params: {
  db: D1Database;
  whatsappToken: string;
  nombrePlantilla: string;
  idiomaPlantilla: string;
  ahoraUtc?: Date;
  fetchImpl?: typeof fetch;
}): Promise<ResultadoRecordatorios> {
  const ahoraUtc = params.ahoraUtc ?? new Date();
  const fetchImpl = params.fetchImpl ?? fetch;
  const hastaUtc = new Date(ahoraUtc.getTime() + MINUTOS_VENTANA * 60000);

  const citasResult = await params.db
    .prepare(
      `SELECT c.id, c.cliente_telefono, c.fecha_hora_inicio,
              n.whatsapp_phone_number_id, n.servicio_nombre, n.timezone
       FROM citas c
       JOIN negocios n ON n.id = c.negocio_id
       WHERE c.estado != 'cancelada' AND c.recordatorio_enviado = 0
         AND c.fecha_hora_inicio >= ? AND c.fecha_hora_inicio <= ?`
    )
    .bind(ahoraUtc.toISOString(), hastaUtc.toISOString())
    .all<CitaPendienteRow>();

  let enviados = 0;
  let fallidos = 0;

  for (const cita of citasResult.results) {
    try {
      const { horaHHMM } = utcToZoned(new Date(cita.fecha_hora_inicio), cita.timezone);
      await enviarPlantillaWhatsApp(
        {
          phoneNumberId: cita.whatsapp_phone_number_id,
          token: params.whatsappToken,
          para: cita.cliente_telefono,
          nombrePlantilla: params.nombrePlantilla,
          idioma: params.idiomaPlantilla,
          parametros: [cita.servicio_nombre, horaHHMM],
        },
        fetchImpl
      );
      await params.db.prepare("UPDATE citas SET recordatorio_enviado = 1 WHERE id = ?").bind(cita.id).run();
      enviados++;
    } catch (error) {
      // No se relanza: un recordatorio fallido no debe frenar los demás. La
      // fila queda con recordatorio_enviado = 0, así que el próximo cron
      // (5 min después) reintenta mientras siga dentro de la ventana.
      console.error(`Error al enviar recordatorio de la cita ${cita.id}:`, error);
      fallidos++;
    }
  }

  return { enviados, fallidos };
}
