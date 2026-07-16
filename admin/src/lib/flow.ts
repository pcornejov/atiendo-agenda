// Integración con Flow (flow.cl) para el cobro recurrente de la suscripción.
//
// ADVERTENCIA: esto se escribió a partir de la documentación pública
// resumida de developers.flow.cl, sin acceso a una cuenta sandbox real para
// probarlo contra la API de verdad. La firma HMAC-SHA256 sobre parámetros
// ordenados alfabéticamente está confirmada por la documentación. Los
// nombres exactos de los campos de cada endpoint (marcados con "VERIFICAR"
// abajo) hay que confirmarlos/ajustarlos la primera vez que se prueba contra
// el sandbox de Flow (https://sandbox.flow.cl/api) con credenciales reales.

export interface CredencialesFlow {
  apiKey: string;
  secretKey: string;
  baseUrl: string; // 'https://sandbox.flow.cl/api' en pruebas, 'https://www.flow.cl/api' en producción
}

async function hmacSha256Hex(mensaje: string, secreto: string): Promise<string> {
  const encoder = new TextEncoder();
  const clave = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const firma = await crypto.subtle.sign("HMAC", clave, encoder.encode(mensaje));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Firma de Flow: todos los parámetros (menos la firma misma) ordenados
 * alfabéticamente por clave, concatenados como clave+valor sin separador, y
 * firmados con HMAC-SHA256 usando el secretKey del comercio.
 */
export async function firmarParametros(params: Record<string, string>, secretKey: string): Promise<string> {
  const claves = Object.keys(params).sort();
  const concatenado = claves.map((clave) => `${clave}${params[clave]}`).join("");
  return hmacSha256Hex(concatenado, secretKey);
}

async function llamarFlow<T>(
  credenciales: CredencialesFlow,
  endpoint: string,
  metodo: "GET" | "POST",
  params: Record<string, string>
): Promise<T> {
  const todos = { ...params, apiKey: credenciales.apiKey };
  const firma = await firmarParametros(todos, credenciales.secretKey);
  const cuerpo = new URLSearchParams({ ...todos, s: firma });
  const url = `${credenciales.baseUrl}${endpoint}`;

  const respuesta =
    metodo === "GET"
      ? await fetch(`${url}?${cuerpo.toString()}`)
      : await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: cuerpo,
        });

  if (!respuesta.ok) {
    throw new Error(`Flow respondió ${respuesta.status} en ${endpoint}: ${await respuesta.text()}`);
  }
  return respuesta.json() as Promise<T>;
}

// VERIFICAR: nombres de campo tomados de la documentación resumida de
// /plans/create — confirmar contra la referencia real antes de usar en producción.
export async function crearPlanFlow(
  credenciales: CredencialesFlow,
  params: { planId: string; name: string; amount: number; currency: "CLP"; interval: 1 /* mensual */; interval_count: number }
): Promise<{ planId: string }> {
  return llamarFlow(credenciales, "/plans/create", "POST", {
    planId: params.planId,
    name: params.name,
    amount: String(params.amount),
    currency: params.currency,
    interval: String(params.interval),
    interval_count: String(params.interval_count),
  });
}

// VERIFICAR: /customer/create — se le pasa un externalId propio (acá, el id
// del negocio en nuestra base) para poder recuperarlo después.
export async function crearClienteFlow(
  credenciales: CredencialesFlow,
  params: { email: string; name: string; externalId: string }
): Promise<{ customerId: string }> {
  return llamarFlow(credenciales, "/customer/create", "POST", {
    email: params.email,
    name: params.name,
    externalId: params.externalId,
  });
}

/**
 * VERIFICAR: /customer/register según la documentación es un flujo de
 * redirección (el cliente ingresa su tarjeta en una página hospedada por
 * Flow) — esta función arma esa URL de redirección, no hace un POST directo.
 */
export async function urlRegistroTarjeta(
  credenciales: CredencialesFlow,
  params: { customerId: string; urlReturn: string }
): Promise<string> {
  const todos = { customerId: params.customerId, url_return: params.urlReturn, apiKey: credenciales.apiKey };
  const firma = await firmarParametros(todos, credenciales.secretKey);
  const query = new URLSearchParams({ ...todos, s: firma });
  return `${credenciales.baseUrl}/customer/register?${query.toString()}`;
}

// VERIFICAR: /subscription/create — se asume que requiere el customerId ya
// con tarjeta activa (post /customer/register) y el planId dado de alta con
// /plans/create.
export async function crearSuscripcionFlow(
  credenciales: CredencialesFlow,
  params: { customerId: string; planId: string }
): Promise<{ subscriptionId: string }> {
  return llamarFlow(credenciales, "/subscription/create", "POST", {
    customerId: params.customerId,
    planId: params.planId,
  });
}

/**
 * Flow no manda los datos del pago en el POST del webhook — manda un token,
 * y el comercio tiene que consultar el estado real con ese token. Esta
 * función hace esa consulta. VERIFICAR el endpoint exacto: la documentación
 * confirma el patrón general (createPayment → urlConfirmation → getStatus
 * con el token) para pagos; para eventos de suscripción puede ser un
 * endpoint de estado de suscripción específico en vez de /payment/getStatus.
 */
export async function obtenerEstadoPorToken(
  credenciales: CredencialesFlow,
  token: string
): Promise<{ status: string; subscriptionId?: string; customerId?: string }> {
  return llamarFlow(credenciales, "/payment/getStatus", "GET", { token });
}
