-- Migration number: 0007    2026-07-17T00:00:00.000Z
--
-- Agrupa el menú por categoría (Hamburguesas, Bebidas, ...) para poder
-- mandarlo como mensaje de lista interactiva de WhatsApp (categoría → ítems
-- de esa categoría) en vez de un solo bloque de texto. NULL = sin
-- categorizar todavía; el bot los agrupa bajo "Menú" como fallback (ver
-- src/lib/listaMenu.ts).

ALTER TABLE menu_items ADD COLUMN categoria TEXT;
