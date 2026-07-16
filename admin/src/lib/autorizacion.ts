import type { Usuario } from "./db.ts";

/** Un 'admin' administra cualquier negocio; un 'dueno' solo el suyo. */
export function puedeAdministrarNegocio(usuario: Usuario, negocioId: number): boolean {
  return usuario.rol === "admin" || usuario.negocio_id === negocioId;
}
