// Copy de marketing por plan (nombre, descripción corta, qué incluye) — un
// solo lugar para que la landing (index.astro) y el paso de precio del
// wizard (onboarding/precio.astro) muestren exactamente lo mismo.

export interface InfoPlan {
  nombre: string;
  descripcion: string;
  incluye: string[];
}

export const INFO_PLANES: Record<string, InfoPlan> = {
  basico: {
    nombre: "Agenda de horas",
    descripcion: "Tus clientes reservan y consultan horas por WhatsApp.",
    incluye: [
      "Agenda ilimitada por WhatsApp, 24/7",
      "Recordatorios automáticos de citas",
      "Panel para administrar horarios y citas",
    ],
  },
  nivel2: {
    nombre: "Venta de comida",
    descripcion: "Tus clientes ven la carta y hacen pedidos por WhatsApp.",
    incluye: [
      "Pedidos ilimitados por WhatsApp, 24/7",
      "Carga de carta por foto, PDF o Excel",
      "Panel para administrar menú y pedidos",
    ],
  },
};
