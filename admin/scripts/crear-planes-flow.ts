// Script manual de una sola vez: da de alta los planes en Flow (no se crean
// en cada alta de negocio) y muestra el flow_plan_id que hay que guardar a
// mano en la tabla `planes` (columna flow_plan_id) de la base remota.
//
// Uso:
//   FLOW_API_KEY=... FLOW_SECRET_KEY=... FLOW_BASE_URL=https://sandbox.flow.cl/api \
//     node --experimental-strip-types admin/scripts/crear-planes-flow.ts
//
// Ajustar PLANES abajo con los precios reales antes de correrlo en producción.

import { crearPlanFlow } from "../src/lib/flow.ts";

const PLANES = [
  { planId: "atiendo-basico", name: "Atiendo Agenda — Básico", amount: 0 },
  { planId: "atiendo-nivel2", name: "Atiendo Agenda — Nivel 2", amount: 0 },
];

async function main() {
  const apiKey = process.env.FLOW_API_KEY;
  const secretKey = process.env.FLOW_SECRET_KEY;
  const baseUrl = process.env.FLOW_BASE_URL ?? "https://sandbox.flow.cl/api";
  if (!apiKey || !secretKey) {
    console.error("Faltan FLOW_API_KEY / FLOW_SECRET_KEY en el entorno.");
    process.exit(1);
  }

  for (const plan of PLANES) {
    const resultado = await crearPlanFlow(
      { apiKey, secretKey, baseUrl },
      { ...plan, currency: "CLP", interval: 1, interval_count: 1 }
    );
    console.log(`${plan.planId} -> flow_plan_id: ${resultado.planId}`);
    console.log(
      `  UPDATE planes SET flow_plan_id = '${resultado.planId}' WHERE codigo = '${plan.planId === "atiendo-basico" ? "basico" : "nivel2"}';`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
