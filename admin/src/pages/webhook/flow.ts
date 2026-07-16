// Flow no manda los datos del pago en el POST — manda un token y hay que
// consultarle el estado real con ese token (mismo patrón de "no confiar en
// el payload entrante, responder rápido" que ya usa POST /webhook del bot
// para WhatsApp: siempre 200, el procesamiento real va en un try/catch).
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { obtenerEstadoPorToken } from "../../lib/flow.ts";
import { obtenerNegocioIdPorFlowCustomerId, activarSuscripcion, marcarSuscripcionVencida } from "../../lib/db.ts";

// VERIFICAR contra la documentación real de Flow: valores exactos de
// "status" que puede devolver /payment/getStatus (o el endpoint de estado de
// suscripción que corresponda) para un cobro exitoso vs. fallido/cancelado.
const ESTADOS_ACTIVA = new Set(["active", "paid"]);
const ESTADOS_VENCIDA = new Set(["failed", "canceled", "rejected"]);

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData();
    const token = String(form.get("token") ?? "");
    if (!token) return new Response("OK", { status: 200 });

    const credenciales = {
      apiKey: env.FLOW_API_KEY,
      secretKey: env.FLOW_SECRET_KEY,
      baseUrl: env.FLOW_BASE_URL,
    };
    const estado = await obtenerEstadoPorToken(credenciales, token);
    if (!estado.customerId) return new Response("OK", { status: 200 });

    const negocioId = await obtenerNegocioIdPorFlowCustomerId(env.DB, estado.customerId);
    if (!negocioId) return new Response("OK", { status: 200 });

    if (ESTADOS_ACTIVA.has(estado.status)) {
      await activarSuscripcion(env.DB, negocioId, {
        flowSubscriptionId: estado.subscriptionId ?? "",
        proximaFacturacion: null, // VERIFICAR: Flow debería devolver la próxima fecha de cobro
      });
    } else if (ESTADOS_VENCIDA.has(estado.status)) {
      await marcarSuscripcionVencida(env.DB, negocioId);
    }
  } catch (error) {
    console.error("Error procesando webhook de Flow:", error);
  }
  return new Response("OK", { status: 200 });
};
