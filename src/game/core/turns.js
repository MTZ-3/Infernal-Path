
import { GameState, BASE_ENERGY, clamp } from "./gameState.js";
import { drawCards, reshuffleIfNeeded } from "../cards/cards.js";
import { triggerNode } from "../cards/cards.js";
import { renderMap } from "../map/map.js";

export function beginDay() {
  // Energie auffüllen
  const extra = GameState.runes?.energy ? 1 : 0;
  GameState.energy = BASE_ENERGY + extra;

  // 5 Karten (+1 falls Rune)
  const drawCount = 5 + (GameState.runes?.draw ? 1 : 0);
  drawCards(drawCount);

  // optionales Debug
  window.__log?.(
    `<span class="small muted">beginDay → Energie=${GameState.energy}, Hand=${GameState.hand.length}, Deck=${GameState.deck.length}</span>`
  );
}

export function endDay(){
  const h = GameState.hero;

  // DoT tick
  let total=0;
  h.dots.forEach(d=>{ total+=d.dmg; d.days--; });
  h.dots = h.dots.filter(d=>d.days>0);
  if(total>0) h.hp = clamp(h.hp - total, 0, h.maxHp);

  // Held bewegt sich 1 Node Richtung Schloss
  if(h.alive!==false) moveHeroOneStep();

  // Hand ablegen
  GameState.discard.push(...GameState.hand); GameState.hand=[];

  // Check Tod
  if(h.hp<=0){
    h.alive=false; const gain=3+(GameState.runes.soul?1:0);
    GameState.souls+=gain; window.__log?.(`<span class='soul'>Held fällt. +${gain} Seelen.</span>`);
  }

  // Schloss erreicht?
  if(h.alive!==false && GameState.heroPos===GameState.map.castleId){
    alert('Niederlage! Der Held erreichte das Schloss.');
    freeze(); return;
  }

  // Tag hochzählen / Run-Ende?
  GameState.day++;
  if(GameState.day>GameState.maxDays){
    alert(h.alive===false?'Sieg!':'Niederlage!'); freeze(); return;
  }

  reshuffleIfNeeded();

}

function moveHeroOneStep(){
  const here = GameState.heroPos;
  const target = GameState.map.castleId;
  if(here===target) return;

  // Nachbarn sammeln
  const neigh = neighborsOf(here);
  if(!neigh.length) return;

  // nimm den Nachbarn, der der Burg am nächsten ist (Luftlinie)
  const C = nodeById(target);
  let best = neigh[0], bestD = dist(nodeById(neigh[0]), C);
  for(let i=1;i<neigh.length;i++){
    const d = dist(nodeById(neigh[i]), C);
    if(d<bestD){ best=neigh[i]; bestD=d; }
  }

  GameState.heroPos = best;
  triggerNode(best);             // ← Feld-Effekte auslösen
  renderMap();                   // Held-Marker verschieben
}

function nodeById(id){ return GameState.map.nodes.find(n=>n.id===id); }
function neighborsOf(id){
  const ids = [];
  GameState.map.links.forEach(l=>{
    if(l.a===id) ids.push(l.b);
    else if(l.b===id) ids.push(l.a);
  });
  return ids;
}
const dist=(A,B)=>Math.hypot(A.x-B.x, A.y-B.y);

function freeze(){ GameState.hand=[]; GameState.deck=[]; GameState.discard=[]; }
