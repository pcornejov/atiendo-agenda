-- Ejemplo de alta manual de un negocio piloto (Fase 1: sin panel self-service,
-- el owner carga cada piloto a mano vía:
--   npx wrangler d1 execute atiendo-agenda-db --local  --file=./seed.sql   (dev)
--   npx wrangler d1 execute atiendo-agenda-db --remote --file=./seed.sql   (prod)
--
-- Este archivo es una PLANTILLA: copiar y editar los valores por cada nuevo
-- piloto antes de correrlo, no reutilizar tal cual para negocios distintos.

INSERT INTO negocios (
  nombre,
  telefono_whatsapp,
  whatsapp_phone_number_id,
  servicio_nombre,
  duracion_minutos,
  timezone,
  activo
) VALUES (
  'Peluquería Ejemplo',         -- nombre
  '+56912345678',               -- telefono_whatsapp (número visible, E.164)
  '123456789012345',            -- whatsapp_phone_number_id (Meta App > WhatsApp > API Setup > "Phone number ID")
  'Corte de pelo',              -- servicio_nombre
  45,                           -- duracion_minutos
  'America/Santiago',           -- timezone
  1                             -- activo
);

-- Disponibilidad semanal: martes a sábado, 10:00-19:00 (sábado hasta las 18:00).
-- dia_semana: 0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves, 5=viernes, 6=sábado
INSERT INTO horarios_disponibles (negocio_id, dia_semana, hora_inicio, hora_fin)
VALUES
  ((SELECT id FROM negocios WHERE whatsapp_phone_number_id = '123456789012345'), 2, '10:00', '19:00'),
  ((SELECT id FROM negocios WHERE whatsapp_phone_number_id = '123456789012345'), 3, '10:00', '19:00'),
  ((SELECT id FROM negocios WHERE whatsapp_phone_number_id = '123456789012345'), 4, '10:00', '19:00'),
  ((SELECT id FROM negocios WHERE whatsapp_phone_number_id = '123456789012345'), 5, '10:00', '19:00'),
  ((SELECT id FROM negocios WHERE whatsapp_phone_number_id = '123456789012345'), 6, '10:00', '18:00');

-- Suscripción activa en plan Básico: sin esto, el bot no responde nada — la
-- arquitectura de módulos (ver src/lib/flujo.ts) solo ofrece los intents de
-- los módulos que el plan activo del negocio incluye.
INSERT INTO negocio_suscripciones (negocio_id, plan_id, estado)
VALUES (
  (SELECT id FROM negocios WHERE whatsapp_phone_number_id = '123456789012345'),
  (SELECT id FROM planes WHERE codigo = 'basico'),
  'activa'
);
