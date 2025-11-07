import { GameState, clamp } from "../core/gameState.js";
import { bindTakeDamage } from "../game/cards/cards.js";


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
if(!h.alive) return; const prev=h.hp; h.hp = clamp(h.hp-Math.max(0,Math.floor(amount)),0,h.maxHp);
const real=prev-h.hp; log(`<span class='k'>${source}</span> verursacht ${real} Schaden.`);
if(h.hp<=0){ h.alive=false; }
});
return h;
}


export function heroDoTurn(){
const h=GameState.hero; if(!h||!h.alive) return;
// DoT
let total=0; h.dots.forEach(d=>{ total+=d.dmg; d.days--; }); h.dots=h.dots.filter(d=>d.days>0); if(total>0) bindTakeDamage()(total,'DoT');
}


export function endOfDayMove(){
const h=GameState.hero; if(!h||!h.alive) return;
let move=h.speed;
if(h.status.frozenDays>0){ move=0; h.status.frozenDays--; log('Eis hält den Helden fest.'); }
if(move>0 && h.status.slowDays>0){ move=Math.max(0,move-1); h.status.slowDays--; log('Verlangsamung wirkt: Bewegung -1.'); }
if(move>0 && h.status.weakenPct>0){ move = Math.max(0, move - Math.ceil(move*(h.status.weakenPct/100))); }
if(h.hp <= h.maxHp/2) move*=2; // Raserei
h.dist = clamp(h.dist - move, 0, GameState.maxDays);
}


let _logCb=null; export function bindLogger(fn){ _logCb=fn; } function log(m){ if(_logCb) _logCb(m); }