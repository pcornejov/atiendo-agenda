-- Migration number: 0004    2026-07-16T00:00:00.000Z
--
-- Precios reales de los planes (quedaron en 0 como placeholder en 0002_saas.sql
-- hasta definir la tarifa). Agenda de horas: $20.000/mes. Venta de comida: $30.000/mes.

UPDATE planes SET precio_mensual_clp = 20000 WHERE codigo = 'basico';
UPDATE planes SET precio_mensual_clp = 30000 WHERE codigo = 'nivel2';
