import { GameState, clamp } from "../core/gameState.js";
import { bindTakeDamage } from "../game/cards/cards.js";

let _logCb=null; export function bindLogger(fn){ _logCb=fn; }
function log(m){ if(_logCb) _logCb(m); }

export function createHero(blueprint){
  const h = {
    name: blueprint.name,
    maxHp: blueprint.maxHp,
    hp: blueprint.maxHp,
    dist: GameState.maxDays,
    dots: [],
    speed: blueprint.baseSpeed||1,
    alive: true,
    status: { frozenDays:0, slowDays:0, weakenPct:0 },
  };
  bindTakeDamage((amount, source)=>{
    if(!h.alive) return;
    const prev=h.hp; h.hp = clamp(h.hp - Math.max(0,Math.floor(amount)),0,h.maxHp);
    const real=prev-h.hp; log(`<span class='k'>${source}</span> verursacht ${real} Schaden.`);
    if(h.hp<=0){ h.alive=false; }
  });
  return h;
}

// (DoT/Movement passieren im Turn-System)
