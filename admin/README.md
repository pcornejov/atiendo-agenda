# atiendo-agenda-admin

Panel de administración de Atiendo Agenda: registro y login self-service con
Google para que cada dueño de negocio administre su propio negocio (horarios,
citas), y una vista de administrador (`/admin/negocios`) para el equipo de
Atiendo Agenda con todos los negocios y su plan/suscripción. Proyecto de
Cloudflare Workers separado (Astro + adapter de Cloudflare), que comparte la
misma base D1 que el bot (`../wrangler.jsonc`) — no importa código del bot,
solo apunta al mismo `database_id`.

**Estado actual**: login, autorización por rol, la integración con Flow
(selección de plan, alta de cliente y registro de tarjeta, webhook de
confirmación — ver advertencia sobre Flow más abajo, no probada contra una
cuenta sandbox real todavía), la **arquitectura de módulos del bot**, y el
**módulo de venta de comida (Nivel 2)** ya están construidos: el bot
(`../src/lib/flujo.ts`, `../src/lib/modulos/`) consulta
`negocio_suscripciones`/`plan_modulos` en cada mensaje y solo responde a los
intents de los módulos que el plan activo del negocio incluye — hoy
`agendamiento` (agendar/cancelar/consultar una cita) y `pedidos` (ver menú,
pedir, confirmar, consultar estado, cancelar). Los dueños con el módulo
`pedidos` activo administran su menú y ven sus pedidos entrantes desde este
panel (`/negocios/[id]/menu`, `/negocios/[id]/pedidos`). Ver "Qué falta" más
abajo.

**Importante**: un negocio sin ninguna suscripción `'activa'` no recibe
ninguna respuesta del bot — el botón "Activar plan a mano" en
`/negocios/[id]/editar` (solo `admin`) es la forma de darle un plan a un
negocio dado de alta directamente (sin pasar por Flow), y es un paso
obligatorio, no opcional, al crear un negocio nuevo desde `/negocios/nuevo`.

## Setup local

```bash
npm install

# Aplicar el schema a la base D1 local de este proyecto (usa las migrations
# del bot, referenciadas por ruta relativa)
npx wrangler d1 migrations apply atiendo-agenda-db --local

# (Opcional) cargar el negocio de ejemplo
npx wrangler d1 execute atiendo-agenda-db --local --file=../seed.sql

npm run dev
```

Abre `http://localhost:4321/` — muestra la landing pública (`/`, fuera del
login). Desde ahí, "Iniciar sesión" y "Crear cuenta" llevan a `/auth/login` y
`/auth/registro`.

## Login: Google o email/contraseña

El panel no usa Cloudflare Access — hay dos formas de entrar, para que
cualquier dueño de negocio se pueda registrar sin que el administrador tenga
que darlo de alta a mano en un dashboard:

- **Google** (`/auth/google` inicia el flujo, `/auth/callback` lo recibe) —
  crea la cuenta sola en el primer login.
- **Email + contraseña** (`/auth/registro` para crear cuenta, `/auth/login`
  para entrar) — hashing con PBKDF2 vía Web Crypto (`src/lib/password.ts`),
  sin dependencias nuevas.

**El rol `admin` es exclusivo del login con Google** — el registro por
contraseña siempre crea `rol = 'dueno'`, nunca lee `ADMIN_EMAIL`, porque no
hay forma de verificar que quien completa ese formulario controla el correo
que escribió (no hay envío de emails en el proyecto todavía). Confiar en la
coincidencia de email ahí sería dejar que cualquiera se autoasigne admin
escribiendo el correo del administrador — ver el comentario en
`src/pages/auth/registro.astro`.

Si un email ya tiene cuenta por el otro método (Google vs. contraseña), el
sistema bloquea con un mensaje indicando cuál usar — no fusiona cuentas
automáticamente.

### Configurar el OAuth Client de Google

Para que el login con Google funcione hace falta un OAuth Client:

