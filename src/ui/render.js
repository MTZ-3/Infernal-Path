// src/ui/render.js
// ============================================================================
// UI für "Infernal Path"
// - Layout: Topbar, Map links, Hand unten, Log rechts
// - Logs & Toasts
// - Hand-Rendering (Instanzen!)
// - Lobby (Deck-Auswahl)
// - Portal
// - Opferaltar & Deck-Übersicht
// - Runen-Panel + Runen-Shop
// ============================================================================

import { GameState, BASE_ENERGY, BASE_DRAW} from "../game/core/gameState.js";
import { playCard, instView, newInstance, drawCards, sacrifice, bindLogger as bindCardLogger, scaledValue} from "../game/cards/cards.js";
import { renderMap } from "../game/map/map.js";

// ============================================================================
// Kleine Helper
// ============================================================================

// Laufzeit-Runendaten aus runes.de.json
let RUNE_DEFS = [];

/** Wird von main.js nach dem JSON-Load aufgerufen. */
export function setRuneDefs(list) {
  RUNE_DEFS = Array.isArray(list) ? list : [];
}


function elementsHtml(arr) {
  if (!arr || !arr.length) return "";
  return `<div class="elems">${arr
    .map((e) => `<span class="elem ${e}">${e}</span>`)
    .join("")}</div>`;
}

/**
 * Effekt-Vorschau für eine Instanz – OHNE Runen/Element-Vulnerability,
 * damit die Karte einen stabilen „Basiswert“ zeigt.
 */
function effectPreviewFromInst(inst) {
  const v = instView(inst);
  const e = v.effect || {};
  const kind = e.kind;
  if (!kind) return "";

  const val = Math.max(1, Math.floor(scaledValue(inst)));

  if (kind === "damage" || kind === "aoe_damage") {
    return `Schaden: ${val}`;
  }
  if (kind === "dot" || kind === "bleed") {
    return `DoT: ${val}/Tag`;
  }
  if (kind === "freeze_days") {
    return `Einfrieren: ${val}T`;
  }
  if (kind === "slow_move_days") {
    return `Verlangsamung: ${val}T`;
  }
  if (kind === "weaken") {
    return `Schwächung: ${val}%`;
  }
  if (kind === "reduce_maxhp") {
    return `MaxHP -${val}`;
  }
  if (kind === "gain_souls") {
    return `+${val} Seelen`;
  }
  if (kind === "gain_energy") {
    return `+${val} Energie`;
  }

  return "";
}

/** Vorschau für Templates (z.B. Portal / Deck-Übersicht). */
function effectPreviewFromTemplate(t, level = 1) {
  const fakeInst = { tplId: t.id, level };
  return effectPreviewFromInst(fakeInst);
}


const MAX_ELEMENT_RUNES = 3;

let logBox;

// ============================================================================
// Grundlayout aufbauen
// ============================================================================

export function mountUI(app) {
  app.innerHTML = `
    <div id="top-bar">
      <div id="stats"></div>
      <button id="btn-new-run">Neuer Run</button>
      <button id="btn-end-day">Tag beenden</button>
      <button id="btn-demon">👁 Dämon</button>
    </div>

    <div id="main-layout">
      <div id="left-side">
        <div id="map"></div>
        <div id="runes"></div>
        <div id="hand" class="hand"></div>
        <div id="altar" class="altar">Opferaltar</div>
      </div>

      <div id="right-side">
        <div id="log" class="log"></div>
      </div>
    </div>

    <div id="overlay"><div id="overlay-inner"></div></div>
  `;
  logBox = document.querySelector("#log");

  const altar = document.querySelector("#altar");
  if (altar) altar.addEventListener("click", onAltarClick);
}

// ============================================================================
// Logs, Render-Hooks, Toasts
// ============================================================================

export function bindLogs() {
  // Normaler Log
  window.__log = (msg) => log(msg);

  // Karten-Engine ans selbe Log hängen
  bindCardLogger(log);

  // Re-Render, aus anderen Modulen aufrufbar
  window.__render = () => render();

  // Kleine Toasts (z.B. "SIEG", "Niederlage", "Tag 3")
  window.__toast = (html, ms = 1000) => {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = html;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 200);
    }, ms);
  };
}

function log(msg) {
  if (!logBox) return;
  const div = document.createElement("div");
  div.innerHTML = msg;
  // neue Logs OBEN einfügen
  if (logBox.firstChild) {
    logBox.insertBefore(div, logBox.firstChild);
  } else {
    logBox.appendChild(div);
  }
  logBox.scrollTop = 0;
}

