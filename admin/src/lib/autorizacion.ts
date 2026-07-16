import type { Usuario } from "./db.ts";

/** Un 'admin' administra cualquier negocio; un 'dueno' solo el suyo. Sin usuario (ruta pública), nunca. */
export function puedeAdministrarNegocio(usuario: Usuario | undefined, negocioId: number): boolean {
  if (!usuario) return false;
  return usuario.rol === "admin" || usuario.negocio_id === negocioId;
}
