import { GameState, clamp } from "../../core/gameState.js";

export let CARD_LIBRARY = [];
export function setCardLibrary(cards){ CARD_LIBRARY = cards; }

// --- logging glue
let _logCb=null;
export function bindLogger(fn){ _logCb = fn; }
function log(msg){ if(_logCb) _logCb(msg); }

export function scaledValue(card){
  const lvl = card.level || 1;
  const e = card.effect || {base:0,growth:0,scaleType:'linear'};
  if(e.scaleType==='log'){
    const cap = e.cap ?? Infinity;
    const val = e.base + Math.log1p(Math.max(0,lvl-1))*e.growth;
    return Math.min(val, cap);
  }
  return e.base + (lvl-1)*e.growth; // linear
}

// --- damage glue (Hero registriert Callback)
let _takeDamageCb=null;
export function bindTakeDamage(fn){ _takeDamageCb = fn; }
function takeDamage(amount, source){ if(_takeDamageCb) _takeDamageCb(amount, source); }

export function playCard(card, targetNodeId=null){
  if(GameState.energy < card.cost) return {ok:false, log:`Nicht genug Energie`};
  GameState.energy -= card.cost;

  const h = GameState.hero;
  const val = scaledValue(card);
  const isCurse = card.type==='fluch';
  const dmgMod = 1 + (isCurse? GameState.mods.cursePct/100 : 0) + (GameState.mods.tempDamagePct/100);

  const finish = ()=>{
    GameState.discard.push(card);
    GameState.hand = GameState.hand.filter(c=>c.uid!==card.uid);
  };

  const k = card.effect.kind;
  if(k==='damage' || k==='aoe_damage'){
    const dmg = Math.floor(val*dmgMod); takeDamage(dmg, card.name); finish(); return {ok:true, log:`${card.name} trifft für ${dmg}.`};
  }
  if(k==='dot' || k==='bleed'){
    const days=3; h.dots.push({dmg:Math.floor(val*dmgMod), days}); finish(); return {ok:true, log:`${card.name} DoT ${Math.floor(val*dmgMod)} für ${days}T.`};
  }
  if(k==='freeze_days'){ const d=Math.max(1,Math.round(val)); h.status.frozenDays=(h.status.frozenDays||0)+d; finish(); return {ok:true, log:`${card.name}: Eingefroren ${d}T.`}; }
  if(k==='slow_move_days'){ const d=Math.max(1,Math.round(val)); h.status.slowDays=(h.status.slowDays||0)+d; finish(); return {ok:true, log:`${card.name}: Bewegung -1 für ${d}T.`}; }
  if(k==='reduce_maxhp'){ const d=Math.max(1,Math.round(val)); h.maxHp=Math.max(1,h.maxHp-d); h.hp=Math.min(h.hp,h.maxHp); finish(); return {ok:true, log:`${card.name}: MaxHP -${d}.`}; }
  if(k==='weaken'){ const d=Math.max(1,Math.round(val)); h.status.weakenPct=clamp((h.status.weakenPct||0)+d,0,90); finish(); return {ok:true, log:`${card.name}: Schwächung +${d}%.`}; }
  if(k==='gain_energy'){ const d=Math.max(1,Math.round(val)); GameState.energy+=d; finish(); return {ok:true, log:`${card.name}: +${d} Energie.`}; }
  if(k==='gain_souls'){ const d=Math.max(1,Math.round(val)); GameState.souls+=d; finish(); return {ok:true, log:`${card.name}: +${d} Seelen.`}; }
  if(k==='draw_now'){ const d=Math.max(1,Math.round(val)); drawCards(d); finish(); return {ok:true, log:`${card.name}: Ziehe ${d}.`}; }
  if(k==='extend_run_days'){ const d=Math.max(1,Math.round(val)); GameState.extendDays(d); finish(); return {ok:true, log:`${card.name}: +${d} Tage.`}; }
  if(k==='buff_fluch_pct' || k==='buff_all_fluch_pct'){ const d=Math.round(val); GameState.mods.cursePct += d; finish(); return {ok:true, log:`${card.name}: Fluch-Schaden +${d}%.`}; }
  if(k==='percent_current_hp'){ const dmg = Math.floor(h.hp*(val/100)*dmgMod); takeDamage(dmg, card.name); finish(); return {ok:true, log:`${card.name}: ${dmg} (%-Schaden).`}; }

  // Platzhalter für Map-/Eroberungs-/Beschwörung:
  finish(); return {ok:true, log:`${card.name} wurde auf Feld ${targetNodeId??'?'} platziert.`};
}

export function drawCards(n){
  for(let i=0;i<n;i++){
    if(GameState.hand.length>=7) break;
    if(GameState.deck.length===0){ reshuffleIfNeeded(); if(GameState.deck.length===0) break; }
    GameState.hand.push(GameState.deck.pop());
  }
}
export function reshuffleIfNeeded(){
  if(GameState.deck.length===0 && GameState.discard.length>0){
    GameState.deck = shuffle(GameState.discard); GameState.discard=[];
    log(`Ablagestapel wird gemischt.`);
  }
}
const shuffle=a=>{a=[...a]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a;};

export function sacrifice(card){
  GameState.hand = GameState.hand.filter(c=>c.uid!==card.uid);
  log(`Opferung: ${card.name} wird dem Altar dargebracht.`);
  const all=[...GameState.hand,...GameState.deck,...GameState.discard];
  const cand = all.filter(c=>c.id!==card.id);
  if(cand.length===0){ log('Keine Karte zum Aufwerten gefunden.'); return; }
  const t = cand[Math.floor(Math.random()*cand.length)];
  t.level=(t.level||1)+1; if(t.level%2===0) t.cost=Math.max(0,(t.cost||1)-1);
  log(`→ ${t.name} steigt auf Level ${t.level}.`);
}
