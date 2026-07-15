import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  // 'passthrough': no procesamos imágenes (no usamos <Image>), evita requerir
  // el binding de Cloudflare Images que el adapter habilita por defecto.
  adapter: cloudflare({ imageService: "passthrough" }),
});
