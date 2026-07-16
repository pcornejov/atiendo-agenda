// Hashing de contraseñas para el login clásico (email + contraseña) usando
// PBKDF2 vía Web Crypto (crypto.subtle) — mismo mecanismo (SubtleCrypto) que
// ya usa firmarParametros en flow.ts para HMAC, sin agregar una dependencia
// npm nueva.

const ITERACIONES_PBKDF2 = 210_000; // recomendación OWASP vigente para PBKDF2-SHA256
const LARGO_SAL_BYTES = 16;
const LARGO_DERIVADO_BITS = 256;

function bytesAHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexABytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function derivarPbkdf2(password: string, sal: Uint8Array, iteraciones: number): Promise<string> {
  const encoder = new TextEncoder();
  const clave = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derivado = await crypto.subtle.deriveBits(
    // El cast es por una discrepancia de tipos de TS entre Uint8Array<ArrayBufferLike>
    // y BufferSource (que espera Uint8Array<ArrayBuffer>) — en runtime siempre es un
    // ArrayBuffer real, nunca un SharedArrayBuffer.
    { name: "PBKDF2", hash: "SHA-256", salt: sal as BufferSource, iterations: iteraciones },
    clave,
    LARGO_DERIVADO_BITS
  );
  return bytesAHex(derivado);
}

/**
 * Hashea una contraseña con PBKDF2-SHA256 y una sal aleatoria. El resultado
 * se guarda como string autodescriptivo "pbkdf2$<iteraciones>$<sal-hex>$<hash-hex>"
 * para poder subir ITERACIONES_PBKDF2 a futuro sin invalidar hashes viejos.
 */
export async function hashPassword(password: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(LARGO_SAL_BYTES));
  const hash = await derivarPbkdf2(password, sal, ITERACIONES_PBKDF2);
  return `pbkdf2$${ITERACIONES_PBKDF2}$${bytesAHex(sal)}$${hash}`;
}

function compararEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

/** Verifica una contraseña contra un hash almacenado por hashPassword(). No lanza con datos corruptos, devuelve false. */
export async function verificarPassword(password: string, hashAlmacenado: string): Promise<boolean> {
  const partes = hashAlmacenado.split("$");
  if (partes.length !== 4 || partes[0] !== "pbkdf2") return false;

  const iteraciones = Number(partes[1]);
  if (!Number.isInteger(iteraciones) || iteraciones <= 0) return false;

  try {
    const sal = hexABytes(partes[2]);
    const hashCalculado = await derivarPbkdf2(password, sal, iteraciones);
    return compararEnTiempoConstante(hashCalculado, partes[3]);
  } catch {
    return false;
  }
}
