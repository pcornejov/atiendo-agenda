/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { armarListaMenu, procesarListaEntrante } from "./listaMenu.ts";
import type { MenuItem } from "./pedido.ts";

function item(overrides: Partial<MenuItem> = {}): MenuItem {
  return { id: 1, nombre: "Empanada de pino", descripcion: null, precio_clp: 1800, categoria: null, ...overrides };
}

test("armarListaMenu con una sola categoría (o sin categorizar) arma una lista plana de ítems", () => {
  const items = [item({ id: 1, nombre: "Empanada de pino" }), item({ id: 2, nombre: "Bebida 350cc", precio_clp: 1200 })];
  const lista = armarListaMenu(items);
  assert.equal(lista?.secciones.length, 1);
  assert.equal(lista?.secciones[0].titulo, "Menú");
  assert.deepEqual(
    lista?.secciones[0].filas.map((f) => f.id),
    ["item:1", "item:2"]
  );
  assert.equal(lista?.secciones[0].filas[0].descripcion, "$1.800");
});

test("armarListaMenu con varias categorías arma el selector de categorías, no los ítems directo", () => {
  const items = [
    item({ id: 1, categoria: "Hamburguesas" }),
    item({ id: 2, categoria: "Hamburguesas" }),
    item({ id: 3, categoria: "Bebidas" }),
  ];
  const lista = armarListaMenu(items);
  assert.equal(lista?.secciones.length, 1);
  assert.equal(lista?.secciones[0].titulo, "Categorías");
  assert.deepEqual(
    lista?.secciones[0].filas.map((f) => f.id),
    ["cat:Hamburguesas", "cat:Bebidas"]
  );
  assert.equal(lista?.secciones[0].filas[0].descripcion, "2 opciones");
  assert.equal(lista?.secciones[0].filas[1].descripcion, "1 opción");
});

test("armarListaMenu devuelve null si hay más de 10 ítems sin categorizar (no entra en una sola lista)", () => {
  const items = Array.from({ length: 11 }, (_, i) => item({ id: i + 1, nombre: `Item ${i + 1}` }));
  assert.equal(armarListaMenu(items), null);
});

test("armarListaMenu devuelve null si hay más de 10 categorías", () => {
  const items = Array.from({ length: 11 }, (_, i) => item({ id: i + 1, categoria: `Cat ${i + 1}` }));
  assert.equal(armarListaMenu(items), null);
});

test("armarListaMenu con lista vacía devuelve null", () => {
  assert.equal(armarListaMenu([]), null);
});

test("armarListaMenu trunca título (24) y descripción (72) a los límites de WhatsApp", () => {
  const items = [
    item({
      id: 1,
      nombre: "Un nombre de producto absurdamente largo que supera los 24 caracteres",
      descripcion: "Una descripción también absurdamente larga que definitivamente supera los setenta y dos caracteres permitidos",
    }),
  ];
  const lista = armarListaMenu(items);
  const fila = lista!.secciones[0].filas[0];
  assert.ok(fila.titulo.length <= 24);
  assert.ok((fila.descripcion?.length ?? 0) <= 72);
});

/** D1Database falso: el SELECT siempre devuelve `items`. */
function crearDbFalsa(items: MenuItem[]) {
  return {
    prepare() {
      return {
        bind() {
          return { async all() { return { results: items }; } };
        },
      };
    },
  } as unknown as D1Database;
}

test("procesarListaEntrante con id 'cat:X' manda la lista de ítems de esa categoría", async () => {
  const items = [item({ id: 1, categoria: "Hamburguesas" }), item({ id: 2, categoria: "Bebidas" })];
  const db = crearDbFalsa(items);
  const listasEnviadas: unknown[] = [];

  const resultado = await procesarListaEntrante({
    db,
    negocioId: 1,
    idFila: "cat:Hamburguesas",
    enviarLista: async (params) => { listasEnviadas.push(params); },
  });

  assert.deepEqual(resultado, { manejado: true });
  assert.equal(listasEnviadas.length, 1);
  assert.deepEqual((listasEnviadas[0] as any).secciones[0].filas.map((f: any) => f.id), ["item:1"]);
});

test("procesarListaEntrante con id 'cat:X' de una categoría sin ítems no manda nada", async () => {
  const db = crearDbFalsa([item({ id: 1, categoria: "Hamburguesas" })]);
  let llamadas = 0;
  const resultado = await procesarListaEntrante({
    db,
    negocioId: 1,
    idFila: "cat:Bebidas",
    enviarLista: async () => { llamadas++; },
  });
  assert.deepEqual(resultado, { manejado: true });
  assert.equal(llamadas, 0);
});

test("procesarListaEntrante con id 'item:N' devuelve el nombre del ítem sin mandar nada él mismo", async () => {
  const db = crearDbFalsa([item({ id: 42, nombre: "Hamburguesa clásica" })]);
  let llamadas = 0;
  const resultado = await procesarListaEntrante({
    db,
    negocioId: 1,
    idFila: "item:42",
    enviarLista: async () => { llamadas++; },
  });
  assert.deepEqual(resultado, { manejado: false, nombreItemSeleccionado: "Hamburguesa clásica" });
  assert.equal(llamadas, 0);
});

test("procesarListaEntrante con id 'item:N' de un ítem que ya no existe/disponible se ignora", async () => {
  const db = crearDbFalsa([item({ id: 1 })]);
  const resultado = await procesarListaEntrante({
    db,
    negocioId: 1,
    idFila: "item:999",
    enviarLista: async () => {},
  });
  assert.deepEqual(resultado, { manejado: true });
});

test("procesarListaEntrante con un id no reconocido no hace nada", async () => {
  const db = crearDbFalsa([item({ id: 1 })]);
  const resultado = await procesarListaEntrante({
    db,
    negocioId: 1,
    idFila: "algo-random",
    enviarLista: async () => {},
  });
  assert.deepEqual(resultado, { manejado: true });
});
