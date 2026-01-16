// src/main.js
import { GameState } from "./game/core/gameState.js";
import { mountUI, render, bindLogs, showPortalOffer, showLobby, showShop } from "./ui/render.js";
import { setCardLibrary, newInstance, validateCardLibrary,revealTraits } from "./game/cards/cards.js";
import { createHero } from "./game/hero/hero.js";
import { beginDay, endDay } from "./game/core/turns.js";
import { mountStaticMap, renderMap, regenerateMap } from "./game/map/map.js";
import { setEffectLibrary, bindEffectLogger } from "./game/effects/effects.js";

// kleines Shuffle für Deck etc.
function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const app = document.querySelector("#app");
mountUI(app);
bindLogs();

window.__revealTraits = (n) => revealTraits(n);

// -----------------------------
// Daten laden (Templates/Heroes)
// -----------------------------
async function loadJSON(path, fallback) {
  try {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw 0;
    return await r.json();
  } catch {
    return fallback;
  }
}

const effects = await loadJSON("./data/effects.de.json", []);
setEffectLibrary(effects);

// Logger an UI hängen
bindEffectLogger(window.__log);


const FALLBACK_HEROES = [
  { id: "blutjaeger", name: "Der Blutjäger", maxHp: 90, baseSpeed: 1, passives: [] },
];

// === Async Boot ===
const cards  = await loadJSON("./data/cards.de.json",);
const heroes = await loadJSON("./data/heroes.de.json", FALLBACK_HEROES);


// Kartenbibliothek setzen
setCardLibrary(cards);

// Map montieren (Start-Layout, wird später von regenerateMap überschrieben)
mountStaticMap(document.querySelector("#map"));

// ---------------------------------------------------------------------------
// Portal-Hook: wird in beginDay(drawCount) (turns.js) benutzt
// ---------------------------------------------------------------------------
window.__portalDaily = (drawCount) => {
  // Zeigt 3 Karten, lässt eine wählen, legt sie ins Deck, mischt und zieht dann
  showPortalOffer(cards, drawCount);
};

// ---------------------------------------------------------------------------
// Helden-Spawn: aus heroes.de.json, skaliert pro Runde
// ---------------------------------------------------------------------------
window.__spawnHero = (round = 1) => {
  const idx  = Math.min(round - 1, heroes.length - 1);
  const base = heroes[idx];

  const factor = 1 + 0.15 * (round - 1); // 15% mehr maxHp pro Runde
  const scaled = {
    ...base,
    maxHp: Math.round(base.maxHp * factor),
  };

  GameState.hero = createHero(scaled);

  // Startknoten: layer 0 bevorzugt, sonst erster Node
  const startNode =
    GameState.map?.nodes?.find((n) => n.layer === 0)?.id ??
    GameState.map?.nodes?.[0]?.id;

  if (startNode) {
    GameState.heroPos = startNode;
  }

  GameState.campDays = 3; // ersten 3 Tage bleibt der Held am Start

  renderMap?.();
  window.__render?.();
};

// -----------------------------
// Buttons
// -----------------------------
document.querySelector("#btn-new-run").onclick = () => {
  // Lobby zeigt Kartenauswahl und ruft später __startRun(chosenIds)
  showLobby(cards);
};

document.querySelector("#btn-end-day").onclick = () => {
  console.log("[UI] btn-end-day clicked");
  try {
    endDay();
  } catch (e) {
    console.error("[endDay crash]", e);
  }
  try {
    render();
    renderMap?.();
  } catch (e) {
    console.error("[render crash]", e);
  }
};

document.querySelector("#btn-demon").onclick = () => {
  showShop();
};


// ---------------------------------------------------------------------------
// Run-Start: wird von Lobby aufgerufen (chosenTplIds = Array<string> card.id)
// ---------------------------------------------------------------------------
window.__startRun = (chosenTplIds) => {
  // 1) Run-State sauber resetten
  GameState.round    = 1;
  GameState.day      = 1;
  GameState.maxDays  = GameState.maxDays || 50;
  GameState.energy   = 0;
  GameState.souls    = 0;

  GameState.hand     = [];
  GameState.discard  = [];
  GameState.placed   = new Map();

  // 2) Deck aus TEMPLATES bauen → echte Instanzen mit UIDs
  const instances = chosenTplIds.map((tplId) => newInstance(tplId, 1));
  GameState.deck  = shuffle(instances);

  // 3) Map für Runde 1 erzeugen
  try {
    regenerateMap(1);
  } catch (e) {
    console.error("regenerateMap(1) fail", e);
    // Fallback: alte Map behalten
  }

  // 4) Held für Runde 1 spawnen
  window.__spawnHero(1);

  // 5) Tag 1 starten → beginDay ruft __portalDaily(drawCount) → Portal+Draw
  beginDay();

  // 6) UI zeichnen + Log
  render();
  renderMap?.();

  window.__log?.(
    `<b>Run start</b>: Tag ${GameState.day} • Hand=${GameState.hand.length}, Deck=${GameState.deck.length}`
  );
};

// -----------------------------
// Boot: Lobby beim Start öffnen
// -----------------------------
showLobby(cards);
render();



const items = await loadJSON("./data/items.de.json", []);
window.__ITEMS = items;

window.__giveHeroRandomItem = () => {
  const h = GameState.hero;
  const list = window.__ITEMS || [];
  if (!h || !list.length) return;

  const it = list[Math.floor(Math.random() * list.length)];
  h.items = h.items || [];
  h.items.push(it.id);

  window.__log?.(`<span class="small k">🎒 Item</span>: Held erhält <b>${it.name}</b>.`);
};
