/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { extraerItemsDeCarta, extraerTextoDeExcel, type ClienteClaude, type ArchivoCarta } from "./menu-parser.ts";

/** Cliente Claude falso: devuelve el input de tool_use que se le pase, sin red. */
function clienteFalso(inputToolUse: unknown): ClienteClaude {
  return {
    messages: {
      async create() {
        return { content: [{ type: "tool_use", name: "extraer_items_menu", input: inputToolUse }] };
      },
    },
  };
}

const ARCHIVO_DE_PRUEBA: ArchivoCarta = { tipo: "imagen", mediaType: "image/jpeg", base64: "ZmFrZQ==" };

test("extraerItemsDeCarta mapea items válidos, recortando nombre y descripción", async () => {
  const client = clienteFalso({
    items: [
      { nombre: "  Empanada de pino  ", descripcion: "  Horneada  ", precio_clp: 2000 },
      { nombre: "Bebida 350ml", descripcion: null, precio_clp: 1200 },
    ],
  });
  const items = await extraerItemsDeCarta(client, [ARCHIVO_DE_PRUEBA]);
  assert.deepEqual(items, [
    { nombre: "Empanada de pino", descripcion: "Horneada", precioClp: 2000 },
    { nombre: "Bebida 350ml", descripcion: null, precioClp: 1200 },
  ]);
});

test("extraerItemsDeCarta descarta ítems sin nombre", async () => {
  const client = clienteFalso({ items: [{ nombre: "  ", descripcion: null, precio_clp: 1000 }] });
  const items = await extraerItemsDeCarta(client, [ARCHIVO_DE_PRUEBA]);
  assert.deepEqual(items, []);
});

test("extraerItemsDeCarta descarta ítems con precio inválido (negativo, no entero, no numérico)", async () => {
  const client = clienteFalso({
    items: [
      { nombre: "Item A", descripcion: null, precio_clp: -100 },
      { nombre: "Item B", descripcion: null, precio_clp: 10.5 },
      { nombre: "Item C", descripcion: null, precio_clp: "gratis" },
    ],
  });
  const items = await extraerItemsDeCarta(client, [ARCHIVO_DE_PRUEBA]);
  assert.deepEqual(items, []);
});

test("extraerItemsDeCarta acepta precio 0", async () => {
  const client = clienteFalso({ items: [{ nombre: "Cortesía", descripcion: null, precio_clp: 0 }] });
  const items = await extraerItemsDeCarta(client, [ARCHIVO_DE_PRUEBA]);
  assert.deepEqual(items, [{ nombre: "Cortesía", descripcion: null, precioClp: 0 }]);
});

test("extraerItemsDeCarta con lista de archivos vacía no llama a Claude y devuelve []", async () => {
  let llamadas = 0;
  const client: ClienteClaude = {
    messages: {
      async create() {
        llamadas++;
        return { content: [] };
      },
    },
  };
  const items = await extraerItemsDeCarta(client, []);
  assert.deepEqual(items, []);
  assert.equal(llamadas, 0);
});

test("extraerItemsDeCarta si no hay bloque tool_use, devuelve [] sin lanzar", async () => {
  const client: ClienteClaude = {
    messages: {
      async create() {
        return { content: [{ type: "text" }] };
      },
    },
  };
  const items = await extraerItemsDeCarta(client, [ARCHIVO_DE_PRUEBA]);
  assert.deepEqual(items, []);
});

test("extraerTextoDeExcel convierte una hoja a texto tipo CSV", () => {
  const hoja = XLSX.utils.aoa_to_sheet([
    ["Nombre", "Descripción", "Precio"],
    ["Empanada de pino", "Horneada", 2000],
    ["Bebida 350ml", "", 1200],
  ]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Carta");
  const buffer = XLSX.write(libro, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

  const texto = extraerTextoDeExcel(buffer);
  assert.match(texto, /Nombre,Descripción,Precio/);
  assert.match(texto, /Empanada de pino,Horneada,2000/);
  assert.match(texto, /Bebida 350ml,,1200/);
});

test("extraerTextoDeExcel concatena varias hojas", () => {
  const hoja1 = XLSX.utils.aoa_to_sheet([["A"], ["1"]]);
  const hoja2 = XLSX.utils.aoa_to_sheet([["B"], ["2"]]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja1, "Uno");
  XLSX.utils.book_append_sheet(libro, hoja2, "Dos");
  const buffer = XLSX.write(libro, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

  const texto = extraerTextoDeExcel(buffer);
  assert.match(texto, /A/);
  assert.match(texto, /B/);
});

test("extraerItemsDeCarta acepta un archivo de tipo texto (carta leída desde Excel)", async () => {
  let contenidoRecibido: string | null = null;
  const client: ClienteClaude = {
    messages: {
      async create(params) {
        const bloqueTexto = params.messages[0].content.find(
          (b): b is { type: "text"; text: string } => b.type === "text"
        );
        contenidoRecibido = bloqueTexto?.text ?? null;
        return {
          content: [
            { type: "tool_use", name: "extraer_items_menu", input: { items: [{ nombre: "Item", descripcion: null, precio_clp: 500 }] } },
          ],
        };
      },
    },
  };
  const archivoTexto: ArchivoCarta = { tipo: "texto", contenido: "Nombre,Precio\nItem,500" };
  const items = await extraerItemsDeCarta(client, [archivoTexto]);
  assert.deepEqual(items, [{ nombre: "Item", descripcion: null, precioClp: 500 }]);
  assert.equal(contenidoRecibido, "Nombre,Precio\nItem,500");
});
