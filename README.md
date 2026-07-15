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

## Cómo funciona el flujo conversacional

`POST /webhook` ya es el flujo completo (`src/lib/flujo.ts`):

1. Parsea el payload de WhatsApp (`src/lib/webhook.ts`) — ignora todo lo que no sea
   un mensaje de texto (confirmaciones de entrega, otros tipos de mensaje, etc.).
2. Rutea al negocio dueño de ese `phone_number_id`.
3. Si hay una conversación pendiente (`conversaciones_estado`, ej. "le ofrecí
   horarios, espero que elija uno"), interpreta la respuesta con
   `interpretarSeleccion`; si no, interpreta el mensaje como una solicitud nueva con
   `interpretarSolicitud` (ambas en `src/lib/nlu.ts`, Claude Haiku).
4. Según la intención: busca disponibilidad y ofrece horarios (guardando el estado
   pendiente), crea la cita si el cliente eligió una opción (con un re-chequeo de
   solapamiento justo antes de insertar, `src/lib/reserva.ts`), o cancela la próxima
   cita activa del cliente.
5. Responde por WhatsApp (`src/lib/whatsapp.ts`) con el texto correspondiente
   (`src/lib/mensajes.ts`).

Lo que falta (próxima sesión): el cron de recordatorios todavía es un stub — falta
la query real + el envío del mensaje de plantilla (fuera de la ventana de 24h).

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
WHATSAPP_VERIFY_TOKEN=...
ANTHROPIC_API_KEY=...
```

(El `phone_number_id` no es un secret global: vive en `negocios.whatsapp_phone_number_id`,
uno por negocio piloto — ver `seed.sql`.)

**Producción**:

```bash
npx wrangler secret put WHATSAPP_TOKEN
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

## Probar el flujo completo con un mensaje simulado

Con `ANTHROPIC_API_KEY` real en `.dev.vars`, se puede simular un mensaje entrante de
WhatsApp sin necesidad de un número real ni de `WHATSAPP_TOKEN` válido (fallará recién
al intentar *responder*, lo cual ya alcanza para ver qué entendió el bot en los logs
de `wrangler dev`):

```bash
curl -X POST http://localhost:8787/webhook -H "content-type: application/json" -d '{
  "entry": [{"changes": [{"value": {
    "metadata": {"phone_number_id": "123456789012345"},
    "contacts": [{"profile": {"name": "Cliente Prueba"}, "wa_id": "56911112222"}],
    "messages": [{"from": "56911112222", "id": "wamid.1", "type": "text", "text": {"body": "tienen hora el jueves en la tarde?"}}]
  }}]}]
}'
```

Para ver la cita creada (o el estado de conversación pendiente con los horarios
ofrecidos) mientras se prueba:

```bash
npx wrangler d1 execute atiendo-agenda-db --local --command="SELECT * FROM citas; SELECT * FROM conversaciones_estado;"
```

Con un `WHATSAPP_TOKEN` real (y un número de prueba de Meta agregado como receptor)
ya se puede probar la conversación de punta a punta, incluyendo la respuesta que
llega al teléfono.

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
