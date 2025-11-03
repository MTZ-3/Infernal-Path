export let CARD_DEFS = {};


export async function loadCardDefs(){
  try {
    const res = await fetch('data/cards.de.json'); // relativ zur Seite
    if (!res.ok) throw new Error(`cards.de.json HTTP ${res.status}`);
    const arr = await res.json();
    CARD_DEFS = Object.fromEntries(arr.map(c => [c.id, c]));
    console.log('[cards] loaded', Object.keys(CARD_DEFS).length);
  } catch (e) {
    console.error('[cards] load error:', e);
    // kleine Notfallanzeige, damit du was siehst
    CARD_DEFS = {};
  }
}


export function allCardIds(){
return Object.keys(CARD_DEFS);
}


export function shuffle(a){
for (let i=a.length-1;i>0;i--){
const j = Math.floor(Math.random()*(i+1));
[a[i],a[j]] = [a[j],a[i]];
}
return a;
}


// Skaliert einen Effekt-Wert anhand base/growth/scaleType
export function scaledValue(effect, level){
const L = Math.max(1, Math.floor(level||1));
const base = effect.base ?? 0;
const growth = effect.growth ?? 0;
const cap = effect.cap ?? Infinity;
const t = effect.scaleType || 'linear';
let val = base;
if (t === 'linear') val = base + growth * (L-1);
else if (t === 'log') val = base + growth * Math.log(L);
else if (t === 'hybrid') val = base + growth * Math.sqrt(L);
return Math.min(val, cap);
}