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

export interface BotonPlantilla {
  indice: number; // posición del botón dentro de la plantilla aprobada (0 = primero)
  payload: string; // valor propio que vuelve en el webhook (message.button.payload) cuando el cliente lo toca
}

export interface EnviarPlantillaParams {
  phoneNumberId: string;
  token: string;
  para: string;
  nombrePlantilla: string;
  idioma: string; // código de idioma de la plantilla aprobada en Meta, ej. 'es' o 'es_CL'
  parametros: string[]; // reemplazan {{1}}, {{2}}, ... del body de la plantilla, en orden
  // Botones quick-reply de la plantilla (el texto de cada botón ya está fijo
  // en la plantilla aprobada por Meta — acá solo se referencia su posición y
  // se le asigna el payload dinámico que identifica a qué se refiere).
  botones?: BotonPlantilla[];
}

/** Mensaje de plantilla: la única forma de escribirle primero al cliente fuera de la ventana de 24h (ej. el recordatorio). Requiere una plantilla ya aprobada por Meta. */
export async function enviarPlantillaWhatsApp(
  params: EnviarPlantillaParams,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const components = [
    ...(params.parametros.length > 0
      ? [{ type: "body", parameters: params.parametros.map((texto) => ({ type: "text", text: texto })) }]
      : []),
    ...(params.botones ?? []).map((boton) => ({
      type: "button",
      sub_type: "quick_reply",
      index: String(boton.indice),
      parameters: [{ type: "payload", payload: boton.payload }],
    })),
  ];

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
        ...(components.length > 0 ? { components } : {}),
      },
    },
    fetchImpl
  );
}

export interface FilaLista {
  id: string; // vuelve tal cual en el webhook (interactive.list_reply.id) al tocarla
  titulo: string; // máx. 24 caracteres (límite de WhatsApp)
  descripcion?: string; // máx. 72 caracteres
}

export interface SeccionLista {
  titulo: string; // máx. 24 caracteres
  filas: FilaLista[];
}

export interface EnviarListaParams {
  phoneNumberId: string;
  token: string;
  para: string;
  cuerpo: string; // máx. 4096 caracteres
  textoBoton: string; // máx. 20 caracteres
  secciones: SeccionLista[]; // máx. 10 filas en TOTAL sumando todas las secciones
  pie?: string; // máx. 60 caracteres
}

/** Mensaje de servicio con lista interactiva (selector nativo de WhatsApp) — mismo requisito de ventana de 24h que enviarMensajeWhatsApp, no es un mensaje de plantilla. */
export async function enviarListaWhatsApp(
  params: EnviarListaParams,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  await llamarApiMensajes(
    params.phoneNumberId,
    params.token,
    {
      messaging_product: "whatsapp",
      to: params.para,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: params.cuerpo },
        ...(params.pie ? { footer: { text: params.pie } } : {}),
        action: {
          button: params.textoBoton,
          sections: params.secciones.map((seccion) => ({
            title: seccion.titulo,
            rows: seccion.filas.map((fila) => ({
              id: fila.id,
              title: fila.titulo,
              ...(fila.descripcion ? { description: fila.descripcion } : {}),
            })),
          })),
        },
      },
    },
    fetchImpl
  );
}
