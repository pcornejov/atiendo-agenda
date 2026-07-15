import Anthropic from "@anthropic-ai/sdk";
import { obtenerSlotsDisponibles } from "./lib/disponibilidad.ts";
import { interpretarSolicitud } from "./lib/nlu.ts";
import { utcToZoned, diaSemanaDeFecha, nombreDiaSemana } from "./lib/tz.ts";
import { parsearMensajeWhatsApp } from "./lib/webhook.ts";
import { procesarMensajeEntrante } from "./lib/flujo.ts";
import { procesarRecordatorios } from "./lib/recordatorios.ts";

export interface Env {
  DB: D1Database;
  // Secrets: `wrangler secret put <NOMBRE>` en prod, `.dev.vars` en local.
  // El phone_number_id de cada negocio vive en negocios.whatsapp_phone_number_id
  // (un solo Worker puede atender varios pilotos, cada uno con su propio
  // número); WHATSAPP_TOKEN es el token de la app de Meta, compartido.
  WHATSAPP_TOKEN: string;
  WHATSAPP_VERIFY_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  // Plantilla de WhatsApp aprobada por Meta para el recordatorio (mensaje
  // proactivo, fuera de la ventana de 24h — no puede ser un mensaje de
  // servicio normal). Nombre e idioma exactos tal como quedaron aprobados
  // en el Meta Business Manager. Ver README.
  WHATSAPP_TEMPLATE_RECORDATORIO_NOMBRE: string;
  WHATSAPP_TEMPLATE_RECORDATORIO_IDIOMA: string;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/interno/disponibilidad") {
      // Herramienta manual de verificación mientras no hay panel de admin:
      // permite chequear los slots libres de un piloto recién cargado sin
      // esperar a un mensaje real de WhatsApp.
      //   GET /interno/disponibilidad?negocio_id=1&limite=3&dias=14
      const negocioId = Number(url.searchParams.get("negocio_id"));
      if (!negocioId) {
        return new Response("Falta negocio_id", { status: 400 });
      }
      const limite = Number(url.searchParams.get("limite") ?? "3");
      const dias = Number(url.searchParams.get("dias") ?? "14");
      const slots = await obtenerSlotsDisponibles(env.DB, negocioId, {
        limite,
        diasHaciaAdelante: dias,
      });
      return Response.json({ negocio_id: negocioId, slots });
    }

    if (request.method === "POST" && url.pathname === "/interno/interpretar") {
      // Herramienta manual de verificación del NLU (Claude Haiku) mientras no
      // hay panel: simula el mensaje de un cliente y muestra qué entendió el
      // bot + qué horarios le ofrecería, sin pasar por WhatsApp.
      //   POST /interno/interpretar  { "negocio_id": 1, "mensaje": "tienen hora el jueves en la tarde?" }
      const body = (await request.json().catch(() => null)) as
        | { negocio_id?: number; mensaje?: string }
        | null;
      if (!body?.negocio_id || !body?.mensaje) {
        return new Response("El body debe incluir negocio_id y mensaje", { status: 400 });
      }

      const negocio = await env.DB.prepare(
        "SELECT servicio_nombre, duracion_minutos, timezone FROM negocios WHERE id = ? AND activo = 1"
      )
        .bind(body.negocio_id)
        .first<{ servicio_nombre: string; duracion_minutos: number; timezone: string }>();
      if (!negocio) {
        return new Response("Negocio no encontrado", { status: 404 });
      }

      const ahoraUtc = new Date();
      const { fechaYMD: hoyYMD } = utcToZoned(ahoraUtc, negocio.timezone);
      const diaSemanaHoyTexto = nombreDiaSemana(diaSemanaDeFecha(hoyYMD));

      const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const interpretacion = await interpretarSolicitud(claude, {
        mensajeCliente: body.mensaje,
        servicioNombre: negocio.servicio_nombre,
        duracionMinutos: negocio.duracion_minutos,
        hoyYMD,
        diaSemanaHoyTexto,
      });

      const slots =
        interpretacion.intent === "consultar_disponibilidad"
          ? await obtenerSlotsDisponibles(env.DB, body.negocio_id, {
              limite: 3,
              ahoraUtc,
              fechaInicio: interpretacion.fechaPreferida ?? undefined,
              rangoHorario: interpretacion.rangoHorarioPreferido ?? undefined,
            })
          : [];

      return Response.json({ interpretacion, slots });
    }

    if (request.method === "GET" && url.pathname === "/webhook") {
      // Handshake de verificación del webhook de WhatsApp Cloud API (Meta lo
      // llama una vez al registrar la URL de callback en el dashboard).
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
        return new Response(challenge, { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      const body = await request.json().catch(() => null);
      const mensaje = body ? parsearMensajeWhatsApp(body) : null;

      if (mensaje) {
        // Se procesa antes de responder (en vez de ctx.waitUntil) para que
        // cualquier error quede en los logs de este request y no se pierda
        // en una tarea en background — el volumen esperado (pocos pilotos,
        // un mensaje a la vez) hace esto rápido de sobra dentro del timeout
        // de ack de WhatsApp.
        await procesarMensajeEntrante({
          db: env.DB,
          claude: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
          whatsappToken: env.WHATSAPP_TOKEN,
          mensaje,
        });
      }
      // Si no hay mensaje de texto (status update, otro tipo de mensaje,
      // payload inesperado) no hay nada que procesar, pero igual se
      // responde 200 — WhatsApp reintenta si no recibe un ack rápido.
      return new Response("OK", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const resultado = await procesarRecordatorios({
      db: env.DB,
      whatsappToken: env.WHATSAPP_TOKEN,
      nombrePlantilla: env.WHATSAPP_TEMPLATE_RECORDATORIO_NOMBRE,
      idiomaPlantilla: env.WHATSAPP_TEMPLATE_RECORDATORIO_IDIOMA,
    });
    console.log(
      `Cron de recordatorios (${new Date(event.scheduledTime).toISOString()}): ${resultado.enviados} enviados, ${resultado.fallidos} fallidos`
    );
  },
} satisfies ExportedHandler<Env>;
