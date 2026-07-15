// Envío de mensajes por WhatsApp Cloud API. `fetchImpl` se puede inyectar
// para testear la construcción del request sin red real.

export interface EnviarMensajeParams {
  phoneNumberId: string;
  token: string;
  para: string; // E.164, ej. +56912345678
  texto: string;
}

export async function enviarMensajeWhatsApp(
  params: EnviarMensajeParams,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const respuesta = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: params.para,
      type: "text",
      text: { body: params.texto },
    }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`Error al enviar mensaje de WhatsApp (${respuesta.status}): ${detalle}`);
  }
}