// ============================================================================
// Runen-Panel (unter der Map)
// ============================================================================

function renderRunesPanel() {
  const box = document.querySelector("#runes");
  if (!box) return;

  const runes = GameState.runes || {};
  const elems = runes.elements || {};
  const active = Object.entries(elems).filter(([, v]) => v);

  if (!active.length) {
    box.innerHTML = `<div class="panel small muted">Keine Element-Runen aktiv.</div>`;
    return;
  }

  const iconMap = {
    feuer: "🔥",
    blut: "🩸",
    schatten: "🌑",
    eis: "❄️",
    natur: "🌿",
    licht: "✨",
  };

  box.innerHTML = `
    <div class="panel small">
      <div class="row"><b>Aktive Runen</b></div>
      <div class="row" style="flex-wrap:wrap;gap:6px">
        ${active
          .map(
            ([el]) =>
              `<span class="pill">${iconMap[el] || ""} ${el} +20%</span>`
          )
          .join("")}
      </div>
    </div>
  `;
}

// ============================================================================
// Opferaltar
// ============================================================================

function onAltarClick() {
  const s = GameState;
  const hand = s.hand;

  if (!hand.length) {
    window.__log?.(
      "Du hast keine Karten in der Hand, die du opfern könntest."
    );
    return;
  }

  const sac = s.targeting;
  if (!sac) {
    window.__log?.(
      "Wähle zuerst die Karte in deiner Hand, die du opfern willst, und klicke dann auf den Opferaltar."
    );
    return;
  }

  if (hand.length < 2) {
    window.__log?.(
      "Du brauchst mindestens eine weitere Karte in der Hand, die verstärkt werden kann."
    );
    return;
  }

  if (s.energy <= 0) {
    window.__log?.(
      "Du hast nicht genug Energie für ein Opfer (kostet 1 Energie)."
    );
    return;
  }

  const candidates = hand.filter((c) => c.uid !== sac.uid);
  if (!candidates.length) {
    window.__log?.(
      "Keine andere Karte in der Hand zum Verstärken gefunden."
    );
    return;
  }

  const target =
    candidates[Math.floor(Math.random() * candidates.length)];

  // Energie zahlen
  s.energy -= 1;

  const res = sacrifice(sac.uid, target.uid);

  if (res?.ok) {
    s.hand = s.hand.filter((c) => c.uid !== sac.uid);

    const viewSac = instView(sac);
    const viewTarget = instView(target);

    window.__log?.(
      `<span class="soul">Opferung</span>: <b>${viewSac.name}</b> wurde geopfert. ` +
        `<b>${viewTarget.name}</b> steigt auf L${target.level}. ` +
        `(Energie jetzt ${s.energy})`
    );

    s.targeting = null;
    window.__render?.();
  } else {
    window.__log?.("Opferung fehlgeschlagen.");
  }
}

// ============================================================================
// Haupt-Renderfunktion: Stats + Hand
// ============================================================================

export function render() {
  const s = GameState;
  const stats = document.querySelector("#stats");
  if (!stats) return;

  const h = s.hero;
  let heroStatus = "kein Held";
  if (h) {
    const strong = h.strongElement ? `🔺${h.strongElement}` : "";
    const weak = h.weakElement ? `🔻${h.weakElement}` : "";
    const tags = [strong, weak].filter(Boolean).join(" ");
    heroStatus = `<b>${h.name}</b> – HP ${h.hp}/${h.maxHp} – ${
      h.alive !== false ? "Lebt" : "Tot"
    }${tags ? " • " + tags : ""}`;
  }

  stats.innerHTML = `
    <b>Tag ${s.day}</b> |
    <b>Runde ${s.round ?? 1}</b> |
    Energie: ${s.energy}/${BASE_ENERGY} |
    Seelen: ${s.souls} |
    Hand: ${s.hand.length} |
    <span id="stat-deck" class="k" style="cursor:pointer">Deck: ${
      s.deck.length
    }</span> |
    ${heroStatus}
  `;

  const deckEl = document.querySelector("#stat-deck");
  if (deckEl) deckEl.onclick = () => openDeckBrowser();

  // Runen-Panel
  renderRunesPanel();

  // Hand
  const hand = document.querySelector("#hand");
  hand.innerHTML = "";
  s.hand.forEach((inst) => {
    const c = instView(inst);

    const preview = effectPreviewFromInst(inst);

    const div = document.createElement("div");
    div.className = "card";
    div.draggable = true;
    div.innerHTML = `
      <div class="cost">L${inst.level || 1}</div>
      <div class="badge">${c.type}</div>
      <div class="name">${c.name}</div>
      <div class="desc small">${c.desc}</div>
      ${
        preview
          ? `<div class="mini small muted">${preview}</div>`
          : ""
      }
      ${elementsHtml(c.elements || [])}
    `;
    div.onclick = () => {
      if (s.targeting === inst) {
        s.targeting = null;
        log(`Auswahl aufgehoben.`);
      } else {
        s.targeting = inst;
        log(`Karte gewählt: ${c.name} (L${inst.level || 1})`);
      }
      renderMap?.();
    };

    hand.appendChild(div);
  });
}

