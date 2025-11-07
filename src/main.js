import { GameState, uid } from "./core/gameState.js";
import { mountUI, render, bindLogs, showDraft, showPortalOffer, closeOverlay } from "./ui/render.js";
import { CARD_LIBRARY, setCardLibrary } from "./game/cards/cards.js";
import { createHero } from "./hero/hero.js";
import { beginDay, endDay } from "./core/turns.js";
import { mountStaticMap } from "./map/map.js";


// Boot
const app = document.querySelector('#app');
mountUI(app); bindLogs();


// Load data
const [cards, heroes] = await Promise.all([
fetch('./data/cards.de.json').then(r=>r.json()),
fetch('./data/heroes.de.json').then(r=>r.json()),
]);
setCardLibrary(cards);


// Map mount
mountStaticMap(document.querySelector('#map'));


// Exposed helpers for overlays
window.__startRun = (chosenIds)=>{
GameState.day=1; GameState.souls=0; GameState.runes={draw:false,energy:false,soul:false};
GameState.discard=[]; GameState.hand=[]; GameState.deck = chosenIds.map(id=>({ ...cards.find(c=>c.id===id), uid:uid(), level:1 }));
GameState.hero = createHero(heroes[0]);
beginDay(); showPortalOffer(cards); render(); window.__log('Neuer Run beginnt.');
};


// Wire buttons
document.querySelector('#btn-end-day').onclick = ()=>{ endDay(); showPortalOffer(cards); render(); };
document.querySelector('#btn-new-run').onclick = ()=>{ showDraft(cards); };
document.querySelector('#btn-demon').onclick = ()=>{ const shopHtml = `<h2>Runen-Shop</h2><div class='small muted'>Platzhalter – Logik wie zuvor.</div><div style='margin-top:8px'><button id='close-shop'>Schließen</button></div>`; document.querySelector('#overlay-inner').innerHTML=shopHtml; document.querySelector('#overlay').style.display='flex'; document.querySelector('#close-shop').onclick=()=>{ document.querySelector('#overlay').style.display='none'; }; };


// Altar
const altar=document.querySelector('#altar');
altar.addEventListener('dragover',ev=>{ ev.preventDefault(); altar.style.background='#201a2a'; });
altar.addEventListener('dragleave',()=>{ altar.style.background=''; });
altar.addEventListener('drop',ev=>{ ev.preventDefault(); altar.style.background=''; const uid=ev.dataTransfer.getData('text/plain'); const card=GameState.hand.find(c=>c.uid===uid); if(card){ import('./game/cards/cards.js').then(m=>{ m.sacrifice(card); render(); }); }});
altar.addEventListener('click',()=>{ if(GameState.targeting){ import('./game/cards/cards.js').then(m=>{ m.sacrifice(GameState.targeting); GameState.targeting=null; render(); }); }});


// Start: Draft anzeigen
showDraft(cards); render();