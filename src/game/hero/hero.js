import { GameState, clamp } from "../core/gameState.js";
import {  } from "../cards/cards.js";

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
  
  return h;
}

// (DoT/Movement passieren im Turn-System)
