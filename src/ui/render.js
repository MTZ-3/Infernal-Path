import { GameState, BASE_ENERGY } from "../game/core/gameState.js";
import { drawCards, sacrifice } from "../game/cards/cards.js";
import { playCard  } from "../game/cards/cards.js";

function elementsHtml(arr){
  if(!arr || !arr.length) return "";
  return `<div class="elems">${arr.map(e=>`<span class="elem ${e}">${e}</span>`).join("")}</div>`;
}

let logBox;

// ----------------------------------------------------
// ========== UI Setup ==========
// ----------------------------------------------------
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
export function bindLogs() {
  window.__log = (msg) => log(msg);
  window.__render = () => render();
}

function log(msg) {
  if (!logBox) return;
  const div = document.createElement("div");
  div.innerHTML = msg;
  logBox.appendChild(div);
  logBox.scrollTop = logBox.scrollHeight;
}

export function render() {
  const s = GameState;
  const stats = document.querySelector("#stats");
  if (!stats) return;

  const h = s.hero;
  const heroStatus = h
    ? `<b>${h.name}</b> – HP ${h.hp}/${h.maxHp} – Distanz: ${h.dist} – ${h.alive ? "Lebt" : "Tot"}`
    : "kein Held";

  stats.innerHTML = `
    <b>Tag ${s.day}</b> |
    Energie: ${s.energy}/${BASE_ENERGY} |
    Seelen: ${s.souls} |
    ${heroStatus}
  `;

  const hand = document.querySelector("#hand");
  hand.innerHTML = "";
  s.hand.forEach((card) => {
    const div = document.createElement("div");
    div.className = "card";
    div.draggable = true;
    div.innerHTML = `
      <div class="cost">${card.cost ?? 1}</div>
      <div class="badge">${card.type}</div>
      <div class="name">${card.name}</div>
      <div class="desc small">${card.desc}</div>
      ${elementsHtml(card.elements || [])}
    `;
    div.onclick = () => { s.targeting = card; log(`Karte gewählt: ${card.name}`); };
    hand.appendChild(div);
  });
}

// ----------------------------------------------------
// ========== Overlays (Draft / Portal) ==========
// ----------------------------------------------------
export function showDraft(cards) {
  const overlay = document.querySelector("#overlay");
  const inner   = document.querySelector("#overlay-inner");

  // Vollbild / Blackout aktivieren
  document.body.classList.add("draft-active");
  overlay.classList.add("fullscreen");
  inner.classList.add("fullscreen");
  document.documentElement.style.overflow = "";
  overlay.style.display = "flex";

  const chosen = new Set();

  const draw = () => {
    inner.innerHTML = `
    <div class="draft-wrap">
      <div class="draft-head">
        <h2>Kartenauswahl</h2>
        <div class="small muted">Wähle 10 Karten • <strong>${chosen.size}/10</strong></div>
      </div>
      <div id="draft-grid" class="draft-grid"></div>  <!-- <=== WICHTIG -->
      <div class="draft-actions">
        <button id="draft-cancel">Abbrechen</button>
        <button id="draft-done" class="primary" ${chosen.size!==10 ? "disabled" : ""}>Run starten</button>
      </div>
    </div>
    `;
    const grid = inner.querySelector("#draft-grid");
    cards.forEach(c => {
      const card = document.createElement("div");
      card.className = "card draft" + (chosen.has(c.id) ? " selected" : "");
      card.innerHTML = `
        <div class="cost">${c.cost ?? 1}</div>
        <div class="badge">${c.type}</div>
        <div class="name">${c.name}</div>
        <div class="desc small">${c.desc}</div>`
        + elementsHtml(c.elements || []);
      card.onclick = () => {
        if (chosen.has(c.id)) chosen.delete(c.id);
        else if (chosen.size < 10) chosen.add(c.id);
        draw(); // re-render Counter & Selection
      };
      grid.appendChild(card);
    });

    inner.querySelector("#draft-cancel").onclick = closeOverlayFullscreen;
    inner.querySelector("#draft-done").onclick = () => {
      if (chosen.size !== 10) return;
      closeOverlayFullscreen();
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
  // falls du woanders mal overflow gesperrt hast:
  document.documentElement.style.overflow = "";
}



export function showPortalOffer(cards) {
  const overlay = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  overlay.style.display = "flex";

  const picks = shuffle(cards).slice(0, 3);
  inner.innerHTML = `
    <h2>Portal öffnet sich</h2>
    <p>Wähle 1 Karte.</p>
    <div id="portal-grid" class="grid"></div>
  `;
  const grid = inner.querySelector("#portal-grid");
  picks.forEach((c) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<b>${c.name}</b><br>${c.desc}`;
    div.onclick = () => {
      GameState.hand.push({ ...c, uid: Math.random().toString(36).slice(2) });
      overlay.style.display = "none";
      window.__log(`Portal: ${c.name} gewählt.`);
      window.__render();
    };
    grid.appendChild(div);
  });
}

// ----------------------------------------------------
// Hilfsfunktionen
// ----------------------------------------------------
function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}


