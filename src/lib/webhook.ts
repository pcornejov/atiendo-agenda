// Parseo del payload que manda WhatsApp Cloud API a nuestro webhook. El
// mismo endpoint recibe mensajes de texto, otros tipos de mensaje (imagen,
// audio, etc.) y actualizaciones de estado (entregado/leído) — solo nos
// interesan los mensajes de texto, el resto se ignora silenciosamente.

export interface MensajeEntrante {
  phoneNumberId: string; // identifica al negocio (negocios.whatsapp_phone_number_id)
  clienteTelefono: string; // E.164 con '+'
  clienteNombrePerfil: string | null; // nombre de WhatsApp del remitente, si viene
  texto: string;
}

function normalizarTelefono(numero: string): string {
  return numero.startsWith("+") ? numero : `+${numero}`;
}

/** Devuelve el primer mensaje de texto entrante del payload, o null si no hay ninguno (status update, otro tipo de mensaje, payload inesperado). */
export function parsearMensajeWhatsApp(body: unknown): MensajeEntrante | null {
  if (typeof body !== "object" || body === null) return null;
  const entradas = (body as Record<string, unknown>).entry;
  if (!Array.isArray(entradas)) return null;

  for (const entrada of entradas) {
    const cambios = entrada?.changes;
    if (!Array.isArray(cambios)) continue;

    for (const cambio of cambios) {
      const valor = cambio?.value;
      const mensajes = valor?.messages;
      if (!Array.isArray(mensajes) || mensajes.length === 0) continue;

      const mensaje = mensajes[0];
      if (mensaje?.type !== "text" || typeof mensaje?.text?.body !== "string") continue;

      const phoneNumberId = valor?.metadata?.phone_number_id;
      const from = mensaje?.from;
      if (typeof phoneNumberId !== "string" || typeof from !== "string") continue;

      const contactos = valor?.contacts;
      const nombrePerfil =
        Array.isArray(contactos) && typeof contactos[0]?.profile?.name === "string"
          ? (contactos[0].profile.name as string)
          : null;

      return {
        phoneNumberId,
        clienteTelefono: normalizarTelefono(from),
        clienteNombrePerfil: nombrePerfil,
        texto: mensaje.text.body,
      };
    }
  }

  return null;
}
