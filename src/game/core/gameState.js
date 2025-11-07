export const BASE_ENERGY = 3;
export const HAND_LIMIT = 7;
export const BASE_DRAW = 5;
export let RUN_DAYS = 10; // kann per Karte verlängert werden


export const GameState = {
day: 1,
energy: BASE_ENERGY,
souls: 0,
drawPerDay: BASE_DRAW,
hero: null,
deck: [],
discard: [],
hand: [],
runes: { draw:false, energy:false, soul:false },
trapArmed:false,
targeting:null,
mods: { cursePct:0, tempDamagePct:0 },
get maxDays(){ return RUN_DAYS; },
extendDays(n){ RUN_DAYS += n; if(this.hero) this.hero.dist += n; }
};


export const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export const uid=()=>Math.random().toString(36).slice(2,9);
export const rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;