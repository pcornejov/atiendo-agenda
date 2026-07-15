# atiendo-agenda

Bot de WhatsApp para agendar citas en negocios de **un solo profesional y un solo
servicio** (peluquería unipersonal, masajista, kinesiólogo, entrenador personal,
manicurista, etc.).

**Fase 1 (MVP):** un cliente escribe por WhatsApp en lenguaje natural (ej. "tienen
hora el jueves en la tarde?"), el bot interpreta la solicitud, ofrece horarios
disponibles, agenda, confirma, y manda un recordatorio 1h antes de la cita. El
cliente puede cancelar escribiendo "cancelar". No incluye multi-servicio,
multi-profesional, pagos ni panel de administración — eso es Fase 2/3.

Estrategia: 3-5 pilotos gratis, cargados **a mano** en la base de datos por el
dueño del negocio (ver [`seed.sql`](./seed.sql)) — sin panel self-service todavía.

## Qué NO está construido todavía

Ya existen:
- **Motor de disponibilidad** (`src/lib/disponibilidad.ts` + `src/lib/tz.ts`): cruza
  `horarios_disponibles` con `citas` activas y devuelve los próximos slots libres de
  un negocio, con filtro opcional por fecha/franja horaria, manejando la zona horaria
  de cada negocio con el `Intl` nativo.
- **Interpretación de lenguaje natural** (`src/lib/nlu.ts`): usa Claude Haiku (tool
  use forzado, respuesta estructurada) para extraer intención + fecha/franja
  preferida de un mensaje nuevo del cliente, y para interpretar cuál horario ofrecido
  eligió cuando ya hay opciones sobre la mesa.

El Worker todavía es un stub en lo conversacional — no arma ni envía respuestas de
WhatsApp. Lo que falta (próximas sesiones):

- Flujo de agendamiento y confirmación end-to-end (state machine sobre
  `conversaciones_estado`, uniendo NLU + disponibilidad + creación de la cita)
- Cancelación de citas
- Parseo del payload real del webhook de WhatsApp y envío de respuestas
- Envío real de recordatorios (mensaje de plantilla) desde el cron

## Prerequisitos

- Node 20+
- Cuenta de Cloudflare
- `wrangler` (se usa vía `npx`, no requiere instalación global)

## Setup local

```bash
npm install

# Crear la base D1 (solo la primera vez)
npx wrangler d1 create atiendo-agenda-db
# → copiar el database_id que imprime y pegarlo en wrangler.jsonc

# Aplicar el schema localmente
npm run db:migrations:apply:local

# (Opcional) cargar el negocio de ejemplo de seed.sql
npm run db:seed:local

# Crear .dev.vars con los secrets locales (ver sección siguiente)

npm run dev
```

## Secrets

**Local** — crear un archivo `.dev.vars` (gitignored) en la raíz:

```
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...
ANTHROPIC_API_KEY=...
```

**Producción**:

```bash
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
npx wrangler secret put WHATSAPP_VERIFY_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY
```

## Deploy

```bash
npm run db:migrations:apply:remote
npm run deploy
```

Luego registrar la URL del Worker desplegado + `/webhook` como callback URL en el
dashboard de Meta (WhatsApp > Configuration), usando el mismo `WHATSAPP_VERIFY_TOKEN`.

## Dar de alta un nuevo piloto

Sin panel de administración en Fase 1: copiar y editar [`seed.sql`](./seed.sql) con
los datos del negocio (nombre, teléfono, `whatsapp_phone_number_id`, servicio,
duración, horarios) y correrlo con:

```bash
npx wrangler d1 execute atiendo-agenda-db --remote --file=./seed.sql
```

## Tests

Las funciones puras de `src/lib/` (conversión de zona horaria, cálculo de slots)
tienen tests con `node:test` (nativo de Node, sin dependencias extra):

```bash
npm run test
```

## Verificar disponibilidad de un piloto

Mientras no hay panel de administración, `GET /interno/disponibilidad` sirve para
chequear a mano los próximos horarios libres de un negocio recién cargado:

```bash
curl "http://localhost:8787/interno/disponibilidad?negocio_id=1&limite=5"
```

## Probar la interpretación de mensajes (Claude Haiku)

`POST /interno/interpretar` simula el mensaje de un cliente y muestra qué entendió
el bot (intención + fecha/franja preferida) y qué horarios le ofrecería, sin pasar
por WhatsApp. Requiere `ANTHROPIC_API_KEY` real en `.dev.vars`:

```bash
curl -X POST http://localhost:8787/interno/interpretar \
  -H "content-type: application/json" \
  -d '{"negocio_id": 1, "mensaje": "tienen hora el jueves en la tarde?"}'
```

## Schema

Ver [`migrations/0001_init.sql`](./migrations/0001_init.sql). Tablas:

- **negocios** — un registro por negocio piloto
- **horarios_disponibles** — ventanas semanales recurrentes de disponibilidad
- **clientes** — cache de clientes conocidos por teléfono
- **citas** — citas agendadas
- **conversaciones_estado** — estado de conversación multi-turno (ej. "le ofrecí
  horarios, espero que elija uno"), una fila por `(negocio_id, cliente_telefono)`

El cron de recordatorios corre cada 5 minutos (`wrangler.jsonc`) y busca citas que
empiezan entre 55-65 minutos desde ahora sin `recordatorio_enviado`.
