# atiendo-agenda-admin

Panel de administración para cargar y editar negocios piloto, sin tener que
correr SQL a mano. Proyecto de Cloudflare Workers separado (Astro + adapter de
Cloudflare), que comparte la misma base D1 que el bot (`../wrangler.jsonc`) —
no importa código del bot, solo apunta al mismo `database_id`.

**Fase 1**: sin login propio en el código — se protege con **Cloudflare
Access** a nivel de borde (ver más abajo), restringido a tu email. No hay
registro de negocios por su cuenta todavía; eso es Fase 2 (autogestionado).

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

Abre `http://localhost:4321/negocios`.

## Deploy

```bash
npm run deploy
```

Esto publica un Worker nuevo (`atiendo-agenda-admin`), separado del bot, en
`https://atiendo-agenda-admin.<tu-subdominio>.workers.dev`.

## Proteger el panel con Cloudflare Access

El código no tiene autenticación propia — la protección se configura en el
dashboard de Cloudflare, fuera de este repo:

1. Entra a [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) (gratis
   hasta 50 usuarios).
2. **Access** → **Applications** → **Add an application** → **Self-hosted**.
3. Dominio: el subdominio `.workers.dev` donde quedó publicado este Worker.
4. Política: **Allow**, regla **Emails** → tu email únicamente.
5. Guardar.

Con esto, cualquiera que entre a la URL del panel tiene que loguearse con ese
email antes de llegar al código — sin tocar una línea de este repo.

**Recomendado además:** agregar `/interno/*` del Worker del bot
(`atiendo-agenda`, no este panel) a la misma aplicación de Access — hoy esas
rutas de debug están sin autenticación en producción.

## Tests

```bash
npm run test       # funciones puras (validaciones)
npm run typecheck   # astro check
```

## Estructura

- `src/lib/db.ts` — todas las consultas D1, cada función recibe `negocioId`
  explícito (para que agregar autorización por negocio en Fase 2 sea un
  chequeo, no un rediseño).
- `src/lib/validacion.ts` — validación de formularios, pura y testeada.
- `src/pages/negocios/` — listado, alta, edición, horarios y citas por
  negocio.

## Qué falta para Fase 2 (autogestionado, no construido acá)

- Login real por negocio (probablemente magic-link por email, dado el
  perfil no técnico de los dueños de negocio).
- Columna `negocios.email` (o tabla separada) para mapear una identidad
  autenticada a su `negocio_id`.
- La pantalla `/negocios` (que hoy lista *todos* los negocios) es
  explícitamente de uso exclusivo del administrador — en Fase 2 no debería
  existir para un dueño de negocio individual, o debería mostrar solo el suyo.
