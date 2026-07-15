// Envío de mensajes por WhatsApp Cloud API. `fetchImpl` se puede inyectar
// para testear la construcción del request sin red real.

async function llamarApiMensajes(
  phoneNumberId: string,
  token: string,
  body: unknown,
  fetchImpl: typeof fetch
): Promise<void> {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const respuesta = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`Error al enviar mensaje de WhatsApp (${respuesta.status}): ${detalle}`);
  }
}

export interface EnviarMensajeParams {
  phoneNumberId: string;
  token: string;
  para: string; // E.164, ej. +56912345678
  texto: string;
}

/** Mensaje de servicio/sesión: gratis y sin restricciones dentro de la ventana de 24h desde el último mensaje del cliente. */
export async function enviarMensajeWhatsApp(
  params: EnviarMensajeParams,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  await llamarApiMensajes(
    params.phoneNumberId,
    params.token,
    {
      messaging_product: "whatsapp",
      to: params.para,
      type: "text",
      text: { body: params.texto },
    },
    fetchImpl
  );
}

export interface EnviarPlantillaParams {
  phoneNumberId: string;
  token: string;
  para: string;
  nombrePlantilla: string;
  idioma: string; // código de idioma de la plantilla aprobada en Meta, ej. 'es' o 'es_CL'
  parametros: string[]; // reemplazan {{1}}, {{2}}, ... del body de la plantilla, en orden
}

/** Mensaje de plantilla: la única forma de escribirle primero al cliente fuera de la ventana de 24h (ej. el recordatorio). Requiere una plantilla ya aprobada por Meta. */
export async function enviarPlantillaWhatsApp(
  params: EnviarPlantillaParams,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  await llamarApiMensajes(
    params.phoneNumberId,
    params.token,
    {
      messaging_product: "whatsapp",
      to: params.para,
      type: "template",
      template: {
        name: params.nombrePlantilla,
        language: { code: params.idioma },
        ...(params.parametros.length > 0
          ? { components: [{ type: "body", parameters: params.parametros.map((texto) => ({ type: "text", text: texto })) }] }
          : {}),
      },
    },
    fetchImpl
  );
}
