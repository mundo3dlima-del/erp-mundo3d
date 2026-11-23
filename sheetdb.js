/* SheetDB: guarda los datos del ERP en la hoja de Google "ERP Mundo 3D - Datos",
   a través de la conexión de Apps Script (apps-script/Codigo.gs).
   Imita la parte de la API de base de datos que usa el ERP:
   db.collection(c).doc(id).set/update/delete, db.collection(c).add, db.collection(c).onSnapshot. */
(function () {
  const CFG = window.ERP_CONFIG || {};
  const KEY = "erp-sesion";
  const POLL_MS = 30000;
  const COLS = ["pedidos", "clientes", "gastos", "inventario", "freelance"];

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) { return null; } };
  const save = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (_) {} };
  const err = (code, message) => Object.assign(new Error(message || code), { code });
  const newId = () => {
    const a = "abcdefghijklmnopqrstuvwxyz0123456789"; let s = "";
    for (const x of crypto.getRandomValues(new Uint8Array(20))) s += a[x % a.length];
    return s;
  };

  // Apps Script no acepta peticiones con encabezados especiales, por eso se envía como texto simple.
  async function call(url, body) {
    let r;
    try {
      r = await fetch(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow", cache: "no-store" });
    } catch (_) { throw err("offline", "Sin conexión a internet."); }
    if (!r.ok) throw err("unavailable", `La hoja de Google respondió ${r.status}.`);
    let j;
    try { j = await r.json(); } catch (_) { throw err("unavailable", "La conexión con la hoja de Google no respondió bien. Revisa que la aplicación web esté implementada con acceso para “Cualquier usuario”."); }
    if (!j.ok) throw err(j.error === "clave" ? "unauthenticated" : (j.error || "unavailable"), j.mensaje || "Error en la hoja de Google.");
    return j;
  }

  function makeDB(sess) {
    const url = sess.url, clave = sess.clave;
    const st = {}; // c -> {map, listeners}
    let version = -1;
    let pending = [], timer = null, chain = Promise.resolve();
    let loaded = null;

    COLS.forEach(c => { st[c] = { map: {}, listeners: new Set() }; });
    const docsOf = c => Object.entries(st[c].map).map(([id, d]) => ({ id, data: () => ({ ...d }) }));
    function notify(c) { for (const l of st[c].listeners) try { l.ok({ docs: docsOf(c) }); } catch (e) { console.error(e); } }
    function apply(datos) {
      for (const c of Object.keys(datos)) {
        if (!st[c]) st[c] = { map: {}, listeners: new Set() };
        const m = {};
        for (const d of datos[c]) { const { id, ...rest } = d; m[id] = rest; }
        st[c].map = m;
      }
    }
    async function loadAll() {
      const j = await call(url, { clave, op: "leer", cols: COLS });
      apply(j.datos); version = j.version;
      COLS.forEach(notify);
    }
    function ensure() { if (!loaded) loaded = loadAll().catch(e => { loaded = null; throw e; }); return loaded; }

    // Agrupa los cambios hechos casi al mismo tiempo en un solo envío.
    function queue(w) {
      return new Promise((resolve, reject) => {
        pending.push({ w, resolve, reject });
        clearTimeout(timer);
        timer = setTimeout(() => { chain = chain.then(flush); }, 80);
      });
    }
    async function flush() {
      const batch = pending.splice(0);
      if (!batch.length) return;
      try {
        await ensure();
        const j = await call(url, { clave, op: "escribir", cambios: batch.map(b => b.w) });
        const touched = new Set();
        batch.forEach((b, i) => {
          const res = (j.resultados || [])[i] || { ok: true };
          if (!res.ok) { b.reject(err(res.error || "failed", res.mensaje)); return; }
          const { op, col, id, data } = b.w; const m = st[col].map;
          if (op === "delete") delete m[id];
          else if (op === "set") m[id] = { ...data };
          else m[id] = { ...(m[id] || {}), ...data };
          touched.add(col); b.resolve();
        });
        // Si alguien más guardó entre medio, recarga todo para no mostrar datos viejos.
        if (j.version !== version + 1) { version = j.version; await loadAll(); }
        else { version = j.version; touched.forEach(notify); }
      } catch (e) {
        batch.forEach(b => b.reject(e));
      }
    }

    async function poll() {
      if (document.hidden || pending.length) return;
      chain = chain.then(async () => {
        try {
          const j = await call(url, { clave, op: "version" });
          if (j.version !== version) await loadAll();
        } catch (_) {}
      });
    }
    setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });

    function collection(c) {
      return {
        doc(id) {
          return {
            id,
            set: data => queue({ op: "set", col: c, id, data }),
            update: data => queue({ op: "update", col: c, id, data }),
            delete: () => queue({ op: "delete", col: c, id })
          };
        },
        async add(data) { const id = newId(); await queue({ op: "set", col: c, id, data }); return { id }; },
        onSnapshot(ok, bad) {
          const l = { ok, bad: bad || (() => {}) };
          if (!st[c]) st[c] = { map: {}, listeners: new Set() };
          st[c].listeners.add(l);
          ensure().catch(e => l.bad(e));
          if (version >= 0) ok({ docs: docsOf(c) });
          return () => st[c].listeners.delete(l);
        }
      };
    }
    return { collection };
  }

  /* ---------- pantalla de entrada ---------- */
  function loginScreen(message) {
    return new Promise(resolve => {
      const prev = load() || {};
      const url = prev.url || CFG.url || "";
      const wrap = document.createElement("div");
      wrap.className = "login";
      wrap.innerHTML = `
      <form class="logincard" autocomplete="on">
        <img src="icons/icon-192.png" alt="" width="64" height="64" class="loginlogo">
        <h2>ERP</h2>
        <p class="muted">Mundo 3D · Merchy Prints · Nathan3D</p>
        <div class="banner" ${message ? "" : "hidden"}></div>
        <input type="text" name="username" autocomplete="username" value="erp" hidden>
        <label>Clave<input name="clave" type="password" required autocomplete="current-password" autofocus></label>
        <details ${url ? "" : "open"}><summary>Conexión con la hoja de Google</summary>
          <label style="margin-top:8px">URL de la aplicación web<input name="url" value="" placeholder="https://script.google.com/macros/s/…/exec" required></label>
        </details>
        <button class="btn primary" type="submit">Entrar</button>
        <p class="muted" style="font-size:12px">La clave se recuerda en este equipo. Para salir, usa “Cerrar sesión” en el menú.</p>
      </form>`;
      document.body.appendChild(wrap);
      const f = wrap.querySelector("form");
      f.url.value = url;
      const banner = f.querySelector(".banner");
      if (message) banner.textContent = message;
      f.addEventListener("submit", async ev => {
        ev.preventDefault();
        const btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Entrando…";
        const sess = { url: f.url.value.trim(), clave: f.clave.value };
        try {
          await call(sess.url, { clave: sess.clave, op: "version" });
          save(sess); wrap.remove(); resolve(sess);
        } catch (e) {
          btn.disabled = false; btn.textContent = "Entrar";
          banner.hidden = false; banner.textContent = e.message;
        }
      });
    });
  }

  window.SheetDB = {
    async connect() {
      let sess = load();
      if (sess && sess.url && sess.clave) {
        try { await call(sess.url, { clave: sess.clave, op: "version" }); return makeDB(sess); }
        catch (e) {
          if (e.code === "offline") return makeDB(sess);
          save({ url: sess.url });
          sess = await loginScreen(e.message);
          return makeDB(sess);
        }
      }
      sess = await loginScreen();
      return makeDB(sess);
    },
    logout() { const s = load() || {}; save({ url: s.url }); location.reload(); }
  };
})();
