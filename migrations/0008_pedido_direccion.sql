-- Migration number: 0008    2026-07-17T01:00:00.000Z
--
-- Dirección de despacho del pedido. `notas` (comentario/personalización del
-- pedido completo) ya existe desde 0002_saas.sql pero nunca se usó — esta
-- migration no la toca, solo se empieza a llenar desde el código.

ALTER TABLE pedidos ADD COLUMN direccion_despacho TEXT;
