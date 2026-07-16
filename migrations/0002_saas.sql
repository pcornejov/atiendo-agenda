-- Migration number: 0002    2026-07-16T00:00:00.000Z
--
-- Pivote a SaaS por suscripción multi-tenant: usuarios (login con Google),
-- catálogo de planes/módulos, suscripciones por negocio (Flow), y el schema
-- del módulo de comida (Nivel 2). No modifica ninguna tabla existente.

PRAGMA foreign_keys = ON;

-- ============================================================
-- usuarios: un login (Google) por negocio como máximo
-- ============================================================
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT NOT NULL UNIQUE,  -- 'sub' del id_token de Google, identificador estable
  email TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'dueno')),
  negocio_id INTEGER UNIQUE REFERENCES negocios(id) ON DELETE CASCADE, -- NULL hasta completar el onboarding
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX idx_usuarios_google_sub ON usuarios (google_sub);

-- ============================================================
-- planes y módulos: catálogo (pocas filas, editadas por migration)
-- ============================================================
CREATE TABLE planes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,        -- 'basico' | 'nivel2' | 'nivel3'
  nombre TEXT NOT NULL,
  precio_mensual_clp INTEGER NOT NULL CHECK (precio_mensual_clp >= 0),
  flow_plan_id TEXT,                  -- id devuelto por /plans/create en Flow; NULL hasta darlo de alta ahí
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
);

CREATE TABLE modulos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,        -- 'agendamiento' | 'pedidos'
  nombre TEXT NOT NULL
);

CREATE TABLE plan_modulos (
  plan_id INTEGER NOT NULL REFERENCES planes(id) ON DELETE CASCADE,
  modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, modulo_id)
);

-- ============================================================
-- negocio_suscripciones: estado de facturación de cada negocio (Flow)
-- ============================================================
CREATE TABLE negocio_suscripciones (
  negocio_id INTEGER PRIMARY KEY REFERENCES negocios(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES planes(id),
  estado TEXT NOT NULL CHECK (estado IN ('pendiente_pago', 'activa', 'vencida', 'cancelada')),
  flow_customer_id TEXT,
  flow_subscription_id TEXT,
  proxima_facturacion TEXT,  -- ISO8601 UTC, nullable
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Query del cron que detecta vencidas más allá del período de gracia
CREATE INDEX idx_suscripciones_estado ON negocio_suscripciones (estado);

-- ============================================================
-- Módulo de comida (Nivel 2): menú, pedidos
-- ============================================================
CREATE TABLE menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio_id INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio_clp INTEGER NOT NULL CHECK (precio_clp >= 0),
  disponible INTEGER NOT NULL DEFAULT 1 CHECK (disponible IN (0, 1)),
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Listar el menú disponible de un negocio, en orden de presentación
CREATE INDEX idx_menu_items_negocio ON menu_items (negocio_id, disponible, orden);

CREATE TABLE pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio_id INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  cliente_telefono TEXT NOT NULL,
  cliente_nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'confirmado', 'preparando', 'listo', 'entregado', 'cancelado')),
  total_clp INTEGER NOT NULL CHECK (total_clp >= 0),
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Panel de pedidos entrantes de un negocio, más nuevos primero
CREATE INDEX idx_pedidos_negocio_estado ON pedidos (negocio_id, estado, created_at);

CREATE TABLE pedido_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario_clp INTEGER NOT NULL CHECK (precio_unitario_clp >= 0) -- snapshot al momento del pedido
);

CREATE INDEX idx_pedido_items_pedido ON pedido_items (pedido_id);

-- ============================================================
-- Seed del catálogo (planes/módulos) — no son datos de un piloto, son
-- las 3 opciones de producto en sí; se versionan junto con el schema.
-- ============================================================
INSERT INTO modulos (codigo, nombre) VALUES
  ('agendamiento', 'Agendamiento de horas'),
  ('pedidos', 'Venta de comida');

INSERT INTO planes (codigo, nombre, precio_mensual_clp) VALUES
  ('basico', 'Básico', 0),
  ('nivel2', 'Nivel 2', 0);
-- precio_mensual_clp queda en 0 como placeholder hasta definir tarifas reales
-- y cargar el flow_plan_id correspondiente (fase de integración con Flow).
-- 'nivel3' no se crea todavía: el alcance de ese plan no está definido.

INSERT INTO plan_modulos (plan_id, modulo_id)
  SELECT p.id, m.id FROM planes p, modulos m
  WHERE p.codigo = 'basico' AND m.codigo = 'agendamiento';

INSERT INTO plan_modulos (plan_id, modulo_id)
  SELECT p.id, m.id FROM planes p, modulos m
  WHERE p.codigo = 'nivel2' AND m.codigo IN ('agendamiento', 'pedidos');
