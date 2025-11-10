import { GameState } from "./game/core/gameState.js";
import { mountUI, render, bindLogs, showDraft, showPortalOffer } from "./ui/render.js";
import { setCardLibrary, newInstance } from "./game/cards/cards.js"; // <-- newInstance wichtig!
import { createHero } from "./game/hero/hero.js";
import { beginDay, endDay } from "./game/core/turns.js";
import { mountStaticMap, renderMap } from "./game/map/map.js";

// kleines Shuffle für Deck / Tagesende
function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const app = document.querySelector('#app');
mountUI(app);
bindLogs();

// -----------------------------
// Daten laden (Templates/Heroes)
// -----------------------------
async function loadJSON(path, fallback) {
  try { const r = await fetch(path, { cache:"no-store" }); if(!r.ok) throw 0; return await r.json(); }
  catch { return fallback; }
}
const FALLBACK_CARDS = [
  { id:"feuerkugel", name:"Feuerkugel", type:"fluch", elements:["feuer"], cost:1,
    effect:{kind:"damage", scaleType:"linear", base:4, growth:0.45}, desc:"Feuer." },
  { id:"eisiger_griff", name:"Eisiger Griff", type:"kontrolle", elements:["eis"], cost:1,
    effect:{kind:"freeze_days", scaleType:"log", base:1, growth:0.5, cap:3}, desc:"Freeze." },
  { id:"blutung", name:"Blutung", type:"fluch", elements:["blut"], cost:1,
    effect:{kind:"bleed", scaleType:"linear", base:1, growth:0.35}, desc:"Bleed." },
];
const FALLBACK_HEROES = [
  { id:"blutjaeger", name:"Der Blutjäger", maxHp:90, baseSpeed:1, passives:[] }
];

const cards  = await loadJSON("./data/cards.de.json",  FALLBACK_CARDS);  // TEMPLATES
const heroes = await loadJSON("./data/heroes.de.json", FALLBACK_HEROES);

setCardLibrary(cards); // Library einmalig befüllen (Templates -> Engine)

// -----------------------------
// Map montieren
// -----------------------------
mountStaticMap(document.querySelector('#map'));

// -----------------------------
// Buttons
// -----------------------------
document.querySelector('#btn-end-day').onclick = () => {
  endDay();
  showPortalOffer(cards); // zeigt 3 Template-Karten (Portal erzeugt Instanz auf Klick)
  render();
};
document.querySelector('#btn-new-run').onclick  = () => { showDraft(cards); };
document.querySelector('#btn-demon').onclick = () => {
  const html = `<h2>Runen-Shop</h2><div class='small muted'>Platzhalter</div>`;
  document.querySelector('#overlay-inner').innerHTML = html;
  document.querySelector('#overlay').style.display   = 'flex';
};

// -----------------------------
// Run-Start (vom Draft aufgerufen)
// chosenTplIds = Array<string> (Template-IDs)
// -----------------------------
window.__startRun = (chosenTplIds) => {
  // Reset Run-State
  GameState.day    = 1;
  GameState.souls  = 0;
  GameState.hand   = [];
  GameState.discard= [];              // wird nicht genutzt, aber harmlose Reserve
  GameState.placed = new Map();

  // Deck: 10 INSTANZEN aus den gewählten TEMPLATES erzeugen & mischen
  // Mehrfach gleiche Templates sind ABSICHTLICH möglich.
  const instances = chosenTplIds.map(tplId => newInstance(tplId, 1));
  GameState.deck  = shuffle(instances);

  // Held setzen (einmal pro Run)
  GameState.hero = createHero(heroes[0]);

  // Startposition auf der Map (erster Node), falls noch nicht gesetzt
  if (!GameState.heroPos && GameState.map.nodes.length) {
    GameState.heroPos = GameState.map.nodes[0].id;
  }

  // Tag starten: Energie auffüllen + 5 ziehen (aus dem INSTANZ-Deck)
  beginDay();

  // Optional: Portal zu Tagesbeginn
  showPortalOffer(cards);

  // Zeichnen
  render();
  renderMap?.();

  window.__log?.(
    `<b>Run start</b>: Hand=${GameState.hand.length}, Deck=${GameState.deck.length}`
  );
};

// -----------------------------
// Boot: Draft öffnen + erste Render
// -----------------------------
showDraft(cards);
render();
