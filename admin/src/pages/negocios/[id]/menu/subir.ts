// Igual que src/pages/onboarding/menu/subir.ts, pero para un negocio ya
// existente (dueño o admin), no solo durante el alta inicial.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import Anthropic from "@anthropic-ai/sdk";
import { extraerItemsDeCarta, extraerTextoDeExcel, type ArchivoCarta, type MediaTypeImagen } from "../../../../lib/menu-parser.ts";
import { puedeAdministrarNegocio } from "../../../../lib/autorizacion.ts";

const TIPOS_IMAGEN_VALIDOS = new Set<MediaTypeImagen>(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const TIPO_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TAMANO_MAXIMO_TOTAL_BYTES = 15 * 1024 * 1024;

export const POST: APIRoute = async ({ request, redirect, session, locals, params }) => {
  const negocioId = Number(params.id);
  if (!puedeAdministrarNegocio(locals.usuario, negocioId)) {
    return new Response("No autorizado", { status: 403 });
  }

  const form = await request.formData();
  const archivosSubidos = form.getAll("archivos").filter((a): a is File => a instanceof File && a.size > 0);

  if (archivosSubidos.length === 0) {
    return redirect(`/negocios/${negocioId}/menu?error=sin_archivos`);
  }

  const tamanoTotal = archivosSubidos.reduce((acc, a) => acc + a.size, 0);
  if (tamanoTotal > TAMANO_MAXIMO_TOTAL_BYTES) {
    return redirect(`/negocios/${negocioId}/menu?error=archivos_muy_grandes`);
  }

  const archivos: ArchivoCarta[] = [];
  try {
    for (const archivo of archivosSubidos) {
      const buffer = await archivo.arrayBuffer();
      if (archivo.type === "application/pdf") {
        archivos.push({ tipo: "pdf", base64: Buffer.from(buffer).toString("base64") });
      } else if (TIPOS_IMAGEN_VALIDOS.has(archivo.type as MediaTypeImagen)) {
        archivos.push({ tipo: "imagen", mediaType: archivo.type as MediaTypeImagen, base64: Buffer.from(buffer).toString("base64") });
      } else if (archivo.type === TIPO_EXCEL || archivo.name.toLowerCase().endsWith(".xlsx")) {
        archivos.push({ tipo: "texto", contenido: extraerTextoDeExcel(buffer) });
      }
    }
  } catch (error) {
    console.error("Error leyendo un archivo de la carta:", error);
    return redirect(`/negocios/${negocioId}/menu?error=fallo_lectura`);
  }

  if (archivos.length === 0) {
    return redirect(`/negocios/${negocioId}/menu?error=formato_no_soportado`);
  }

  try {
    const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const items = await extraerItemsDeCarta(claude, archivos);
    if (items.length === 0) {
      return redirect(`/negocios/${negocioId}/menu?error=no_se_reconocieron_items`);
    }
    session?.set(`menu_borrador_${negocioId}`, items, { ttl: 600 });
    return redirect(`/negocios/${negocioId}/menu/revisar`);
  } catch (error) {
    console.error("Error leyendo la carta con Claude:", error);
    return redirect(`/negocios/${negocioId}/menu?error=fallo_lectura`);
  }
};
