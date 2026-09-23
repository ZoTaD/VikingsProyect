(() => {
  const IMG = window.IMG, SOURCES = window.SOURCES, INGS = window.INGREDIENTS, FOODS = window.FOODS;
  const BIOMES = window.BIOMES, RULES = window.COMBO_RULES;
  const ingById = Object.fromEntries(INGS.map(i => [i.id, i]));
  const foodById = Object.fromEntries(FOODS.map(f => [f.id, f]));
  const biomeById = Object.fromEntries(BIOMES.map(b => [b.id, b]));
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const img = (id, cls = "", alt = "") =>
    `<img src="${esc(IMG[id] || "")}" alt="${esc(alt)}" title="${esc(alt)}" class="${cls}" referrerpolicy="no-referrer" decoding="async">`;
  const main = f => (f.type === "salud" ? f.h : f.type === "vigor" ? f.s : f.e);
  const list = a => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " y " + a[a.length - 1];

  // ---------- lo que hay en los cofres de la casa ----------
  const STOCK = window.STOCK || null, PIDS = window.PIDS || {}, CONVERTS = window.CONVERTS || {};
  const ITEMS = (STOCK && STOCK.items) || {};
  const have = id => (PIDS[id] || []).reduce((a, p) => a + (ITEMS[p] || 0), 0);
  const convertible = id => (CONVERTS[id] ? ITEMS[CONVERTS[id].pid] || 0 : 0);
  const usable = id => have(id) + convertible(id);
  const portions = f => Math.min(...f.ing.map(([i, q]) => Math.floor(usable(i) / q)));
  const MEAD_INGS = window.MEAD_INGS || {}, MEADS = window.MEADS || [];
  Object.entries(MEAD_INGS).forEach(([k, v]) => { PIDS[k] = v.pids; });
  const COOKED = (window.COOKED || []).map(c => {
    const f = c.ref ? foodById[c.ref] : c;
    const pids = c.ref ? PIDS[c.ref] || [] : c.pids;
    const e = f.e || 0, top = Math.max(f.h, f.s, e);
    return { ...f, pids, e, type: top === e && e ? "mana" : top === f.h ? "salud" : "vigor" };
  });
  const nameOf = id => (ingById[id] ? ingById[id].name : MEAD_INGS[id] ? MEAD_INGS[id].name : id);
  const whereOf = id => {
    if (MEAD_INGS[id]) return MEAD_INGS[id].where;
    const bs = ingById[id].biomes;
    return bs.length > 2 ? "varios biomas" : bs.map(b => biomeById[b].name).join(" o ");
  };
  const countPids = pids => pids.reduce((a, p) => a + (ITEMS[p] || 0), 0);
  const durTxt = s => (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);

  const foodsOfIng = {};
  FOODS.forEach(f => f.ing.forEach(([i, q]) => (foodsOfIng[i] ||= []).push([f.id, q])));
  // Hidromieles como "platos" del mapa. No dependen de los biomas.
  const MEAD_DISHES = MEADS.map(m => ({ ...m, type: "mead", isMead: true, h: 0, s: 0, e: 0,
    station: "Caldero de hidromiel y fermentador" }));
  MEAD_DISHES.forEach(m => { foodById[m.id] = m; });
  Object.entries(MEAD_INGS).forEach(([k, v]) => { ingById[k] = { id: k, name: v.name, en: v.en, biomes: [], sources: v.sources || [], meadOnly: true }; });
  const dishesOfIng = {};
  [...FOODS, ...MEAD_DISHES].forEach(f => f.ing.forEach(([i, q]) => (dishesOfIng[i] ||= []).push([f.id, q])));
  const ingsOfSrc = {};
  Object.values(ingById).forEach(i => i.sources.forEach(s => (ingsOfSrc[s.id] ||= []).push(i.id)));
  const isMeadMode = () => state.type.startsWith("mead:");
  const foodType = () => (isMeadMode() ? "todo" : state.type);

  // ---------- estado ----------
  const KEY = "despensa.biomas";
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { saved = null; }
  const state = {
    biomes: new Set(Array.isArray(saved) ? saved.filter(b => biomeById[b]) : window.DEFAULT_BIOMES),
    type: "todo", pinned: null, hover: null, combo: "explorar", servings: 6,
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...state.biomes])); } catch (e) { /* sin almacenamiento */ } };

  const ingOk = id => ingById[id].biomes.some(b => state.biomes.has(b));
  const foodOk = f => f.ing.every(([i]) => ingOk(i));
  const missingFor = f => [...new Set(f.ing.filter(([i]) => !ingOk(i)).map(([i]) => ingById[i].biomes[0]))];

  // ---------- cálculo ----------
  function compute() {
    const avail = FOODS.filter(foodOk);
    const mead = isMeadMode(), cat = state.type.slice(5);
    const shown = mead ? MEAD_DISHES.filter(m => cat === "todas" || m.cat === cat)
      : avail.filter(f => foodType() === "todo" || f.type === foodType());
    // prioridad: pesa más lo que entra en más comidas y en las mejores
    const score = {};
    avail.forEach(f => f.ing.forEach(([i]) => { score[i] = (score[i] || 0) + Math.pow(main(f) / 100, 3); }));
    const ranked = Object.keys(score).sort((a, b) => score[b] - score[a] || ingById[a].name.localeCompare(ingById[b].name));
    const rank = Object.fromEntries(ranked.map((id, k) => [id, k + 1]));
    const shownFoods = new Set(shown.map(f => f.id));
    let shownIngs;
    if (mead) {
      const used = new Map();
      shown.forEach(m => m.ing.forEach(([i]) => used.set(i, (used.get(i) || 0) + 1)));
      const order = [...used.keys()].sort((a, b) => (rank[a] || 999) - (rank[b] || 999) || used.get(b) - used.get(a));
      shownIngs = new Set(order);
    } else {
      shownIngs = new Set(ranked.filter(i => foodsOfIng[i].some(([f]) => shownFoods.has(f))));
    }
    return { avail, shown, ranked, rank, score, shownFoods, shownIngs, mead };
  }
  let C = compute();

  // ---------- selector de biomas ----------
  function renderPicker() {
    $("#biomes").innerHTML = BIOMES.map(b => `
      <button type="button" class="biome" data-b="${b.id}" aria-pressed="${state.biomes.has(b.id)}">
        ${img(b.img, "", b.name)}
        <span class="bn">${esc(b.name)}${b.note ? `<span class="bc">${esc(b.note)}</span>` : ""}</span>
        <span class="tick" aria-hidden="true">✓</span>
      </button>`).join("");
    $("#biomes").querySelectorAll(".biome").forEach(el => el.addEventListener("click", () => {
      const b = el.dataset.b;
      state.biomes.has(b) ? state.biomes.delete(b) : state.biomes.add(b);
      save(); refresh();
    }));
    const salud = C.avail.filter(f => f.type === "salud").sort((a, b) => b.h - a.h);
    const vigor = C.avail.filter(f => f.type === "vigor").sort((a, b) => b.s - a.s);
    const mana = C.avail.filter(f => f.type === "mana").sort((a, b) => b.e - a.e);
    const lost = FOODS.filter(f => !foodOk(f) && main(f) >= 85).sort((a, b) => main(b) - main(a));
    let html = C.avail.length
      ? `Con estos biomas cocinan <b>${salud.length}</b> comidas de salud, <b>${vigor.length}</b> de vigor y <b>${mana.length}</b> de maná.`
        + (salud[0] ? ` La mejor de salud es <b>${esc(salud[0].name)}</b> con ${salud[0].h}.` : "")
        + (vigor[0] ? ` La mejor de vigor es <b>${esc(vigor[0].name)}</b> con ${vigor[0].s}.` : "")
        + (mana[0] ? ` La mejor de maná es <b>${esc(mana[0].name)}</b> con ${mana[0].e}.` : "")
        + (!mana.length ? " Todas las comidas de maná piden savia, magecap o jalea real de Mistlands: si hay un mago, conviene juntar eso en un solo viaje y guardarlo." : "")
      : "Con estos biomas no sale ninguna comida de la lista. Sumá al menos uno.";
    if (lost.length && C.avail.length) {
      const why = lost.slice(0, 4).map(f => `${esc(f.name)} (falta ${missingFor(f).map(b => esc(biomeById[b].name)).join(" y ")})`);
      html += ` Se pierden ${list(why)}.`;
    }
    $("#picker-sum").innerHTML = html;
  }
  $("#preset-mine").textContent = "Todo menos Mistlands";
  $("#preset-mine").addEventListener("click", () => { state.biomes = new Set(BIOMES.map(b => b.id).filter(b => b !== "mistlands")); save(); refresh(); });
  $("#preset-all").addEventListener("click", () => { state.biomes = new Set(BIOMES.map(b => b.id)); save(); refresh(); });
  $("#preset-none").addEventListener("click", () => { state.biomes = new Set(); save(); refresh(); });

  // ---------- prioridades ----------
  function renderPrio() {
    if (!C.ranked.length) { $("#prio").innerHTML = `<p class="empty-state">Elegí algún bioma para ver qué juntar.</p>`; return; }
    const groups = [["Imprescindibles", 1, 4], ["Conviene tener siempre", 5, 10], ["Según la receta", 11, 999]];
    let html = "", n = 0;
    for (const [label, a, b] of groups) {
      const items = C.ranked.filter(id => C.rank[id] >= a && C.rank[id] <= b);
      if (!items.length) continue;
      html += `<p class="prio-group-label">${label}</p>`;
      items.forEach(id => {
        const i = ingById[id];
        const uses = foodsOfIng[id].filter(([f]) => foodOk(foodById[f]));
        const names = uses.map(([f]) => foodById[f].name);
        const why = `Va en ${uses.length === 1 ? "una comida" : uses.length + " comidas"}: ${list(names)}.`;
        const where = i.biomes.filter(b => state.biomes.has(b)).map(b => biomeById[b].name).join(" · ");
        html += `<button class="pcard ${C.rank[id] <= 4 ? "top" : ""} ${C.mead || C.shownIngs.has(id) ? "" : "off"}" data-id="${id}" style="animation-delay:${(n++) * 30}ms">
          <span class="rank">${C.rank[id]}</span>
          <span class="pic">${img(id, "", i.name)}</span>
          <span><span class="nm">${esc(i.name)}${STOCK ? `<span class="stock" title="En los cofres de la casa">${usable(id)} en casa</span>` : ""}</span><span class="en">${esc(i.en)} · ${esc(where)}</span>
            <span class="uses">${uses.map(([f]) => img(f, foodById[f].type, foodById[f].name)).join("")}</span></span>
          <p class="why">${esc(why)}</p>
        </button>`;
      });
    }
    $("#prio").innerHTML = html;
    $("#prio").querySelectorAll(".pcard").forEach(b => b.addEventListener("click", () => {
      state.pinned = "ing:" + b.dataset.id; applyFocus(); renderDetail();
      const target = window.matchMedia("(max-width: 900px)").matches ? $("#chains") : $("#map");
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  // ---------- mapa ----------
  function nodeHTML(kind, id) {
    if (kind === "src") {
      const s = SOURCES[id];
      return `<button class="node src" data-key="src:${id}">
        <span class="pic">${img(id, "", s.name)}</span>
        <span><span class="nm">${esc(s.name)}</span><span class="sub">${esc(s.kind)}</span></span></button>`;
    }
    if (kind === "ing") {
      const i = ingById[id];
      return `<button class="node ing" data-key="ing:${id}">
        <span class="pic">${img(id, "", i.name)}</span>
        <span><span class="nm">${C.rank[id] && !C.mead ? `<span class="prank">${C.rank[id]}</span>` : ""}${esc(i.name)}</span><span class="sub">${esc(i.en)}</span></span></button>`;
    }
    const f = foodById[id];
    const recipe = f.ing.map(([i, q]) => `<span title="${esc(ingById[i].name)}">${img(i, "", ingById[i].name)}×${q}</span>`).join("");
    if (f.isMead) return `<button class="node food mead" data-key="food:${id}">
      <span class="pic">${img(id, "", f.name)}</span>
      <span><span class="nm">${esc(f.name)}</span><span class="sub">${esc(f.en)} · ${f.out} por base</span>
        <span class="effect">${esc(f.effect)} · ${durTxt(f.dur)}</span>
        <span class="recipe">${recipe}</span></span></button>`;
    return `<button class="node food ${f.type}" data-key="food:${id}">
      <span class="pic">${img(id, "", f.name)}</span>
      <span><span class="nm">${esc(f.name)}</span><span class="sub">${esc(f.en)} · ${esc(f.station)}</span>
        <span class="stats"><span class="stat h"><b>${f.h}</b> salud</span><span class="stat s"><b>${f.s}</b> vigor</span>${f.e ? `<span class="stat e"><b>${f.e}</b> maná</span>` : ""}</span>
        <span class="recipe">${recipe}</span></span></button>`;
  }

  // origen visible solo si da algún ingrediente que se muestra
  const srcVisible = (src, ings) => (ingsOfSrc[src] || []).some(i => ings.has(i));

  function renderMap() {
    const ingOrder = C.mead ? [...C.shownIngs] : C.ranked.filter(i => C.shownIngs.has(i));
    const pos = Object.fromEntries(ingOrder.map((i, k) => [i, k]));
    const srcs = Object.keys(SOURCES).filter(s => srcVisible(s, C.shownIngs));
    srcs.sort((a, b) => {
      const ra = Math.min(...ingsOfSrc[a].filter(i => C.shownIngs.has(i)).map(i => pos[i]));
      const rb = Math.min(...ingsOfSrc[b].filter(i => C.shownIngs.has(i)).map(i => pos[i]));
      return ra - rb;
    });
    const byStat = t => C.shown.filter(f => f.type === t && !f.isMead).sort((a, b) => main(b) - main(a));
    const salud = byStat("salud"), vigor = byStat("vigor"), mana = byStat("mana");
    const meads = C.shown.filter(f => f.isMead);
    $("#col-mead").innerHTML = meads.map(f => nodeHTML("food", f.id)).join("");
    $(".h-mead").hidden = !meads.length;
    $(".h-mead").style.marginTop = salud.length || vigor.length || mana.length ? "" : "0";
    $("#col-src").innerHTML = srcs.map(id => nodeHTML("src", id)).join("");
    $("#col-ing").innerHTML = ingOrder.map(id => nodeHTML("ing", id)).join("");
    $("#col-salud").innerHTML = salud.map(f => nodeHTML("food", f.id)).join("");
    $("#col-vigor").innerHTML = vigor.map(f => nodeHTML("food", f.id)).join("");
    $("#col-mana").innerHTML = mana.map(f => nodeHTML("food", f.id)).join("");
    $(".h-salud").hidden = !salud.length; $(".h-vigor").hidden = !vigor.length; $(".h-mana").hidden = !mana.length;
    $(".h-vigor").style.marginTop = salud.length ? "" : "0";
    $(".h-mana").style.marginTop = salud.length || vigor.length ? "" : "0";

    $("#map").querySelectorAll(".node").forEach(n => {
      n.addEventListener("mouseenter", () => { state.hover = n.dataset.key; applyFocus(); renderDetail(); });
      n.addEventListener("mouseleave", () => { state.hover = null; applyFocus(); renderDetail(); });
      n.addEventListener("click", () => { state.pinned = state.pinned === n.dataset.key ? null : n.dataset.key; applyFocus(); renderDetail(); });
    });
    if (state.pinned && !$(`#map [data-key="${state.pinned}"]`)) state.pinned = null;
    renderChains(ingOrder);
    drawWires();
  }

  // ---------- flechas ----------
  function drawWires() {
    const map = $("#map"), g = $("#wire-g");
    if (getComputedStyle(map).display === "none") { g.innerHTML = ""; return; }
    const box = map.getBoundingClientRect();
    const el = key => map.querySelector(`[data-key="${key}"]`);
    const rect = e => { const r = e.getBoundingClientRect(); return { l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, h: r.height }; };
    const spread = (r, k, n) => r.t + r.h * (k + 1) / (n + 1);
    const path = (x1, y1, x2, y2) => { const dx = Math.max(30, (x2 - x1) * 0.5); return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2 - 4},${y2}`; };
    let out = "";
    map.querySelectorAll(".node.ing").forEach(ne => {
      const id = ne.dataset.key.slice(4), ri = rect(ne);
      const srcs = ingById[id].sources.filter(s => el("src:" + s.id));
      srcs.forEach((s, k) => {
        const rs = rect(el("src:" + s.id));
        out += `<path class="wire src" data-from="src:${s.id}" data-to="ing:${id}" marker-end="url(#ah-src)" d="${path(rs.r, rs.t + rs.h / 2, ri.l, spread(ri, k, srcs.length))}"/>`;
      });
    });
    map.querySelectorAll(".node.food").forEach(nf => {
      const id = nf.dataset.key.slice(5), f = foodById[id], rf = rect(nf);
      const ing = f.ing.filter(([i]) => el("ing:" + i));
      ing.forEach(([i], k) => {
        const ri = rect(el("ing:" + i));
        const outs = dishesOfIng[i].map(([ff]) => ff).filter(ff => el("food:" + ff));
        out += `<path class="wire ${f.type}" data-from="ing:${i}" data-to="food:${id}" marker-end="url(#ah-${f.type})" d="${path(ri.r, spread(ri, outs.indexOf(id), outs.length), rf.l, spread(rf, k, ing.length))}"/>`;
      });
    });
    g.innerHTML = out;
    applyFocus();
  }

  // ---------- foco ----------
  function connected(key) {
    const set = new Set([key]);
    const kind = key.split(":")[0], id = key.slice(key.indexOf(":") + 1);
    const addIng = i => { set.add("ing:" + i); ingById[i].sources.forEach(s => set.add("src:" + s.id)); };
    if (kind === "food") foodById[id].ing.forEach(([i]) => addIng(i));
    if (kind === "ing") { addIng(id); (dishesOfIng[id] || []).forEach(([f]) => set.add("food:" + f)); }
    if (kind === "src") (ingsOfSrc[id] || []).forEach(i => { set.add("ing:" + i); (dishesOfIng[i] || []).forEach(([f]) => set.add("food:" + f)); });
    return set;
  }
  function applyFocus() {
    const map = $("#map"), key = state.hover || state.pinned;
    map.classList.toggle("focus", !!key);
    map.querySelectorAll(".node").forEach(n => { n.classList.remove("lit"); n.classList.toggle("pinned", n.dataset.key === state.pinned); });
    map.querySelectorAll(".wire").forEach(w => w.classList.remove("lit"));
    if (!key) return;
    const set = connected(key), kind = key.split(":")[0];
    map.querySelectorAll(".node").forEach(n => set.has(n.dataset.key) && n.classList.add("lit"));
    map.querySelectorAll(".wire").forEach(w => {
      const a = w.dataset.from, b = w.dataset.to;
      let lit = set.has(a) && set.has(b);
      if (kind === "food" && b.startsWith("food:")) lit = b === key;
      if (kind === "src" && a.startsWith("src:")) lit = a === key;
      if (lit) w.classList.add("lit");
    });
    map.querySelectorAll(".wire.lit").forEach(w => w.parentNode.appendChild(w));
  }

  // ---------- detalle ----------
  function renderDetail() {
    const d = $("#detail"), key = state.hover || state.pinned;
    if (!key) {
      d.innerHTML = `<p class="empty">Pasá el mouse por un origen, un ingrediente o una comida para ver cómo se consigue y a dónde va.</p>
        <p class="empty">Las flechas grises van del origen al ingrediente. Las rojas terminan en comidas de salud y las amarillas en comidas de vigor.</p>`;
      return;
    }
    const kind = key.split(":")[0], id = key.slice(key.indexOf(":") + 1);
    if (kind === "ing") {
      const i = ingById[id];
      const uses = (dishesOfIng[id] || []).filter(([f]) => C.shownFoods.has(f));
      d.innerHTML = `<div class="d-top"><span class="pic">${img(id, "", i.name)}</span>
          <div><h4>${esc(i.name)}</h4><span class="kind">${esc(i.en)}${C.rank[id] ? ` · Prioridad ${C.rank[id]}` : ""}${STOCK ? ` · ${usable(id)} en casa` : ""}</span></div></div>
        <div class="d-sec"><h5>Cómo se consigue</h5><ul>${i.sources.map(s => `<li>${img(s.id, "", SOURCES[s.id].name)}<span><b>${esc(SOURCES[s.id].name)}</b>${esc(s.how)}</span></li>`).join("")}</ul></div>
        <div class="d-sec"><h5>Va en</h5><ul>${uses.map(([f, q]) => `<li>${img(f, "", foodById[f].name)}<span><b>${esc(foodById[f].name)} ×${q}</b>${foodById[f].isMead ? esc(foodById[f].effect) : `${foodById[f].h} salud · ${foodById[f].s} vigor${foodById[f].e ? " · " + foodById[f].e + " maná" : ""}`}</span></li>`).join("")}</ul></div>`;
    } else if (kind === "food" && foodById[id].isMead) {
      const m = foodById[id];
      d.innerHTML = `<div class="d-top"><span class="pic">${img(id, "", m.name)}</span>
          <div><h4>${esc(m.name)}</h4><span class="kind">${esc(m.en)} · ${esc(m.station)}</span></div></div>
        <p class="why">${esc(m.effect)} durante ${durTxt(m.dur)}. Cada base rinde ${m.out} botellas.</p>
        <div class="d-sec"><h5>Base</h5><ul>${m.ing.map(([i, q]) => `<li>${img(i, "", ingById[i].name)}<span><b>${q} × ${esc(ingById[i].name)}</b>${esc(ingById[i].sources.map(s => SOURCES[s.id].name).join(" · "))}${STOCK ? ` · ${usable(i)} en casa` : ""}</span></li>`).join("")}</ul></div>`;
    } else if (kind === "food") {
      const f = foodById[id];
      d.innerHTML = `<div class="d-top"><span class="pic">${img(id, "", f.name)}</span>
          <div><h4>${esc(f.name)}</h4><span class="kind">${esc(f.en)} · ${esc(f.station)} · tier ${esc(f.tier)}</span></div></div>
        <div class="d-sec"><h5>Salud ${f.h}</h5><div class="bar"><i class="h" style="width:${f.h / 1.05}%"></i></div>
          <h5>Vigor ${f.s}</h5><div class="bar"><i class="s" style="width:${f.s}%"></i></div>
          ${f.e ? `<h5>Maná ${f.e}</h5><div class="bar"><i class="e" style="width:${f.e}%"></i></div>` : ""}</div>
        <div class="d-sec"><h5>Receta</h5><ul>${f.ing.map(([i, q]) => `<li>${img(i, "", ingById[i].name)}<span><b>${q} × ${esc(ingById[i].name)}</b>${esc(ingById[i].sources.map(s => SOURCES[s.id].name).join(" · "))}</span></li>`).join("")}</ul></div>`;
    } else {
      const s = SOURCES[id];
      const items = (ingsOfSrc[id] || []).filter(i => C.shownIngs.has(i)).map(i => {
        const how = ingById[i].sources.find(x => x.id === id).how;
        return `<li>${img(i, "", ingById[i].name)}<span><b>${esc(ingById[i].name)}</b>${esc(how)}</span></li>`;
      }).join("");
      d.innerHTML = `<div class="d-top"><span class="pic">${img(id, "", s.name)}</span>
          <div><h4>${esc(s.name)}</h4><span class="kind">${esc(s.kind)}</span></div></div>
        <div class="d-sec"><h5>Qué sacás de acá</h5><ul>${items}</ul></div>`;
    }
  }

  // ---------- cadenas para pantallas chicas ----------
  function renderChains(ingOrder) {
    $("#chains").innerHTML = ingOrder.length ? ingOrder.map(id => {
      const i = ingById[id];
      const from = i.sources.map(s => img(s.id, "", SOURCES[s.id].name)).join("");
      const to = (dishesOfIng[id] || []).filter(([f]) => C.shownFoods.has(f)).map(([f, q]) => img(f, foodById[f].type, `${foodById[f].name} ×${q}`)).join("");
      return `<div class="chain"><div class="from">${from}<span class="arrow a1">→</span></div>
        <div class="mid">${img(id, "", i.name)}<b>${C.rank[id] && !C.mead ? `<span class="prank">${C.rank[id]}</span> ` : ""}${esc(i.name)}</b><span class="arrow">→</span></div>
        <div class="to">${to}</div></div>`;
    }).join("") : `<p class="empty-state">No hay comidas con estos biomas.</p>`;
  }

  // ---------- combinaciones y mochila ----------
  function combos() {
    const salud = C.avail.filter(f => f.type === "salud").sort((a, b) => b.h - a.h);
    const vigor = C.avail.filter(f => f.type === "vigor").sort((a, b) => b.s - a.s);
    const mana = C.avail.filter(f => f.type === "mana").sort((a, b) => b.e - a.e);
    return RULES.map(r => ({ ...r, foods: [...mana.slice(0, r.mana || 0), ...salud.slice(0, r.salud || 0), ...vigor.slice(0, r.vigor || 0)] }))
      .filter(c => c.foods.length === 3);
  }
  function renderCombos() {
    const list = combos();
    if (!list.some(c => c.id === state.combo)) state.combo = list[0] ? list[0].id : null;
    $("#combo-list").innerHTML = list.length ? list.map((c, k) => {
      const h = c.foods.reduce((a, f) => a + f.h, 0), s = c.foods.reduce((a, f) => a + f.s, 0), e = c.foods.reduce((a, f) => a + (f.e || 0), 0);
      return `<div class="combo" role="button" tabindex="0" data-c="${c.id}" aria-pressed="${c.id === state.combo}" style="animation-delay:${k * 60}ms">
        <h4>${esc(c.name)}</h4><p>${esc(c.note)}</p>
        <div class="trio">${c.foods.map(f => img(f.id, f.type, f.name)).join("")}</div>
        <div class="tot h"><span>Salud</span><span class="bar"><i style="width:${Math.min(100, h / 3.1)}%"></i></span><b class="h">${h}</b></div>
        <div class="tot s"><span>Vigor</span><span class="bar"><i style="width:${Math.min(100, s / 3.1)}%"></i></span><b class="s">${s}</b></div>
        ${e ? `<div class="tot e"><span>Maná</span><span class="bar"><i style="width:${Math.min(100, e / 3.1)}%"></i></span><b class="e">${e}</b></div>` : ""}
        <p class="names">${c.foods.map(f => esc(f.name)).join(" + ")}</p>
        <span class="pick">${c.id === state.combo ? "En la mochila" : "Armar la mochila con esta"}</span>
      </div>`;
    }).join("") : `<p class="empty-state">Hacen falta al menos tres comidas para armar una combinación. Sumá biomas.</p>`;
    $("#combo-list").querySelectorAll(".combo").forEach(b => {
      const pick = () => { state.combo = b.dataset.c; renderCombos(); $(`.combo[data-c="${state.combo}"]`).focus(); };
      b.addEventListener("click", pick);
      b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    });
    renderPack(list.find(c => c.id === state.combo));
  }
  function renderPack(c) {
    $("#pack").hidden = !c;
    if (!c) return;
    const n = state.servings;
    $("#pack-title").textContent = `Mochila para ${c.name.toLowerCase()}`;
    const mins = n * 25, hrs = Math.floor(mins / 60), rest = mins % 60;
    $("#pack-note").textContent = `${n} ${n === 1 ? "porción" : "porciones"} de cada una alcanzan para unas ${hrs ? hrs + " h" : ""}${rest ? " " + rest + " min" : ""} comiendo de corrido. Abajo está todo lo que hay que juntar para cocinarlas.`;
    $("#pack-foods").innerHTML = c.foods.map(f => `<li>${img(f.id, f.type, f.name)}<span><b>${esc(f.name)}</b><small>${esc(f.station)}</small></span><span class="qty">×${n}</span></li>`).join("");
    const tot = {};
    c.foods.forEach(f => f.ing.forEach(([i, q]) => { tot[i] = (tot[i] || 0) + q * n; }));
    $("#pack-ings").innerHTML = Object.entries(tot).sort((a, b) => C.rank[a[0]] - C.rank[b[0]]).map(([i, q]) => {
      const where = ingById[i].biomes.filter(b => state.biomes.has(b)).map(b => biomeById[b].name).join(" · ");
      const got = usable(i);
      const stockLine = STOCK ? `<span class="have ${got >= q ? "ok" : "short"}">${got >= q ? `Tienen ${got} en casa` : `Tienen ${got}, faltan ${q - got}`}</span>` : "";
      return `<li>${img(i, "", ingById[i].name)}<span><b>${esc(ingById[i].name)}</b><small>${esc(where)}</small>${stockLine}</span><span class="qty">${q}</span></li>`;
    }).join("");
  }
  const setServings = v => { state.servings = Math.max(1, Math.min(99, Math.round(+v) || 1)); $("#porciones").value = state.servings; renderCombos(); };
  $("#menos").addEventListener("click", () => setServings(state.servings - 1));
  $("#mas").addEventListener("click", () => setServings(state.servings + 1));
  $("#porciones").addEventListener("change", e => setServings(e.target.value));

  // ---------- filtro de tipo ----------
  $("#mead-seg").innerHTML = (window.MEAD_CATS || []).map(c => `<button data-v="mead:${c.id}">${c.id === "todas" ? '<i class="dot mead"></i>' : ""}${esc(c.name)}</button>`).join("");
  document.querySelectorAll(".seg").forEach(seg => seg.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll(`.seg[data-filter="${seg.dataset.filter}"] button`).forEach(x => x.classList.toggle("on", x === b));
    state[seg.dataset.filter] = b.dataset.v;
    state.pinned = null;
    refresh();
  }));

  function renderCasa() {
    const sec = $("#casa");
    sec.hidden = !STOCK;
    if (!STOCK) return;
    const when = String(STOCK.descarga || STOCK.leido || "");
    const m = when.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    const fecha = m ? `${+m[3]}/${+m[2]} a las ${m[4]}:${m[5]}` : when;
    $("#casa-sub").textContent = `Lo que hay en los ${STOCK.cofres_casa} cofres de la casa según la copia del servidor del ${fecha}. El servidor guarda cada tanto, así que lo último que movieron puede no estar.`;
    const typeOk = f => foodType() === "todo" || f.type === foodType();
    const stat = f => `${main(f)} ${f.type === "salud" ? "salud" : f.type === "vigor" ? "vigor" : "maná"}`;
    const none = t => `<li class="none">${t}</li>`;
    const pool = FOODS.filter(typeOk);

    const cook = pool.map(f => ({ f, n: portions(f) })).filter(x => x.n > 0).sort((a, b) => main(b.f) - main(a.f));
    $("#casa-cook").innerHTML = cook.length ? cook.map(({ f, n }) => {
      const lim = f.ing.reduce((a, [i, q]) => (Math.floor(usable(i) / q) < Math.floor(usable(a[0]) / a[1]) ? [i, q] : a), f.ing[0]);
      const conv = f.ing.filter(([i]) => convertible(i) && have(i) < f.ing.find(x => x[0] === i)[1] * n).map(([i]) => CONVERTS[i].note);
      return `<li>${img(f.id, f.type, f.name)}<span><b>${esc(f.name)}</b><small>${stat(f)} · ${esc(f.station)}${f.ing.length > 1 ? ` · limita ${esc(ingById[lim[0]].name.toLowerCase())}` : ""}${conv.length ? ` · usa ${esc(conv.join(", "))}` : ""}</small></span><span class="qty">×${n}</span></li>`;
    }).join("") : none("Con lo que hay no sale ninguna receta completa.");

    const near = pool.map(f => ({ f, miss: f.ing.filter(([i, q]) => usable(i) < q) }))
      .filter(x => x.miss.length === 1).sort((a, b) => main(b.f) - main(a.f));
    $("#casa-near").innerHTML = near.length ? near.map(({ f, miss }) => {
      const [i, q] = miss[0], falt = q - usable(i);
      const where = whereOf(i);
      return `<li>${img(f.id, f.type, f.name)}<span><b>${esc(f.name)}</b><small>Falta <b>${falt} ${esc(ingById[i].name.toLowerCase())}</b> · ${esc(where)}</small></span>${img(i, "", ingById[i].name)}</li>`;
    }).join("") : none("No hay recetas a un solo ingrediente de distancia.");

    const ready = COOKED.filter(typeOk).map(f => ({ f, n: countPids(f.pids) })).filter(x => x.n > 0).sort((a, b) => main(b.f) - main(a.f));
    $("#casa-ready").innerHTML = ready.length ? ready.map(({ f, n }) =>
      `<li>${img(f.id, f.type, f.name)}<span><b>${esc(f.name)}</b><small>${f.h} salud · ${f.s} vigor${f.e ? " · " + f.e + " maná" : ""}</small></span><span class="qty">×${n}</span></li>`).join("")
      : none("No hay comida cocinada en los cofres.");

    // hidromieles
    const bases = m => Math.min(...m.ing.map(([i, q]) => Math.floor(usable(i) / q)));
    const mcook = MEADS.map(m => ({ m, n: bases(m) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
    $("#mead-cook").innerHTML = mcook.length ? mcook.map(({ m, n }) => {
      const lim = m.ing.reduce((a, [i, q]) => (Math.floor(usable(i) / q) < Math.floor(usable(a[0]) / a[1]) ? [i, q] : a), m.ing[0]);
      return `<li>${img(m.id, "", m.name)}<span><b>${esc(m.name)}</b><span class="mead-eff">${esc(m.effect)} · ${durTxt(m.dur)}</span><small>${n} ${n === 1 ? "base" : "bases"}, ${n * m.out} botellas · limita ${esc(nameOf(lim[0]).toLowerCase())}</small></span><span class="qty">×${n}</span></li>`;
    }).join("") : none("Con lo que hay no sale ninguna base completa.");

    const mnear = MEADS.map(m => ({ m, miss: m.ing.filter(([i, q]) => usable(i) < q) })).filter(x => x.miss.length === 1);
    $("#mead-near").innerHTML = mnear.length ? mnear.map(({ m, miss }) => {
      const [i, q] = miss[0];
      return `<li>${img(m.id, "", m.name)}<span><b>${esc(m.name)}</b><span class="mead-eff">${esc(m.effect)}</span><small>Falta <b>${q - usable(i)} ${esc(nameOf(i).toLowerCase())}</b> · ${esc(whereOf(i))}</small></span>${img(i, "", nameOf(i))}</li>`;
    }).join("") : none("No hay bases a un solo ingrediente de distancia.");

    const mready = MEADS.map(m => ({ m, n: ITEMS[m.pid] || 0, b: ITEMS[m.base] || 0 })).filter(x => x.n || x.b).sort((a, b) => b.n - a.n);
    const readyN = ready.reduce((a, x) => a + x.n, 0), meadN = mready.reduce((a, x) => a + x.n, 0);
    $("#sum-comida").innerHTML = `<b>${cook.length}</b> ${cook.length === 1 ? "receta sale" : "recetas salen"} con lo que hay · <b>${near.length}</b> a un ingrediente · <b>${readyN}</b> porciones ya cocinadas`;
    $("#sum-mead").innerHTML = `<b>${mcook.length}</b> ${mcook.length === 1 ? "base sale" : "bases salen"} con lo que hay · <b>${mnear.length}</b> a un ingrediente · <b>${meadN}</b> botellas en los cofres`;
    $("#mead-ready").innerHTML = mready.length ? mready.map(({ m, n, b }) =>
      `<li>${img(m.id, "", m.name)}<span><b>${esc(m.name)}</b><span class="mead-eff">${esc(m.effect)} · ${durTxt(m.dur)}</span>${b ? `<small>${b} ${b === 1 ? "base" : "bases"} para fermentar (${b * m.out} botellas)</small>` : ""}</span><span class="qty">×${n}</span></li>`).join("")
      : none("No hay hidromieles en los cofres.");
  }

  // desplegables de la casa: recordar si quedaron abiertos
  document.querySelectorAll("details.fold").forEach(d => {
    try { if (localStorage.getItem("despensa." + d.id) === "1") d.open = true; } catch (e) { /* sin almacenamiento */ }
    d.addEventListener("toggle", () => {
      try { localStorage.setItem("despensa." + d.id, d.open ? "1" : "0"); } catch (e) { /* sin almacenamiento */ }
    });
  });

  // ---------- barra de estado de las actualizaciones ----------
  function renderStatus() {
    const bar = $("#statusbar"), ST = window.STATUS || null;
    if (!STOCK && !ST) { bar.hidden = true; return; }
    const tz = "America/Argentina/Buenos_Aires";
    const parts = d => Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map(p => [p.type, p.value]));
    const now = parts(new Date());
    const today = `${now.year}-${now.month}-${now.day}`;
    const asDate = s => new Date(s.replace(" ", "T").slice(0, 16) + ":00-03:00");
    const when = s => {
      if (!s) return "sin datos";
      const [d, t] = s.split(" ");
      const [y, m, dd] = d.split("-");
      return (d === today ? "hoy a las " : `el ${+dd}/${+m} a las `) + t.slice(0, 5);
    };
    const bits = [];
    if (STOCK) bits.push(`<span>Datos de la casa de <b>${when(STOCK.descarga)}</b></span>`);
    if (ST) {
      const h = +now.hour;
      // las corridas automáticas son a las :17 de cada hora de 9 a 23, y GitHub puede atrasarlas unos minutos
      const m = +now.minute, RUN = 17, hh = String(RUN).padStart(2, "0");
      const next = h < 9 ? `9:${hh}` : h > 23 || (h === 23 && m >= RUN) ? `mañana 9:${hh}` : m < RUN ? `${h}:${hh}` : `${h + 1}:${hh}`;
      bits.push(`<span>Próxima actualización: <b>${next}</b> aprox.</span>`);
      if (!ST.descarga_ok) {
        bits.push(`<span class="warn">La actualización de ${when(ST.generado)} no pudo bajar el mundo. Se muestran los datos anteriores.</span>`);
      }
      const fails = (ST.corridas || []).filter(c => !c.ok && c.evento === "schedule");
      if (fails.length) {
        bits.push(`<span class="warn">${fails.length === 1 ? "Falló 1 actualización automática" : `Fallaron ${fails.length} actualizaciones automáticas`} en las últimas 24 h: ${fails.map(c => c.hora.slice(11, 16)).join(", ")}</span>`);
      } else if (ST.descarga_ok) {
        bits.push(`<span class="ok">Sin fallas en las últimas 24 h</span>`);
      }
      // si en horario activo los datos tienen más de 2 horas y media, algo no está corriendo
      if (STOCK && STOCK.descarga && h >= 10 && h <= 23) {
        const age = (Date.now() - asDate(STOCK.descarga).getTime()) / 60000;
        if (age > 150) bits.push(`<span class="warn">Hace ${Math.round(age / 60)} h que no se actualizan los datos</span>`);
      }
    }
    bar.innerHTML = bits.join("");
    bar.hidden = false;
  }

  function refresh() {
    C = compute();
    renderStatus(); renderPicker(); renderCasa(); renderPrio(); renderMap(); renderDetail(); renderCombos();
  }
  refresh();
  let raf = 0;
  const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawWires); };
  new ResizeObserver(redraw).observe($("#map"));
  window.addEventListener("resize", redraw);
  document.fonts && document.fonts.ready.then(redraw);
})();
