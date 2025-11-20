// src/ui/render.js
// ============================================================================
// UI für "Infernal Path"
// - Layout: Topbar, Map links, Hand unten, Log rechts
// - Logs & Toasts
// - Hand-Rendering (INSTANZEN, nicht Templates!)
// - Lobby (Deck-Auswahl 10 Karten)
// - Portal (jeden Tag 3 Karten → 1 wählen → ins Deck, mischen, ziehen)
// ============================================================================

import { GameState, BASE_ENERGY, BASE_DRAW } from "../game/core/gameState.js";
import { playCard, instView, newInstance, drawCards, sacrifice} from "../game/cards/cards.js";
import { renderMap } from "../game/map/map.js";

// Kleine Helper: Element-Badges für Karten
function elementsHtml(arr) {
  if (!arr || !arr.length) return "";
  return `<div class="elems">${arr
    .map((e) => `<span class="elem ${e}">${e}</span>`)
    .join("")}</div>`;
}

let logBox;

// Platzierungs-Typ basierend auf der TEMPLATE-View
// Rückgabe: "hero" | "special" | "road"
function placementForView(v) {
  const type = v.type;
  const kind = v.effect?.kind || "";

  if (type === "eroberung") {
    if (kind.includes("village") || kind.startsWith("dungeon_")) {
      return "special";
    }
    return "road";
  }
  return "hero";
}


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
}

// ============================================================================
// Logs, Render-Hooks, Toasts
// ============================================================================
export function bindLogs() {
  // Normaler Log
  window.__log = (msg) => log(msg);

  // Re-Render, aus anderen Modulen aufrufbar
  window.__render = () => render();

  // Kleine Toasts (z.B. "SIEG", "Niederlage", "Tag 3")
  window.__toast = (html, ms = 1000) => {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = html;
    document.body.appendChild(t);
    // kleiner Fade-In
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
  logBox.appendChild(div);
  logBox.scrollTop = logBox.scrollHeight;
}

// ============================================================================
// Haupt-Renderfunktion: Stats + Hand (INSTANZEN!)
// ============================================================================
export function render() {
  const s = GameState;
  const stats = document.querySelector("#stats");
  if (!stats) return;

  const h = s.hero;
  const heroStatus = h
    ? `<b>${h.name}</b> – HP ${h.hp}/${h.maxHp} – ${
        h.alive !== false ? "Lebt" : "Tot"
      }`
    : "kein Held";

  stats.innerHTML = `
    <b>Tag ${s.day}</b> |
    <b>Runde ${s.round ?? 1}</b> |
    Energie: ${s.energy}/${BASE_ENERGY} |
    Seelen: ${s.souls} |
    Hand: ${s.hand.length} |
    Deck: ${s.deck.length} |
    ${heroStatus}
 `;

  // Hand zeichnen (INSTANZEN → instView)
  const hand = document.querySelector("#hand");
  hand.innerHTML = "";
  s.hand.forEach((inst) => {
    const c = instView(inst); // { name, type, desc, elements, cost, ... }

    const div = document.createElement("div");
    div.className = "card";
    div.draggable = true;
    div.innerHTML = `
        <div class="cost">L${inst.level || 1}</div>
        <div class="badge">${c.type}</div>
        <div class="name">${c.name}</div>
        <div class="desc small">${c.desc}</div>
        ${elementsHtml(c.elements || [])}
      `;
    div.onclick = () => {
    if (s.targeting === inst) {
      // Nochmal draufklicken = abwählen
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
// Overlay-Helfer (Lobby, Portal, Shop nutzen das gleiche Overlay)
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
// PORTAL: Jeden Tag 3 Karten, 1 wählen → Instanz ins Deck → mischen → ziehen
// ============================================================================
// Wird von main.js via window.__portalDaily(drawCount) aufgerufen.
export function showPortalOffer(cards, drawCount = BASE_DRAW) {
  const overlay = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  if (!overlay || !inner) return;

  openOverlay();

  const round = GameState.round ?? 1;
  const level = round;

  const picks = shuffleArray(cards).slice(0, 3); // Template-Vorlagen
  inner.innerHTML = `
    <h2>Portal öffnet sich</h2>
    <p>Wähle 1 Karte. Danach wird deine Tageshand gezogen.</p>
    <div id="portal-grid" class="grid"></div>
  `;

  const grid = inner.querySelector("#portal-grid");

  picks.forEach((tpl) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="cost">L${level}</div>
      <div class="badge">${tpl.type}</div>
      <div class="name">${tpl.name}</div>
      <div class="desc small">${tpl.desc}</div>
      ${elementsHtml(tpl.elements || [])}
    `;

    div.onclick = () => {
      try {
        // 1) Instanz aus Template erzeugen (perfekt integriert mit deinem Card-System)
        const inst = newInstance(tpl.id, level);

        // 2) Ins Deck legen
        GameState.deck.push(inst);

        // 3) Deck mischen
        shuffleInPlace(GameState.deck);

        // 4) Overlay schließen
        closeOverlay();

        // 5) Tageshand ziehen
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
// - Spieler wählt exakt 10 Karten (nach card.id, also Templates)
// - "Zufällige 10", "Leeren", Filter nach Typ, Suche
// - "Run starten" → window.__startRun(selectedIds)
// ============================================================================
export function showLobby(allCards) {
  const ov = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  openOverlay();

  // Lokaler State
  const selected = new Set(); // genau 10 card.id
  let q = ""; // Suche
  let filterType = "alle";

  const TYPES = ["alle", "fluch", "kontrolle", "daemon", "ritual", "eroberung", "spezial"];

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

    // Typ-Filter-Pills
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

    // Suche
    const search = inner.querySelector("#lobby-search");
    search.value = q;
    search.oninput = (e) => {
      q = e.target.value.toLowerCase();
      renderGrid();
    };

    // Buttons
    inner.querySelector("#btn-random10").onclick = () => {
      selected.clear();
      const shuffled = shuffleArray(allCards);
      for (let i = 0; i < shuffled.length && selected.size < 10; i++) {
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
      window.__startRun?.(Array.from(selected)); // → main.js
    };

    inner.querySelector("#btn-close").onclick = closeOverlay;

    // Karten-Grid rendern
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
      const div = document.createElement("div");
      div.className = "card pick" + (sel ? " selected" : "");
      div.innerHTML = `
        <div class="cost">${c.cost ?? 1}</div>
        <div class="badge">${c.type}</div>
        <div class="name">${c.name}</div>
        <div class="mini">${c.id}</div>
        <div class="desc small">${c.desc}</div>
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
// Lokale Utility-Funktionen
// ============================================================================
function shuffleArray(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// In-Place-Shuffle, z.B. fürs Deck
function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
