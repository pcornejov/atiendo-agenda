-- Migration number: 0001    2026-07-15T00:00:00.000Z

PRAGMA foreign_keys = ON;

-- ============================================================
-- negocios: un registro por negocio piloto (profesional único)
-- ============================================================
CREATE TABLE negocios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono_whatsapp TEXT NOT NULL,               -- número visible E.164, ej. +56912345678
  whatsapp_phone_number_id TEXT NOT NULL UNIQUE, -- phone_number_id de Meta (metadata del webhook); rutea el mensaje entrante a este negocio
  servicio_nombre TEXT NOT NULL,
  duracion_minutos INTEGER NOT NULL CHECK (duracion_minutos > 0),
  timezone TEXT NOT NULL DEFAULT 'America/Santiago',
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX idx_negocios_phone_number_id ON negocios (whatsapp_phone_number_id);

-- ============================================================
-- horarios_disponibles: ventanas semanales recurrentes de disponibilidad
-- ============================================================
CREATE TABLE horarios_disponibles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio_id INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=domingo .. 6=sábado (igual a strftime('%w') y a Date.getDay() en JS)
  hora_inicio TEXT NOT NULL,   -- 'HH:MM' 24h, hora local según negocios.timezone
  hora_fin TEXT NOT NULL,      -- 'HH:MM' 24h, hora local según negocios.timezone
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (hora_fin > hora_inicio)
);

CREATE INDEX idx_horarios_negocio_dia ON horarios_disponibles (negocio_id, dia_semana);

-- ============================================================
-- clientes: cache de clientes conocidos por teléfono
-- ============================================================
CREATE TABLE clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefono TEXT NOT NULL UNIQUE, -- E.164, ej. +56912345678
  nombre TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX idx_clientes_telefono ON clientes (telefono);

-- ============================================================
-- citas
-- ============================================================
CREATE TABLE citas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio_id INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  cliente_telefono TEXT NOT NULL,          -- denormalizado para lookup rápido de cancelación; no es FK a clientes.telefono
  cliente_nombre TEXT,
  fecha_hora_inicio TEXT NOT NULL,         -- ISO8601 UTC, ej. '2026-07-16T18:00:00.000Z'
  fecha_hora_fin TEXT NOT NULL,            -- ISO8601 UTC
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'confirmada', 'cancelada', 'completada')),
  recordatorio_enviado INTEGER NOT NULL DEFAULT 0 CHECK (recordatorio_enviado IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Query del cron de recordatorios: estado != 'cancelada' AND recordatorio_enviado = 0
--   AND fecha_hora_inicio BETWEEN now AND now+70min
CREATE INDEX idx_citas_reminder_scan
  ON citas (recordatorio_enviado, estado, fecha_hora_inicio);

-- Buscar la cita activa de un cliente para cancelar: cliente_telefono + estado
CREATE INDEX idx_citas_cliente_estado
  ON citas (cliente_telefono, estado);

-- Chequeo de solapamiento de horario al agendar dentro de un negocio
CREATE INDEX idx_citas_negocio_fecha
  ON citas (negocio_id, fecha_hora_inicio);

-- ============================================================
-- conversaciones_estado: estado de conversación multi-turno.
-- Una fila upserted por (negocio_id, cliente_telefono) — un cliente solo
-- tiene un estado pendiente a la vez (ej. "le ofrecí horarios, espero que
-- elija uno"). expira_en maneja el caso de que el cliente no responda y
-- escriba algo no relacionado más tarde.
-- ============================================================
CREATE TABLE conversaciones_estado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio_id INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  cliente_telefono TEXT NOT NULL,
  estado TEXT NOT NULL,                 -- ej. 'esperando_seleccion_horario', 'esperando_confirmacion_cancelacion'
  contexto TEXT NOT NULL DEFAULT '{}',  -- JSON: horarios ofrecidos, datos parciales de la reserva, etc.
  expira_en TEXT NOT NULL,              -- ISO8601 UTC; pasado este momento el estado se considera obsoleto
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (negocio_id, cliente_telefono)
);

CREATE INDEX idx_conversaciones_negocio_cliente
  ON conversaciones_estado (negocio_id, cliente_telefono);
