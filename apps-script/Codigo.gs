/**
 * ERP Mundo 3D · conexión entre la página web y la hoja de Google "ERP Mundo 3D - Datos".
 *
 * Cómo se instala (una sola vez):
 *  1. Abre la hoja en Google Drive → menú Extensiones → Apps Script.
 *  2. Borra lo que haya y pega TODO este archivo.
 *  3. Cambia la CLAVE de abajo por una contraseña tuya (es la que pedirá la página para entrar).
 *  4. Guarda (ícono de disquete) → botón azul "Implementar" → "Nueva implementación".
 *     Tipo: "Aplicación web". Ejecutar como: "Yo". Quién tiene acceso: "Cualquier usuario".
 *  5. Autoriza los permisos y copia la "URL de la aplicación web".
 *
 * Cada pestaña de la hoja es una colección (pedidos, clientes, gastos, inventario, freelance).
 * La fila 1 son los nombres de los campos; la columna "id" identifica cada registro.
 */

const CLAVE = "CAMBIA-ESTA-CLAVE";

const COLECCIONES = ["pedidos", "clientes", "gastos", "inventario", "freelance"];
const ZONA = "America/Lima";

function doGet() {
  return responder({ ok: true, mensaje: "Conexión del ERP activa." });
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (CLAVE === "CAMBIA-ESTA-CLAVE") return responder({ ok: false, error: "setup", mensaje: "Falta cambiar la CLAVE en Apps Script." });
    if (req.clave !== CLAVE) {
      Utilities.sleep(800);
      return responder({ ok: false, error: "clave", mensaje: "Clave incorrecta." });
    }
    if (req.op === "version") return responder({ ok: true, version: version_() });
    if (req.op === "leer") {
      const cols = (req.cols || COLECCIONES).filter(c => COLECCIONES.indexOf(c) >= 0);
      const datos = {};
      cols.forEach(c => { datos[c] = leer_(c); });
      return responder({ ok: true, version: version_(), datos: datos });
    }
    if (req.op === "escribir") {
      const lock = LockService.getDocumentLock();
      lock.waitLock(25000);
      try {
        const resultados = escribir_(req.cambios || []);
        const v = subirVersion_();
        return responder({ ok: true, version: v, resultados: resultados });
      } finally {
        lock.releaseLock();
      }
    }
    return responder({ ok: false, error: "op", mensaje: "Operación desconocida." });
  } catch (err) {
    return responder({ ok: false, error: "servidor", mensaje: String(err && err.message || err) });
  }
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- versión: cambia con cada guardado, para que los otros equipos se actualicen ---------- */
function version_() {
  return Number(PropertiesService.getScriptProperties().getProperty("version") || 0);
}
function subirVersion_() {
  const v = version_() + 1;
  PropertiesService.getScriptProperties().setProperty("version", String(v));
  return v;
}

/* ---------- hoja ---------- */
function hoja_(c) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(c);
  if (!sh) {
    sh = ss.insertSheet(c);
    sh.getRange(1, 1).setValue("id").setFontWeight("bold");
    try { sh.setFrozenRows(1); } catch (e) {}
  }
  return sh;
}

function aCelda_(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

function deCelda_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, "yyyy-MM-dd");
  if (typeof v === "string") {
    const t = v.trim();
    if ((t.charAt(0) === "[" && t.charAt(t.length - 1) === "]") || (t.charAt(0) === "{" && t.charAt(t.length - 1) === "}")) {
      try { return JSON.parse(t); } catch (e) { return v; }
    }
  }
  return v;
}

function leer_(c) {
  const sh = hoja_(c);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values[0].map(String);
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const id = String(row[0] || "").trim();
    if (!id) continue;
    const doc = { id: id };
    for (let k = 1; k < head.length; k++) {
      if (!head[k]) continue;
      const v = row[k];
      if (v === "" || v === null) continue;
      doc[head[k]] = deCelda_(v);
    }
    out.push(doc);
  }
  return out;
}

/* cambios: [{op:"set"|"update"|"delete", col, id, data}] */
function escribir_(cambios) {
  const porCol = {};
  cambios.forEach((w, i) => {
    if (COLECCIONES.indexOf(w.col) < 0) throw new Error("Colección inválida: " + w.col);
    (porCol[w.col] = porCol[w.col] || []).push({ w: w, i: i });
  });
  const resultados = cambios.map(() => ({ ok: true }));

  Object.keys(porCol).forEach(c => {
    const sh = hoja_(c);
    const rango = sh.getDataRange();
    const values = rango.getValues();
    let head = values[0].map(String);
    if (head[0] !== "id") { head[0] = "id"; }
    const filas = values.slice(1);
    const idx = {};
    filas.forEach((row, i) => { const id = String(row[0] || "").trim(); if (id) idx[id] = i; });
    const borrar = {};

    porCol[c].forEach(({ w, i }) => {
      const id = String(w.id || "").trim();
      if (!id) { resultados[i] = { ok: false, mensaje: "Falta el id." }; return; }
      if (w.op === "delete") {
        if (id in idx) borrar[idx[id]] = true;
        delete idx[id];
        return;
      }
      if (w.op === "update" && !(id in idx)) { resultados[i] = { ok: false, error: "not_found", mensaje: "Ese registro ya no existe." }; return; }
      const data = w.data || {};
      Object.keys(data).forEach(k => { if (k !== "id" && head.indexOf(k) < 0) head.push(k); });
      let row;
      if (id in idx) row = filas[idx[id]];
      else { row = []; filas.push(row); idx[id] = filas.length - 1; }
      while (row.length < head.length) row.push("");
      row[0] = id;
      if (w.op === "set") for (let k = 1; k < head.length; k++) row[k] = "";
      Object.keys(data).forEach(k => { if (k !== "id") row[head.indexOf(k)] = aCelda_(data[k]); });
    });

    const nuevas = filas.filter((_, i) => !borrar[i]).map(r => { const x = r.slice(0, head.length); while (x.length < head.length) x.push(""); return x; });
    // Reescribe la tabla completa: así filas y columnas quedan siempre alineadas.
    const total = nuevas.length + 1;
    if (sh.getMaxColumns() < head.length) sh.insertColumnsAfter(sh.getMaxColumns(), head.length - sh.getMaxColumns());
    if (sh.getMaxRows() < total) sh.insertRowsAfter(sh.getMaxRows(), total - sh.getMaxRows());
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearContent();
    const out = [head].concat(nuevas);
    const r = sh.getRange(1, 1, out.length, head.length);
    // Números y verdadero/falso se guardan como tales, no como texto.
    const fmts = out.map((row, ri) => row.map(v => (ri > 0 && (typeof v === "number" || typeof v === "boolean")) ? "General" : "@"));
    r.setNumberFormats(fmts);
    r.setValues(out);
    sh.getRange(1, 1, 1, head.length).setFontWeight("bold");
    try { sh.setFrozenRows(1); } catch (e) {}
  });
  return resultados;
}

/* Ejecuta esta función una vez desde el editor si quieres probar que la hoja se lee bien. */
function probar() {
  COLECCIONES.forEach(c => Logger.log(c + ": " + leer_(c).length + " registros"));
}
