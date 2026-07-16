// Contrato de un "módulo" del bot (agendamiento, pedidos, ...). Un negocio
// tiene un set de módulos activos según su plan (ver negocio_suscripciones/
// plan_modulos en la base) — flujo.ts arma la tool de Claude a partir de los
// intents de esos módulos y despacha el intent devuelto al módulo dueño.

import type { ClienteClaude, SolicitudInterpretada, DescripcionIntent } from "../nlu.ts";
import type { MensajeEntrante } from "../webhook.ts";

export interface NegocioRow {
  id: number;
  servicio_nombre: string;
  duracion_minutos: number;
  timezone: string;
  whatsapp_phone_number_id: string;
}

export interface ContextoModulo {
  db: D1Database;
  claude: ClienteClaude;
  negocio: NegocioRow;
  mensaje: MensajeEntrante;
  ahoraUtc: Date;
  enviar: (texto: string) => Promise<void>;
}

export interface DefinicionModulo {
  codigo: string;
  intents: DescripcionIntent[];
  /**
   * Maneja un intent nuevo (sin conversación pendiente). Devuelve true si
   * este módulo lo reconoció y lo manejó (así flujo.ts sabe no seguir
   * probando con los demás módulos activos ni caer al fallback genérico).
   */
  manejarIntent(solicitud: SolicitudInterpretada, ctx: ContextoModulo): Promise<boolean>;
  /**
   * Reanuda una conversación en curso propia de este módulo. El estado
   * guardado en conversaciones_estado viene prefijado como `${codigo}:...` —
   * acá llega ya sin ese prefijo.
   */
  manejarEstadoPendiente?(estadoSinPrefijo: string, contexto: unknown, ctx: ContextoModulo): Promise<void>;
}
