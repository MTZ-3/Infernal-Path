
import { GameState, uid } from "./game/core/gameState.js";
import { mountUI, render, bindLogs, showDraft, showPortalOffer } from "./ui/render.js";
import { setCardLibrary } from "./game/cards/cards.js";
import { createHero } from "./game/hero/hero.js";
import { beginDay, endDay } from "./game/core/turns.js";
import { mountStaticMap, renderMap } from "./game/map/map.js";

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

// Daten laden (Fallbacks, falls data/ leer)
async function loadJSON(path, fallback) {
  try { const r = await fetch(path, {cache:"no-store"}); if(!r.ok) throw 0; return await r.json(); }
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

const cards  = await loadJSON("./data/cards.de.json",  FALLBACK_CARDS);
const heroes = await loadJSON("./data/heroes.de.json", FALLBACK_HEROES);
setCardLibrary(cards);

// Map montieren
mountStaticMap(document.querySelector('#map'));

// Buttons
document.querySelector('#btn-end-day').onclick = ()=>{ endDay(); showPortalOffer(cards); render(); };
document.querySelector('#btn-new-run').onclick  = ()=>{ showDraft(cards); };
document.querySelector('#btn-demon').onclick = ()=>{
  const html = `<h2>Runen-Shop</h2><div class='small muted'>Platzhalter</div>`;
  document.querySelector('#overlay-inner').innerHTML=html;
  document.querySelector('#overlay').style.display='flex';
};

// Run-Start (vom Draft aufgerufen)
window.__startRun = (chosenIds)=>{
  // Reset
  GameState.day = 1;
  GameState.souls = 0;
  GameState.discard = [];
  GameState.hand = [];
  GameState.placed = new Map();

  // Deck aus Auswahl bauen (+uid, +level) und mischen
  GameState.deck = shuffle(
    chosenIds.map(id => {
      const base = cards.find(c => c.id === id);
      return { ...base, uid: uid(), level: 1 };
    })
  );

  // Held (falls noch nicht)
  GameState.hero = createHero(heroes[0]);
  if(!GameState.heroPos && GameState.map.nodes.length) {
    GameState.heroPos = GameState.map.nodes[0].id;
  }

  // Tag starten -> Energie + ziehen
  beginDay();

  // (Optional) Portal direkt am Tagesanfang
  showPortalOffer(cards);

  // Render + kurze Bestätigung
  render();
  renderMap?.();
  window.__log?.(`<b>Run start</b>: Hand=${GameState.hand.length}, Deck=${GameState.deck.length}`);
};

// Boot: Draft öffnen + erste Render
showDraft(cards); render();
