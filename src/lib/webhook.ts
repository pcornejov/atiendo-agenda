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

export interface BotonEntrante {
  phoneNumberId: string; // identifica al negocio (negocios.whatsapp_phone_number_id)
  clienteTelefono: string; // E.164 con '+'
  payload: string; // el payload que le asignamos al botón al mandar la plantilla (ej. "confirmar_cita_123")
}

/**
 * Respuesta a un botón quick-reply de una plantilla (ej. "Confirmar"/"Cancelar"
 * del recordatorio) — WhatsApp la manda como `type: "button"`, distinto del
 * `type: "interactive"` que se usaría para botones de un mensaje de sesión
 * normal. Devuelve null si el payload no es de este tipo.
 */
export function parsearBotonWhatsApp(body: unknown): BotonEntrante | null {
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
      if (mensaje?.type !== "button" || typeof mensaje?.button?.payload !== "string") continue;

      const phoneNumberId = valor?.metadata?.phone_number_id;
      const from = mensaje?.from;
      if (typeof phoneNumberId !== "string" || typeof from !== "string") continue;

      return {
        phoneNumberId,
        clienteTelefono: normalizarTelefono(from),
        payload: mensaje.button.payload,
      };
    }
  }

  return null;
}
