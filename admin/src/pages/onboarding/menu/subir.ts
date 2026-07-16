// Recibe una o más fotos/PDF de la carta, las manda a Claude Sonnet
// (menu-parser.ts) para extraer los ítems, y deja el resultado en la sesión
// (sin guardar nada en la base todavía) para que /onboarding/menu/revisar lo
// muestre editable antes de confirmar.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import Anthropic from "@anthropic-ai/sdk";
import { extraerItemsDeCarta, type ArchivoCarta, type MediaTypeImagen } from "../../../lib/menu-parser.ts";

const TIPOS_IMAGEN_VALIDOS = new Set<MediaTypeImagen>(["image/jpeg", "image/png", "image/gif", "image/webp"]);
// Anthropic limita el request a 32MB (ya codificado en base64, que infla ~33%
// el tamaño original) — 15MB de archivos originales en total da margen.
const TAMANO_MAXIMO_TOTAL_BYTES = 15 * 1024 * 1024;

export const POST: APIRoute = async ({ request, redirect, session, locals }) => {
  const usuario = locals.usuario;
  if (usuario.rol !== "dueno" || !usuario.negocio_id) {
    return redirect(usuario.rol === "admin" ? "/admin/negocios" : "/onboarding");
  }

  const form = await request.formData();
  const archivosSubidos = form.getAll("archivos").filter((a): a is File => a instanceof File && a.size > 0);

  if (archivosSubidos.length === 0) {
    return redirect("/onboarding/menu?error=sin_archivos");
  }

  const tamanoTotal = archivosSubidos.reduce((acc, a) => acc + a.size, 0);
  if (tamanoTotal > TAMANO_MAXIMO_TOTAL_BYTES) {
    return redirect("/onboarding/menu?error=archivos_muy_grandes");
  }

  const archivos: ArchivoCarta[] = [];
  for (const archivo of archivosSubidos) {
    const buffer = await archivo.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    if (archivo.type === "application/pdf") {
      archivos.push({ tipo: "pdf", base64 });
    } else if (TIPOS_IMAGEN_VALIDOS.has(archivo.type as MediaTypeImagen)) {
      archivos.push({ tipo: "imagen", mediaType: archivo.type as MediaTypeImagen, base64 });
    }
    // Otros tipos de archivo (ej. .docx) se ignoran silenciosamente — el
    // input del formulario ya filtra con accept="image/*,application/pdf".
  }

  if (archivos.length === 0) {
    return redirect("/onboarding/menu?error=formato_no_soportado");
  }

  try {
    const claude = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const items = await extraerItemsDeCarta(claude, archivos);
    if (items.length === 0) {
      return redirect("/onboarding/menu?error=no_se_reconocieron_items");
    }
    session?.set("menu_borrador", items, { ttl: 600 });
    return redirect("/onboarding/menu/revisar");
  } catch (error) {
    console.error("Error leyendo la carta con Claude:", error);
    return redirect("/onboarding/menu?error=fallo_lectura");
  }
};
