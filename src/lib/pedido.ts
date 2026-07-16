// Consultas D1 del módulo de pedidos (menú y pedidos de comida). Mismo rol
// que reserva.ts para citas.

export interface MenuItem {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio_clp: number;
}

export async function listarMenuDisponible(db: D1Database, negocioId: number): Promise<MenuItem[]> {
  const resultado = await db
    .prepare(
      "SELECT id, nombre, descripcion, precio_clp FROM menu_items WHERE negocio_id = ? AND disponible = 1 ORDER BY orden, nombre"
    )
    .bind(negocioId)
    .all<MenuItem>();
  return resultado.results;
}

export interface ItemPedidoParaCrear {
  menuItemId: number;
  cantidad: number;
  precioUnitarioClp: number;
}

/**
 * Crea el pedido y sus ítems. No es atómico entre el INSERT de `pedidos` y el
 * batch de `pedido_items` (D1 no permite encadenar el id autogenerado dentro
 * de un mismo batch) — igual que crearCita/crearHorario en reserva.ts, que
 * tampoco envuelven sus escrituras en una transacción explícita.
 */
export async function crearPedido(
  db: D1Database,
  params: {
    negocioId: number;
    clienteTelefono: string;
    clienteNombre: string | null;
    items: ItemPedidoParaCrear[];
    totalClp: number;
    tipoEntrega: "retiro" | "despacho";
  }
): Promise<{ id: number }> {
  const resultado = await db
    .prepare(
      `INSERT INTO pedidos (negocio_id, cliente_telefono, cliente_nombre, estado, total_clp, tipo_entrega)
       VALUES (?, ?, ?, 'pendiente', ?, ?)`
    )
    .bind(params.negocioId, params.clienteTelefono, params.clienteNombre, params.totalClp, params.tipoEntrega)
    .run();
  const pedidoId = resultado.meta.last_row_id;

  if (params.items.length > 0) {
    await db.batch(
      params.items.map((item) =>
        db
          .prepare(
            "INSERT INTO pedido_items (pedido_id, menu_item_id, cantidad, precio_unitario_clp) VALUES (?, ?, ?, ?)"
          )
          .bind(pedidoId, item.menuItemId, item.cantidad, item.precioUnitarioClp)
      )
    );
  }

  return { id: pedidoId };
}

export interface PedidoActivo {
  id: number;
  estado: string;
  total_clp: number;
  tipo_entrega: "retiro" | "despacho" | null;
  creado_en: string;
}

/** Busca el pedido no terminal (pendiente/confirmado/preparando/listo) más reciente de un cliente. */
export async function buscarPedidoActivo(
  db: D1Database,
  negocioId: number,
  clienteTelefono: string
): Promise<PedidoActivo | null> {
  const pedido = await db
    .prepare(
      `SELECT id, estado, total_clp, tipo_entrega, created_at AS creado_en FROM pedidos
       WHERE negocio_id = ? AND cliente_telefono = ? AND estado IN ('pendiente', 'confirmado', 'preparando', 'listo')
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(negocioId, clienteTelefono)
    .first<PedidoActivo>();
  return pedido ?? null;
}

export type ResultadoCancelarPedido = { ok: true } | { ok: false };

export async function cancelarPedidoActivo(
  db: D1Database,
  negocioId: number,
  clienteTelefono: string
): Promise<ResultadoCancelarPedido> {
  const pedido = await buscarPedidoActivo(db, negocioId, clienteTelefono);
  if (!pedido) return { ok: false };
  await db.prepare("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?").bind(pedido.id).run();
  return { ok: true };
}
