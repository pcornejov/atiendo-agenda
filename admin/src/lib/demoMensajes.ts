// Transcripciones de ejemplo para la demo animada de chat (componente
// ChatDemo.astro), usadas tanto en /onboarding/servicio como en la landing
// page (index.astro) — un solo lugar para que ambas pantallas muestren
// exactamente lo mismo, sin que se desincronicen.
//
// Armadas con el texto exacto que hoy produce el bot (src/lib/mensajes.ts
// del proyecto del bot — formatearOfertaHorarios, formatearConfirmacion,
// formatearMenu, formatearPreguntaTipoEntrega, formatearResumenPedido,
// formatearPedidoConfirmado), con datos de ejemplo inventados. El bot solo
// tiene dos "familias" reales de mensajes — agenda genérica y pedidos de
// comida — así que cualquier rubro nuevo es solo vestir esas mismas dos
// familias con otro nombre de negocio/servicio, nunca texto que el bot no
// diría de verdad.

export interface Mensaje {
  de: "cliente" | "bot";
  texto: string;
}

export const DEMO_AGENDA: Mensaje[] = [
  { de: "cliente", texto: "Hola! quiero pedir hora para corte de pelo" },
  {
    de: "bot",
    texto:
      "Tengo estos horarios disponibles para Corte de pelo:\n1) jueves 16/07 10:00\n2) jueves 16/07 11:30\n3) viernes 17/07 09:00\n\nResponde con el número de la opción que prefieras.",
  },
  { de: "cliente", texto: "2" },
  {
    de: "bot",
    texto:
      "¡Listo! Quedaste agendado para Corte de pelo el jueves 16/07 11:30. Te voy a escribir 1 hora antes para recordarte.",
  },
];

export const DEMO_COMIDA: Mensaje[] = [
  { de: "cliente", texto: "Hola, quiero ver la carta" },
  {
    de: "bot",
    texto:
      "Este es nuestro menú:\n- Empanada de pino — $1.800\n- Completo italiano — $2.500\n- Bebida 350cc — $1.200\n\nDime qué quieres pedir y en qué cantidad.",
  },
  { de: "cliente", texto: "2 empanadas de pino y una bebida" },
  { de: "bot", texto: "¿Retiras el pedido en el local, o prefieres que te lo despachemos?" },
  { de: "cliente", texto: "Retiro" },
  {
    de: "bot",
    texto:
      "Tu pedido:\n- 2x Empanada de pino — $3.600\n- 1x Bebida 350cc — $1.200\nTotal: $4.800\nRetiro en el local\n\n¿Confirmas el pedido?",
  },
  { de: "cliente", texto: "Sí" },
  {
    de: "bot",
    texto: "¡Listo! Tu pedido #482 quedó confirmado por un total de $4.800. Te avisamos cuando esté listo.",
  },
];

export const DEMO_DENTAL: Mensaje[] = [
  { de: "cliente", texto: "Hola, necesito una hora para limpieza dental" },
  {
    de: "bot",
    texto:
      "Tengo estos horarios disponibles para Limpieza dental:\n1) lunes 20/07 09:30\n2) martes 21/07 15:00\n3) miércoles 22/07 11:00\n\nResponde con el número de la opción que prefieras.",
  },
  { de: "cliente", texto: "1" },
  {
    de: "bot",
    texto:
      "¡Listo! Quedaste agendado para Limpieza dental el lunes 20/07 09:30. Te voy a escribir 1 hora antes para recordarte.",
  },
];

export const DEMO_CAFETERIA: Mensaje[] = [
  { de: "cliente", texto: "Hola, ¿qué tienen para el desayuno?" },
  {
    de: "bot",
    texto:
      "Este es nuestro menú:\n- Café con leche — $1.500\n- Croissant de jamón y queso — $2.200\n- Jugo de naranja natural — $1.800\n\nDime qué quieres pedir y en qué cantidad.",
  },
  { de: "cliente", texto: "Un café con leche y un croissant" },
  { de: "bot", texto: "¿Retiras el pedido en el local, o prefieres que te lo despachemos?" },
  { de: "cliente", texto: "Retiro" },
  {
    de: "bot",
    texto:
      "Tu pedido:\n- 1x Café con leche — $1.500\n- 1x Croissant de jamón y queso — $2.200\nTotal: $3.700\nRetiro en el local\n\n¿Confirmas el pedido?",
  },
  { de: "cliente", texto: "Sí" },
  {
    de: "bot",
    texto: "¡Listo! Tu pedido #215 quedó confirmado por un total de $3.700. Te avisamos cuando esté listo.",
  },
];
