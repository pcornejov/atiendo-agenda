-- Migration number: 0005    2026-07-16T00:00:00.000Z
--
-- El plan 'nivel2' (Venta de comida) quedó sembrado en 0002_saas.sql con
-- los módulos 'agendamiento' y 'pedidos' juntos, pensado como plan superior
-- que incluye todo. Pero el wizard de onboarding (Etapa 1) presenta Agenda
-- y Venta de comida como una elección excluyente — un negocio que elige
-- "Venta de comida" no debería terminar ofreciendo también agendar horas.
-- Se saca 'agendamiento' de 'nivel2', dejando solo 'pedidos'.

DELETE FROM plan_modulos
WHERE plan_id = (SELECT id FROM planes WHERE codigo = 'nivel2')
  AND modulo_id = (SELECT id FROM modulos WHERE codigo = 'agendamiento');
