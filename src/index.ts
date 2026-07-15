export interface Env {
  DB: D1Database;
  // Secrets: `wrangler secret put <NOMBRE>` en prod, `.dev.vars` en local.
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_VERIFY_TOKEN: string;
  ANTHROPIC_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

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
      // TODO(próxima sesión): parsear el payload del webhook, rutear al
      // negocio correcto vía metadata.phone_number_id, interpretar el
      // mensaje con Claude Haiku, calcular disponibilidad contra
      // horarios_disponibles + citas, responder por la API de WhatsApp
      // (mensaje de servicio, gratis dentro de la ventana de 24h), manejar
      // "cancelar" contra conversaciones_estado/citas.
      //
      // Por ahora: drenar el body (para que Meta no reintente por timeout)
      // y responder 200 de inmediato — WhatsApp exige un ack rápido
      // independiente del procesamiento posterior.
      await request.text();
      return new Response("OK", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {
    // TODO(próxima sesión): consultar `citas` con estado != 'cancelada' AND
    // recordatorio_enviado = 0 AND fecha_hora_inicio entre ahora y
    // ahora+70min, enviar un mensaje de plantilla de WhatsApp (proactivo,
    // fuera de la ventana de 24h así que requiere plantilla pre-aprobada)
    // por cada una, y marcar recordatorio_enviado = 1.
    console.log(`Cron disparado a las ${new Date(event.scheduledTime).toISOString()}`);
  },
} satisfies ExportedHandler<Env>;