// ============================================================================
// Overlay-Helfer
// ============================================================================

export function openOverlay() {
  const ov = document.querySelector("#overlay");
  if (!ov) return;
  ov.style.display = "flex";
  ov.classList.add("open");
}

export function closeOverlay() {
  const ov = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  if (ov) {
    ov.style.display = "none";
    ov.classList.remove("open");
  }
  if (inner) inner.innerHTML = "";
}

// ============================================================================
// PORTAL
// ============================================================================

export function showPortalOffer(cards, drawCount = BASE_DRAW) {
  const overlay = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  if (!overlay || !inner) return;

  openOverlay();

  const round = GameState.round ?? 1;
  const level = round;

  const picks = shuffleArray(cards).slice(0, 3);
  inner.innerHTML = `
    <h2>Portal öffnet sich</h2>
    <p>Wähle 1 Karte. Danach wird deine Tageshand gezogen.</p>
    <div id="portal-grid" class="grid"></div>
  `;

  const grid = inner.querySelector("#portal-grid");

  picks.forEach((tpl) => {
    const preview = effectPreviewFromTemplate(tpl, level);
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="cost">L${level}</div>
      <div class="badge">${tpl.type}</div>
      <div class="name">${tpl.name}</div>
      <div class="desc small">${tpl.desc}</div>
      ${
        preview
          ? `<div class="mini small muted">${preview}</div>`
          : ""
      }
      ${elementsHtml(tpl.elements || [])}
    `;

    div.onclick = () => {
      try {
        const inst = newInstance(tpl.id, level);
        GameState.deck.push(inst);
        shuffleInPlace(GameState.deck);
        closeOverlay();

        drawCards(drawCount);

        window.__log?.(
          `<span class="small">Portal: ${tpl.name} (L${level}) ins Deck gelegt, Tageshand gezogen.</span>`
        );
        window.__render?.();
        renderMap?.();
      } catch (e) {
        console.error("Portal-Klick-Fehler:", e);
        window.__log?.(
          `<span class="small soul">Portal-Fehler: ${e.message}</span>`
        );
      }
    };

    grid.appendChild(div);
  });
}

// ============================================================================
// LOBBY / DECK-EDITOR
// ============================================================================

export function showLobby(allCards) {
  const ov = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  openOverlay();

  const selected = new Set();
  let q = "";
  let filterType = "alle";

  const TYPES = [
    "alle",
    "fluch",
    "kontrolle",
    "daemon",
    "ritual",
    "eroberung",
    "spezial",
  ];

  const draw = () => {
    inner.innerHTML = `
      <div class="lobby-wrap">
        <div class="lobby-head">
          <h2>Lobby – Deck auswählen (10 Karten)</h2>
          <div class="lobby-tools">
            <input id="lobby-search" placeholder="Suche..." style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:#1b1626;color:var(--text)" />
            <div id="lobby-types" class="types" style="display:flex;gap:6px"></div>
            <span class="lobby-counter">${selected.size}/10</span>
            <button id="btn-random10">Zufällige 10</button>
            <button id="btn-clear">Leeren</button>
            <button id="btn-start" class="primary" ${
              selected.size !== 10 ? "disabled" : ""
            }>Run starten</button>
            <button id="btn-close" class="warn">Schließen</button>
          </div>
        </div>
        <div class="lobby-grid" id="lobby-grid"></div>
      </div>
    `;

    const typesEl = inner.querySelector("#lobby-types");
    TYPES.forEach((t) => {
      const b = document.createElement("button");
      b.className = "pill" + (filterType === t ? " active" : "");
      b.textContent = t;
      b.onclick = () => {
        filterType = t;
        draw();
      };
      typesEl.appendChild(b);
    });

    const search = inner.querySelector("#lobby-search");
    search.value = q;
    search.oninput = (e) => {
      q = e.target.value.toLowerCase();
      renderGrid();
    };

    inner.querySelector("#btn-random10").onclick = () => {
      selected.clear();
      const shuffled = shuffleArray(allCards);
      for (
        let i = 0;
        i < shuffled.length && selected.size < 10;
        i++
      ) {
        selected.add(shuffled[i].id);
      }
      draw();
    };

    inner.querySelector("#btn-clear").onclick = () => {
      selected.clear();
      draw();
    };

    inner.querySelector("#btn-start").onclick = () => {
      if (selected.size !== 10) return;
      closeOverlay();
      window.__startRun?.(Array.from(selected));
    };

    inner.querySelector("#btn-close").onclick = closeOverlay;

    renderGrid();
  };

  const renderGrid = () => {
    const grid = inner.querySelector("#lobby-grid");
    grid.innerHTML = "";

    const filtered = allCards.filter((c) => {
      const tOk = filterType === "alle" || c.type === filterType;
      const qOk =
        !q ||
        c.name?.toLowerCase().includes(q) ||
        c.desc?.toLowerCase().includes(q) ||
        c.id?.toLowerCase().includes(q);
      return tOk && qOk;
    });

    filtered.forEach((c) => {
      const sel = selected.has(c.id);
      const preview = effectPreviewFromTemplate(c, 1);
      const div = document.createElement("div");
      div.className = "card pick" + (sel ? " selected" : "");
      div.innerHTML = `
        <div class="cost">${c.cost ?? 1}</div>
        <div class="badge">${c.type}</div>
        <div class="name">${c.name}</div>
        <div class="mini">${c.id}</div>
        <div class="desc small">${c.desc}</div>
        ${
          preview
            ? `<div class="mini small muted">${preview}</div>`
            : ""
        }
        ${elementsHtml(c.elements || [])}
      `;
      div.onclick = () => {
        if (sel) {
          selected.delete(c.id);
        } else if (selected.size < 10) {
          selected.add(c.id);
        }
        draw();
      };
      grid.appendChild(div);
    });
  };

  draw();
}

// ============================================================================
// Runen-Shop
// ============================================================================

export function showRuneShop() {
  const ov    = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  if (!ov || !inner) return;

  openOverlay();

  const runeState = GameState.runes || {};
  const elemRunes = runeState.elements || {};
  const souls     = GameState.souls ?? 0;

  const elementRunes = RUNE_DEFS.filter(r => r.type === "element");
  const metaRunes    = RUNE_DEFS.filter(r => r.type === "meta");

  inner.innerHTML = `
    <div class="lobby-wrap">
      <div class="lobby-head">
        <h2>Runen-Shop</h2>
        <div class="lobby-tools">
          <span class="lobby-counter">Seelen: ${souls}</span>
          <button id="btn-close-shop" class="warn">Schließen</button>
        </div>
      </div>
      <div class="lobby-grid" id="rune-grid"></div>
    </div>
  `;

  const grid = inner.querySelector("#rune-grid");

  const equippedCount = Object.values(elemRunes).filter(Boolean).length;
  const maxSlots = runeState.maxElementSlots ?? 3;

  // ---------- Element-Runen ----------
  elementRunes.forEach((r) => {
    const owned = !!elemRunes[r.element];
    const canEquipMore = equippedCount < maxSlots;
    const affordable   = souls >= r.cost;
    const disabled     = owned || !canEquipMore || !affordable;

    const div = document.createElement("div");
    div.className = "card shop-card";
    div.innerHTML = `
      <div class="badge">${r.element || ""}</div>
      <div class="name">${r.name}</div>
      <div class="mini">+${r.apply?.elementDamagePct ?? 20}% Schaden für ${r.element}-Karten</div>
      <div class="desc small">Kosten: ${r.cost} Seelen</div>
      <div class="desc small ${owned ? "k" : "muted"}">
        ${
          owned
            ? "Ausgerüstet"
            : canEquipMore
            ? ""
            : "Max. " + maxSlots + " Element-Runen ausgerüstet"
        }
      </div>
      <button class="primary" ${disabled ? "disabled" : ""}>Kaufen</button>
    `;

    const btn = div.querySelector("button");
    btn.onclick = () => {
      if (disabled) return;
      if (GameState.souls < r.cost) {
        window.__log?.("Nicht genug Seelen.");
        return;
      }

      const elemsLocal =
        GameState.runes.elements ||
        (GameState.runes.elements = {});
      const alreadyEquipped = Object.values(elemsLocal).filter(Boolean).length;

      if (alreadyEquipped >= maxSlots) {
        window.__log?.(
          "Du kannst nur " + maxSlots + " Element-Runen gleichzeitig tragen."
        );
        return;
      }

      GameState.souls -= r.cost;
      elemsLocal[r.element] = true;

      window.__log?.(
        `<span class="k">Rune gekauft</span>: ${r.name} (+${r.apply?.elementDamagePct ?? 20}% ${r.element}-Schaden).`
      );
      render();
      showRuneShop();
    };

    grid.appendChild(div);
  });

  // ---------- Meta-Runen (draw/energy/soul) ----------
  metaRunes.forEach((r) => {
    const div = document.createElement("div");
    div.className = "card shop-card";
    const ownedKey =
      r.apply?.drawPerDay ? "draw" :
      r.apply?.energy     ? "energy" :
      r.apply?.soulOnKill ? "soul" : null;

    const owned = ownedKey ? !!GameState.runes[ownedKey] : false;
    const affordable = souls >= r.cost;
    const disabled = owned || !affordable;

    div.innerHTML = `
      <div class="badge">Meta</div>
      <div class="name">${r.name}</div>
      <div class="desc small">Kosten: ${r.cost} Seelen</div>
      <div class="desc small ${owned ? "k" : "muted"}">
        ${owned ? "Aktiv" : ""}
      </div>
      <button class="primary" ${disabled ? "disabled" : ""}>Kaufen</button>
    `;

    const btn = div.querySelector("button");
    btn.onclick = () => {
      if (disabled) return;
      if (GameState.souls < r.cost) {
        window.__log?.("Nicht genug Seelen.");
        return;
      }

      GameState.souls -= r.cost;

      if (r.apply?.drawPerDay) GameState.runes.draw   = true;
      if (r.apply?.energy)     GameState.runes.energy = true;
      if (r.apply?.soulOnKill) GameState.runes.soul   = true;

      window.__log?.(
        `<span class="k">Rune gekauft</span>: ${r.name}.`
      );
      render();
      showRuneShop();
    };

    grid.appendChild(div);
  });

  const btnClose = inner.querySelector("#btn-close-shop");
  if (btnClose) btnClose.onclick = () => closeOverlay();
}


// ============================================================================
// Deck-Übersicht
// ============================================================================

function openDeckBrowser() {
  const ov = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  if (!ov || !inner) return;

  openOverlay();

  const deckViews = GameState.deck.map((inst) => instView(inst));

  const byId = new Map();
  for (const v of deckViews) {
    const key = v.tplId || v.id;
    if (!byId.has(key)) {
      byId.set(key, { ...v, count: 1 });
    } else {
      byId.get(key).count++;
    }
  }

  inner.innerHTML = `
    <div class="lobby-wrap">
      <div class="lobby-head">
        <h2>Deck-Übersicht (${GameState.deck.length} Karten)</h2>
        <button id="deck-close" class="warn">Schließen</button>
      </div>
      <div class="lobby-grid" id="deck-grid"></div>
    </div>
  `;

  const grid = inner.querySelector("#deck-grid");
  byId.forEach((v) => {
    const preview = effectPreviewFromTemplate(v, v.level || 1);
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="cost">L${v.level || 1}</div>
      <div class="badge">${v.type}</div>
      <div class="name">${v.name}</div>
      <div class="mini">${v.id || v.tplId}</div>
      <div class="desc small">${v.desc || ""}</div>
      ${v.count > 1 ? `<div class="badge">×${v.count}</div>` : ""}
      ${
        preview
          ? `<div class="mini small muted">${preview}</div>`
          : ""
      }
      ${elementsHtml(v.elements || [])}
    `;
    grid.appendChild(div);
  });

  const btnClose = inner.querySelector("#deck-close");
  if (btnClose) btnClose.onclick = () => closeOverlay();
}

// ============================================================================
// Utilities
// ============================================================================

function shuffleArray(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

