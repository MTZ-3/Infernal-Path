import { GameState, uid } from "./game/core/gameState.js";
import { mountUI, render, bindLogs, showDraft, showPortalOffer } from "./ui/render.js";
import { setCardLibrary, bindLogger as bindCardLogger } from "./game/cards/cards.js";
import { createHero, bindLogger as bindHeroLogger } from "./game/hero/hero.js";
import { beginDay, endDay } from "./game/core/turns.js";
import { mountStaticMap } from "./game/map/map.js";

const app = document.querySelector('#app');
mountUI(app); bindLogs(); // setzt window.__log / __render

// Bind Module -> UI Logs
bindCardLogger(window.__log);
bindHeroLogger(window.__log);

// Load data robust
let cards=[], heroes=[];
try{
  [cards, heroes] = await Promise.all([
    fetch('./data/cards.de.json').then(r=>r.json()),
    fetch('./data/heroes.de.json').then(r=>r.json()),
  ]);
} catch (e){
  window.__log?.(`<span style="color:#fca5a5">Daten konnten nicht geladen werden: ${e.message}</span>`);
}
setCardLibrary(cards);

// Map
mountStaticMap(document.querySelector('#map'));

// Start Run callback (aus Draft)
window.__startRun = (chosenIds)=>{
  GameState.day=1; GameState.souls=0; GameState.runes={draw:false,energy:false,soul:false};
  GameState.discard=[]; GameState.hand=[];
  GameState.deck = chosenIds.map(id=>({ ...cards.find(c=>c.id===id), uid:uid(), level:1 }));
  GameState.hero = createHero(heroes[0]);
  beginDay(); showPortalOffer(cards); render(); window.__log('Neuer Run beginnt.');
};

// Buttons
document.querySelector('#btn-end-day').onclick = ()=>{ endDay(); showPortalOffer(cards); render(); };
document.querySelector('#btn-new-run').onclick = ()=>{ showDraft(cards); };
document.querySelector('#btn-demon').onclick = ()=>{
  const html = `<h2>Runen-Shop</h2><div class='small muted'>Platzhalter – folgt.</div><div style='margin-top:8px'><button id='close-shop'>Schließen</button></div>`;
  document.querySelector('#overlay-inner').innerHTML=html;
  document.querySelector('#overlay').style.display='flex';
  document.querySelector('#close-shop').onclick=()=>{ document.querySelector('#overlay').style.display='none'; };
};

// Altar (unverändert aus deiner Version)

// Boot
showDraft(cards); render();
