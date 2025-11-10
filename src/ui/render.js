// ============================================================================
// UI: Layout, Logs, Hand-Rendering, Draft & Portal
// Dieses UI arbeitet mit dem INSTANZ-Modell (Deck/Hand enthalten Instanzen).
// Templates (Name, Kosten, Elemente, Effekt) kommen aus der Card-Library.
// ============================================================================

import { GameState, BASE_ENERGY } from "../game/core/gameState.js";
import { playCard, instView, newInstance } from "../game/cards/cards.js";

// Kleine Helper: Element-Badges
function elementsHtml(arr){
  if(!arr || !arr.length) return "";
  return `<div class="elems">${arr.map(e=>`<span class="elem ${e}">${e}</span>`).join("")}</div>`;
}

let logBox;

// ----------------------------------------------------
// ========== UI Setup ==========
// ----------------------------------------------------
// Baut die Grundstruktur (Topbar, zweispaltiges Layout, Overlay).
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

// ----------------------------------------------------
// ========== Log- & Renderfunktionen ==========
// ----------------------------------------------------
// Bindet globale Log/Render-Funktionen an window (für andere Module).
export function bindLogs() {
  window.__log = (msg) => log(msg);
  window.__render = () => render();
  // Nicht-blockierende Kurzmeldung (~1s)
  window.__toast = (html, ms = 1000) => {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = html;
    document.body.appendChild(t);
    // kleines Fade-in
    requestAnimationFrame(() => t.classList.add("show"));
    // Auto-hide
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

// Zeichnet Stats + Hand.
// WICHTIG: Hand enthält INSTANZEN → für Anzeige nutzen wir instView(inst)
export function render() {
  const s = GameState;
  const stats = document.querySelector("#stats");
  if (!stats) return;

  const h = s.hero;
  const heroStatus = h
    ? `<b>${h.name}</b> – HP ${h.hp}/${h.maxHp} – ${h.alive !== false ? "Lebt" : "Tot"}`
    : "kein Held";

  stats.innerHTML = `
    <b>Tag ${s.day}</b> |
    <b>Runde ${s.round}</b> |
    Energie: ${s.energy}/${BASE_ENERGY} |
    Seelen: ${s.souls} |
    Hand: ${s.hand.length} |
    Deck: ${s.deck.length} |
    ${heroStatus}
  `;

  // Hand neu zeichnen (Instanzen!)
  const hand = document.querySelector("#hand");
  hand.innerHTML = "";
  s.hand.forEach((inst) => {
    const c = instView(inst); // {name, type, desc, elements, cost, level, ...}
    const div = document.createElement("div");
    div.className = "card";
    div.draggable = true;
    div.innerHTML = `
      <div class="cost">${c.cost ?? 1}</div>
      <div class="badge">${c.type}</div>
      <div class="name">${c.name} <span class="small muted">· L${inst.level||1}</span></div>
      <div class="desc small">${c.desc}</div>
      ${elementsHtml(c.elements || [])}
    `;
    // Beim Klicken: diese INSTANZ als Target setzen
    div.onclick = () => {
      s.targeting = inst;
      log(`Karte gewählt: ${c.name} (L${inst.level||1})`);
    };
    hand.appendChild(div);
  });
}

// ----------------------------------------------------
// ========== Overlays (Draft / Portal) ==========
// ----------------------------------------------------
// Draft: Zeigt Vorlagen (Templates). Beim Bestätigen ruft main.js -> __startRun(chosenTplIds)
export function showDraft(cards) {
  const overlay = document.querySelector("#overlay");
  const inner   = document.querySelector("#overlay-inner");

  // Vollbild / Blackout aktivieren
  document.body.classList.add("draft-active");
  overlay.classList.add("fullscreen");
  inner.classList.add("fullscreen");
  document.documentElement.style.overflow = "";
  overlay.style.display = "flex";

  const chosen = new Set(); // enthält TEMPLATE-IDs

  const draw = () => {
    inner.innerHTML = `
    <div class="draft-wrap">
      <div class="draft-head">
        <h2>Kartenauswahl</h2>
        <div class="small muted">Wähle 10 Karten • <strong>${chosen.size}/10</strong></div>
      </div>
      <div id="draft-grid" class="draft-grid"></div>
      <div class="draft-actions">
        <button id="draft-cancel">Abbrechen</button>
        <button id="draft-done" class="primary" ${chosen.size!==10 ? "disabled" : ""}>Run starten</button>
      </div>
    </div>
    `;
    const grid = inner.querySelector("#draft-grid");

    // Kartenliste sind VORLAGEN (Templates), NICHT Instanzen
    cards.forEach(tpl => {
      const card = document.createElement("div");
      card.className = "card draft" + (chosen.has(tpl.id) ? " selected" : "");
      card.innerHTML = `
        <div class="cost">${tpl.cost ?? 1}</div>
        <div class="badge">${tpl.type}</div>
        <div class="name">${tpl.name}</div>
        <div class="desc small">${tpl.desc}</div>
        ${elementsHtml(tpl.elements || [])}
      `;
      card.onclick = () => {
        if (chosen.has(tpl.id)) chosen.delete(tpl.id);
        else if (chosen.size < 10) chosen.add(tpl.id);
        draw(); // Re-Render Counter & Selection
      };
      grid.appendChild(card);
    });

    inner.querySelector("#draft-cancel").onclick = closeOverlayFullscreen;
    inner.querySelector("#draft-done").onclick = () => {
      if (chosen.size !== 10) return;
      closeOverlayFullscreen();
      // WICHTIG: Wir übergeben TEMPLATE-IDs. __startRun baut daraus Instanzen.
      window.__startRun(Array.from(chosen));
    };
  };

  draw();
}

// Overlay sauber schließen
function closeOverlayFullscreen() {
  const overlay = document.querySelector("#overlay");
  const inner   = document.querySelector("#overlay-inner");
  overlay.style.display = "none";
  overlay.classList.remove("fullscreen");
  inner.classList.remove("fullscreen");
  document.documentElement.style.overflow = "";
}

// Portal: 3 Vorlagen zur Wahl; Auswahl wird als INSTANZ ins DECK gelegt
// Level = aktuelle Runde (ab Runde 2 → Level 2, etc.)
export function showPortalOffer(cards) {
  const overlay = document.querySelector("#overlay");
  const inner   = document.querySelector("#overlay-inner");

  // UI vorbereiten
  inner.classList.remove("fullscreen");
  overlay.classList.remove("fullscreen");
  overlay.style.display = "flex";

  const picks = shuffle(cards).slice(0, 3); // 3 zufällige TEMPLATES
  inner.innerHTML = `
    <h2>Portal öffnet sich</h2>
    <p>Wähle 1 Karte (Level ${Math.max(1, GameState.round || 1)}).</p>
    <div id="portal-grid" class="grid"></div>
    <div style="margin-top:10px; display:flex; justify-content:flex-end">
      <button id="portal-cancel">Schließen</button>
    </div>
  `;

  const grid = inner.querySelector("#portal-grid");
  const lvl  = Math.max(1, GameState.round || 1); // ← Regel: Level = Runde

  picks.forEach((tpl) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="cost">${tpl.cost ?? 1}</div>
      <div class="badge">${tpl.type}</div>
      <div class="name">${tpl.name} <span class="small muted">· L${lvl}</span></div>
      <div class="desc small">${tpl.desc}</div>
      ${elementsHtml(tpl.elements || [])}
    `;
    div.onclick = () => {
      // Instanz bauen mit gewünschtem Level
      const inst = newInstance(tpl.id, lvl);

      // Design-Entscheidung: INS DECK legen, leicht mischen, und 1 Karte nachziehen
      GameState.deck.push(inst);
      // leichtes Shuffle (lokal, ohne extra Import)
      for (let i = GameState.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [GameState.deck[i], GameState.deck[j]] = [GameState.deck[j], GameState.deck[i]];
      }

      // optional: sofort eine Karte ziehen (fühlt sich „rewarding“ an)
      // Achtung: drawCards ist in cards.js – falls du hier ziehen willst, importiere es oben.
      // import { drawCards } from "../game/cards/cards.js";
      // drawCards(1);

      overlay.style.display = "none";
      window.__log?.(`Portal: ${tpl.name} (L${lvl}) erhalten.`);
      window.__render?.();
    };
    grid.appendChild(div);
  });

  // Schließen-Button & Klick auf Overlay-Hintergrund
  inner.querySelector("#portal-cancel").onclick = () => (overlay.style.display = "none");
  overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = "none"; };
}


// ----------------------------------------------------
// Hilfsfunktionen (nur für UI)
// ----------------------------------------------------
function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
