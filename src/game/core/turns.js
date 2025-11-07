import { GameState, BASE_ENERGY, clamp } from "./gameState.js";
import { drawCards, reshuffleIfNeeded } from "../game/cards/cards.js";

export function beginDay(){
  GameState.energy = BASE_ENERGY + (GameState.runes.energy?1:0);
  drawCards(5 + (GameState.runes.draw?1:0));
}

export function endDay(){
  const h = GameState.hero;

  // DoT tick
  let total=0;
  h.dots.forEach(d=>{ total+=d.dmg; d.days--; });
  h.dots = h.dots.filter(d=>d.days>0);
  if(total>0){ h.hp = clamp(h.hp - total, 0, h.maxHp); window.__log?.(`DoT (${total}) tickt.`); }

  // Bewegung (inkl. Raserei)
  let move=h.speed;
  if(h.status?.frozenDays>0){ move=0; h.status.frozenDays--; window.__log?.('Eis hält den Helden fest.'); }
  if(move>0 && h.status?.slowDays>0){ move=Math.max(0,move-1); h.status.slowDays--; window.__log?.('Verlangsamung wirkt: Bewegung -1.'); }
  if(move>0 && h.status?.weakenPct>0){ move = Math.max(0, move - Math.ceil(move*(h.status.weakenPct/100))); }
  if(h.hp <= h.maxHp/2) move*=2;
  h.dist = clamp(h.dist - move, 0, GameState.maxDays);

  // Ablage
  GameState.discard.push(...GameState.hand); GameState.hand=[];

  // Check
  if(h.alive && h.hp<=0){
    h.alive=false;
    const gain=3+(GameState.runes.soul?1:0);
    GameState.souls+=gain; window.__log?.(`<span class='soul'>Held fällt. +${gain} Seelen.</span>`);
  }
  if(h.alive && h.dist<=0){ alert('Niederlage!'); freeze(); return; }

  GameState.day++;
  if(GameState.day>GameState.maxDays){ alert(h.alive?'Niederlage!':'Sieg!'); freeze(); return; }

  reshuffleIfNeeded();
  beginDay();
}
function freeze(){ GameState.hand=[]; GameState.deck=[]; GameState.discard=[]; }