1. Entra a [Google Cloud Console](https://console.cloud.google.com/) → crea
   un proyecto (o usa uno existente) → **APIs & Services** → **Credentials**
   → **Create Credentials** → **OAuth client ID** → tipo **Web application**.
2. En **Authorized redirect URIs** agrega:
   - `http://localhost:4321/auth/callback` (para desarrollo local)
   - `https://atiendo-agenda-admin.<tu-subdominio>.workers.dev/auth/callback`
     (producción, una vez desplegado)
3. Copia el **Client ID** y el **Client secret** que te da Google.
4. Client ID (no es secreto, va en `wrangler.jsonc` → `vars.GOOGLE_CLIENT_ID`):
   ```bash
   # editar wrangler.jsonc a mano, o
   npx wrangler types   # después de editarlo, para regenerar los tipos
   ```
5. Client secret (sí es secreto):
   ```bash
   # producción
   npx wrangler secret put GOOGLE_CLIENT_SECRET

   # local — crear admin/.dev.vars (gitignored) con:
   echo "GOOGLE_CLIENT_SECRET=tu-secreto-aca" > .dev.vars
   ```
6. `ADMIN_EMAIL` (en `wrangler.jsonc` → `vars`) decide qué cuenta de Google
   recibe el rol `admin` (ve y administra todos los negocios) la primera vez
   que inicia sesión — el resto de las cuentas nuevas quedan como `dueno` de
   su propio negocio.

La verificación del `id_token` de Google se hace contra el endpoint
`tokeninfo` de Google (`src/lib/auth.ts`) en vez de validar la firma JWT
nosotros mismos — más simple y sin depender de una librería de JWT/JWKS solo
para este uso.

## Cobro con Flow

**Advertencia**: esto se escribió a partir de la documentación pública
resumida de `developers.flow.cl`, sin acceso a una cuenta sandbox real para
probarlo. La firma HMAC-SHA256 (`src/lib/flow.ts` → `firmarParametros`) está
confirmada por la documentación y tiene tests. Los nombres exactos de los
campos de cada endpoint (`crearPlanFlow`, `crearClienteFlow`,
`urlRegistroTarjeta`, `crearSuscripcionFlow`, `obtenerEstadoPorToken` — todos
en `src/lib/flow.ts`) están marcados con comentarios `VERIFICAR` y hay que
confirmarlos/ajustarlos la primera vez que se prueba contra el sandbox de
verdad. El webhook (`src/pages/webhook/flow.ts`) sigue el patrón documentado
de "no confiar en el POST entrante, consultar el estado real con el token" —
es la única fuente de verdad de cuándo una suscripción pasa a `'activa'`.

Para activarlo:

1. Crear una cuenta en [Flow](https://www.flow.cl/) (sandbox primero:
   `https://sandbox.flow.cl`) y conseguir `apiKey`/`secretKey`.
2. `apiKey` y `baseUrl` van en `wrangler.jsonc` → `vars` (`FLOW_API_KEY`,
   `FLOW_BASE_URL` — dejar `https://sandbox.flow.cl/api` mientras se prueba).
3. `secretKey` es secreto:
   ```bash
   npx wrangler secret put FLOW_SECRET_KEY          # producción
   echo "FLOW_SECRET_KEY=tu-secreto-aca" >> .dev.vars # local
   ```
4. Configurar en el dashboard de Flow la `urlConfirmation` apuntando a
   `https://atiendo-agenda-admin.<tu-subdominio>.workers.dev/webhook/flow`.
5. Dar de alta los planes en Flow una sola vez y guardar el `flow_plan_id`
   resultante en la tabla `planes` (ver `scripts/crear-planes-flow.ts`):
   ```bash
   FLOW_API_KEY=... FLOW_SECRET_KEY=... FLOW_BASE_URL=https://sandbox.flow.cl/api \
     node --experimental-strip-types scripts/crear-planes-flow.ts
   ```

El flujo de alta de un negocio nuevo (`src/pages/onboarding/plan.astro`)
elige plan → crea el cliente en Flow → redirige a la página de Flow para
registrar la tarjeta, con `urlReturn` de vuelta a `/negocios/[id]/editar`.
**No** construimos el paso de asociar el cliente ya con tarjeta al plan
(`crearSuscripcionFlow`) en esa redirección de vuelta — no hay forma de
confirmar sin una cuenta real qué manda Flow en esa redirección (si manda
algún parámetro de confirmación, o nada). Queda pendiente para cuando haya
acceso a un sandbox real para probarlo.

## Deploy

```bash
npm run deploy
```

Esto publica un Worker nuevo (`atiendo-agenda-admin`), separado del bot, en
`https://atiendo-agenda-admin.<tu-subdominio>.workers.dev`.

**Recomendado además:** seguir protegiendo `/interno/*` del Worker del bot
(`atiendo-agenda`, no este panel) con Cloudflare Access o similar — hoy esas
rutas de debug están sin autenticación en producción; ese Worker no tiene
login propio.

## Tests

```bash
npm run test        # funciones puras (validaciones, armado de URL de Google)
npm run typecheck   # astro check
```

## Estructura

- `src/lib/db.ts` — todas las consultas D1, cada función recibe `negocioId`
  explícito.
- `src/lib/auth.ts` — login con Google (armado de URL de autorización,
  intercambio de código + verificación del id_token).
- `src/lib/autorizacion.ts` — `puedeAdministrarNegocio(usuario, negocioId)`:
  un `admin` administra cualquier negocio, un `dueno` solo el suyo.
- `src/middleware.ts` — único gate de autenticación: exige sesión de Google
  válida en toda ruta salvo `/auth/*`, cuelga `Astro.locals.usuario`, y manda
  a `/onboarding` a un `dueno` que todavía no tiene negocio creado.
- `src/pages/auth/` — `login.ts` (redirige a Google), `callback.ts`
  (intercambia el código, crea o encuentra el usuario, arma la sesión),
  `logout.ts`.
- `src/pages/onboarding.astro` — alta self-service del negocio de un `dueno`
  nuevo. El teléfono/Phone Number ID de WhatsApp reales NO se piden acá (ver
  limitación abajo) — quedan con un valor "pendiente" hasta que el equipo de
  Atiendo Agenda los conecta desde `/negocios/[id]/editar` (solo `admin`
  puede editar ese campo — un `dueno` lo ve de solo lectura).
- `src/pages/onboarding/plan.astro` — elegir plan y arrancar el registro de
  tarjeta en Flow, después de crear el negocio.
- `src/lib/flow.ts` — firma HMAC-SHA256 y llamadas a la API de Flow (ver
  advertencia en la sección "Cobro con Flow" más abajo).
- `src/pages/webhook/flow.ts` — recibe el token de confirmación de Flow y
  actualiza `negocio_suscripciones`.
- `src/pages/admin/negocios/` — listado de **todos** los negocios con su plan/
  estado de suscripción, uso exclusivo de `rol = 'admin'`. Reemplaza a la
  vieja `/negocios` (que listaba todo sin distinguir roles).
- `src/pages/negocios/[id]/` — editar, horarios, citas, menú, pedidos: scoped
  por `negocioId`, con `puedeAdministrarNegocio` chequeado en cada página (no
  solo ocultando el link en la navegación — la URL es adivinable).
  `editar.astro` incluye, solo para `admin`, el botón para activar un plan a
  mano (sin Flow). Los links a `menu.astro`/`pedidos.astro` en la navegación
  del dueño solo aparecen si su negocio tiene el módulo `pedidos` activo
  (`listarCodigosModulosActivos` en `db.ts`) — igual chequeo que hace el bot,
  aunque nada impide entrar a esas páginas directamente por URL si el negocio
  no tiene el módulo (no rompe nada, solo es una pantalla que el bot no usa).

## Limitación real: el número de WhatsApp sigue siendo manual

Aunque el registro, login y configuración del negocio ya son self-service,
**conectar el número de WhatsApp de cada negocio nuevo todavía requiere un
paso manual** del equipo de Atiendo Agenda en Meta Business Manager (alta de
la app, verificación del WABA, etc. — ver `../README.md`). La integración de
["WhatsApp Embedded Signup"](https://developers.facebook.com/docs/whatsapp/embedded-signup)
de Meta permitiría que el propio dueño conecte su cuenta desde esta web, pero
no está construida todavía.

## Qué falta (fuera del alcance de esta etapa)

- **Verificar Flow contra una cuenta sandbox real** (ver advertencia arriba)
  y construir el paso de `crearSuscripcionFlow` en el retorno del registro de
  tarjeta.
- **Notificación de pedidos nuevos**: hoy el dueño se entera de un pedido
  entrando a `/negocios/[id]/pedidos` — no hay notificación push/WhatsApp
  cuando entra uno.
- **Nada todavía desplegado a producción** — todo este pivote (schema, auth,
  Flow, módulos, pedidos) está commiteado pero no desplegado. Antes de
  desplegar el bot hace falta activar un plan para el negocio piloto que ya
  está en producción (ver `../README.md`), o deja de responder.
- **WhatsApp Embedded Signup**, y **Nivel 3** (sin definir).
