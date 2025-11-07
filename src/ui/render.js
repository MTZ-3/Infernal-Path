import { GameState, BASE_ENERGY } from "../game/core/gameState.js";
import { drawCards, sacrifice } from "../game/cards/cards.js";
import { playCard } from "../game/cards/cards.js";

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
    <div id="map"></div>
    <div id="runes"></div>
    <div id="hand" class="hand"></div>
    <div id="altar" class="altar">Opferaltar</div>
    <div id="log" class="log"></div>
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
    div.innerHTML = `<b>${card.name}</b><br>${card.desc}`;
    div.onclick = () => {
      s.targeting = card;
      log(`Karte gewählt: ${card.name}`);
    };
    hand.appendChild(div);
  });
}

// ----------------------------------------------------
// ========== Overlays (Draft / Portal) ==========
// ----------------------------------------------------
export function showDraft(cards) {
  const overlay = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  overlay.style.display = "flex";

  let chosen = [];
  inner.innerHTML = `
    <h2>Kartenauswahl</h2>
    <p>Wähle 10 Karten für deinen Run.</p>
    <div id="draft-grid" class="grid"></div>
    <button id="draft-done" disabled>Starten</button>
  `;
  const grid = inner.querySelector("#draft-grid");

  cards.forEach((c) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<b>${c.name}</b><br>${c.desc}`;
    div.onclick = () => {
      if (chosen.includes(c.id)) {
        chosen = chosen.filter((x) => x !== c.id);
        div.style.outline = "";
      } else if (chosen.length < 10) {
        chosen.push(c.id);
        div.style.outline = "2px solid red";
      }
      inner.querySelector("#draft-done").disabled = chosen.length !== 10;
    };
    grid.appendChild(div);
  });

  inner.querySelector("#draft-done").onclick = () => {
    overlay.style.display = "none";
    window.__startRun(chosen);
  };
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
