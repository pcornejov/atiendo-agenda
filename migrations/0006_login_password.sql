-- Migration number: 0006    2026-07-16T00:00:00.000Z
--
-- Login clásico (email + contraseña) además de Google OAuth. google_sub pasa
-- a ser opcional (NULL para cuentas creadas por contraseña); se agrega
-- password_hash (NULL para cuentas Google) y un índice único sobre email
-- para bloquear duplicados entre ambos métodos de login.
--
-- SQLite no permite relajar NOT NULL con ALTER COLUMN, así que se reconstruye
-- la tabla (patrón de SQLite para cambios de schema no triviales).

PRAGMA foreign_keys = OFF;

CREATE TABLE usuarios_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT UNIQUE,           -- NULL si la cuenta se creó con email/contraseña
  email TEXT NOT NULL,
  password_hash TEXT,               -- NULL si la cuenta se creó con Google
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'dueno')),
  negocio_id INTEGER UNIQUE REFERENCES negocios(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO usuarios_new (id, google_sub, email, password_hash, rol, negocio_id, created_at)
  SELECT id, google_sub, email, NULL, rol, negocio_id, created_at FROM usuarios;

DROP TABLE usuarios;
ALTER TABLE usuarios_new RENAME TO usuarios;

CREATE UNIQUE INDEX idx_usuarios_google_sub ON usuarios (google_sub);
CREATE UNIQUE INDEX idx_usuarios_email ON usuarios (email);

PRAGMA foreign_keys = ON;
