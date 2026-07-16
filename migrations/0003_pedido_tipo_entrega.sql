-- Migration number: 0003    2026-07-16T00:00:00.000Z
--
-- Retiro vs. despacho, pedido explícitamente por el bot antes de confirmar
-- un pedido (src/lib/modulos/pedidos.ts). Nullable a nivel de base: la
-- garantía de que siempre queda cargado antes de crear el pedido la da el
-- flujo de conversación, no una constraint — mismo criterio que
-- cliente_nombre, que tampoco es NOT NULL.

ALTER TABLE pedidos ADD COLUMN tipo_entrega TEXT CHECK (tipo_entrega IN ('retiro', 'despacho'));
