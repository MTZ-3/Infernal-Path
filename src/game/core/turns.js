import { GameState, BASE_ENERGY } from "./gameState.js";
import { drawCards, reshuffleIfNeeded } from "../game/cards/cards.js";


export function beginDay(){ GameState.energy = BASE_ENERGY + (GameState.runes.energy?1:0); drawCards(5 + (GameState.runes.draw?1:0)); }


export function endDay(){
const h = GameState.hero;
// DoT tick
let total=0; h.dots.forEach(d=>{ total+=d.dmg; d.days--; }); h.dots=h.dots.filter(d=>d.days>0); if(total>0) window.__log(`DoT (${total}) tickt.`), h.hp=Math.max(0, h.hp-total);
// Trap slow
let move=h.speed; if(GameState.trapArmed){ move=Math.max(0,move-1); GameState.trapArmed=false; window.__log('Falle wirkt: Bewegung -1.'); }
if(h.hp<=h.maxHp/2) move*=2; h.dist=Math.max(0,h.dist-move);
GameState.discard.push(...GameState.hand); GameState.hand=[];
if(h.alive && h.hp<=0){ h.alive=false; const gain=3+(GameState.runes.soul?1:0); GameState.souls+=gain; window.__log(`<span class='soul'>Held fällt. +${gain} Seelen.</span>`); }
if(h.alive && h.dist<=0){ alert('Niederlage!'); freeze(); return; }
GameState.day++; if(GameState.day>GameState.maxDays){ alert(h.alive?'Niederlage!':'Sieg!'); freeze(); return; }
reshuffleIfNeeded(); beginDay();
}


function freeze(){ GameState.hand=[]; GameState.deck=[]; GameState.discard=[]; }