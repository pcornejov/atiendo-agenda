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

El cron de recordatorios (`src/lib/recordatorios.ts`, corre cada 5 min) ya hace lo
mismo del lado de las citas: busca las que empiezan entre 55-65 min desde ahora sin
`recordatorio_enviado`, y les manda una plantilla de WhatsApp. **Falta que crees y
apruebes esa plantilla en Meta** — ver la sección "Plantilla de WhatsApp para el
recordatorio" más abajo, es lo único que queda pendiente de tu lado para tener el
MVP completo.

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

## Plantilla de WhatsApp para el recordatorio (pendiente de tu lado)

WhatsApp solo deja escribirle primero al cliente (sin que él haya escrito en las
últimas 24h) usando una **plantilla de mensaje pre-aprobada por Meta** — es el caso
del recordatorio, que se manda 1h antes sin que el cliente haya escrito nada. Un
mensaje de texto normal (como los de la conversación de agendamiento) no sirve para
esto y Meta lo rechaza.

Pasos para habilitarlo:

1. En [Meta Business Manager](https://business.facebook.com) → WhatsApp Manager →
   Message Templates, creá una plantilla nueva, categoría **Utility**, con un body
   como:

   > Te recordamos tu cita de {{1}} hoy a las {{2}}. ¡Te esperamos!

   (`{{1}}` = nombre del servicio, `{{2}}` = hora — en ese orden, es lo que manda
   `procesarRecordatorios` en `src/lib/recordatorios.ts`.)
2. Metá la envía a revisión; la aprobación suele tardar minutos a un par de horas.
3. Una vez aprobada, anotá el **nombre exacto** y el **código de idioma** con que
   quedó (ej. `recordatorio_cita` / `es`) y actualizalos en `wrangler.jsonc` →
   `vars.WHATSAPP_TEMPLATE_RECORDATORIO_NOMBRE` / `_IDIOMA` (y en `.dev.vars` si
   querés probarlo en local con esos mismos valores).

Sin esto, el cron sigue corriendo cada 5 min sin problema (y reintenta
automáticamente lo que falle), pero cada intento de envío va a fallar con un error
de Meta hasta que la plantilla exista y esté aprobada.

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
