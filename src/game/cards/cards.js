
import { GameState, clamp, uid } from "../core/gameState.js";

export let CARD_LIBRARY = [];
export function setCardLibrary(cards){ CARD_LIBRARY = cards; }
export function sacrifice(fromCardUid, toCardUid){
  // entferne Opferkarte aus Hand/Deck/Discard
  const removeByUid = (arr, uid)=> {
    const i = arr.findIndex(c=>c.uid===uid);
    if(i>=0) arr.splice(i,1);
  };
  removeByUid(GameState.hand, fromCardUid);
  removeByUid(GameState.deck, fromCardUid);
  removeByUid(GameState.discard, fromCardUid);

  // finde Zielkarte irgendwo und level +1
  const findByUid = (uid)=>(
    GameState.hand.find(c=>c.uid===uid) ||
    GameState.deck.find(c=>c.uid===uid) ||
    GameState.discard.find(c=>c.uid===uid)
  );
  const target = findByUid(toCardUid);
  if (target) {
    target.level = (target.level||1) + 1;
  }
  return { ok: !!target };
}

// --- Logging-Anschluss zur UI ---
let _logCb=null;
export function bindLogger(fn){ _logCb = fn; }
const log = (m)=>_logCb?.(m);

// --- Skalierung (linear/log) pro Level ---
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

// --- Ziehen/Reshuffle (für "draw_now" etc.) ---
export function drawCards(n){
  let drawn = 0;
  for(let i=0; i<n; i++){
    if (GameState.hand.length >= 7) break;        // Handlimit
    if (GameState.deck.length === 0) {
      reshuffleIfNeeded();
      if (GameState.deck.length === 0) break;     // nichts mehr da
    }
    const card = GameState.deck.pop();            // vom Ende ziehen (Stack)
    if (!card.uid) card.uid = uid();              // Safety: UID vergeben
    GameState.hand.push(card);
    drawn++;
  }
  window.__log?.(`<span class="small muted">gezogen: ${drawn}</span>`);
}
export function reshuffleIfNeeded(){
  if(GameState.deck.length===0 && GameState.discard.length>0){
    GameState.deck = shuffle(GameState.discard); GameState.discard=[];
    log(`Ablagestapel wird gemischt.`);
  }
}
const shuffle=a=>{a=[...a]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a;};

// ======================================================
// Karte spielen —
// 1) ohne targetNodeId = Sofort-Effekt (Damage/DoT/etc.)
// 2) mit  targetNodeId = Karte wird AUF DEM FELD platziert
// ======================================================
export function playCard(card, targetNodeId=null){
  const cost = card.cost ?? 0;
  if(GameState.energy < cost) return { ok:false, log:`Nicht genug Energie` };
  GameState.energy -= cost;

  if(targetNodeId){
    placeOnNode(card, targetNodeId);                               // ← legt „Falle/Zone“ aufs Feld
    GameState.discard.push(card);
    GameState.hand = GameState.hand.filter(c=>c.uid!==card.uid);   // aus Hand entfernen
    return { ok:true, log:`${card.name} wurde auf Feld platziert.` };
  }

  // --- Sofort-Effekte: wirken direkt auf den Helden ---
  const h = GameState.hero;
  const val = Math.max(0, Math.floor(scaledValue(card)));
  const k = card.effect?.kind;

  if(k==='damage' || k==='aoe_damage'){
    h.hp = clamp(h.hp - val, 0, h.maxHp);
    log(`${card.name} trifft für ${val}.`);
  } else if(k==='dot' || k==='bleed'){
    h.dots.push({ dmg: Math.max(1,val), days:3 });
    log(`${card.name} DoT ${Math.max(1,val)} für 3T.`);
  } else if(k==='freeze_days'){
    const d = Math.max(1, Math.round(scaledValue(card)));
    h.status.frozenDays=(h.status.frozenDays||0)+d;
    log(`${card.name}: Eingefroren ${d}T.`);
  } else if(k==='slow_move_days'){
    const d = Math.max(1, Math.round(scaledValue(card)));
    h.status.slowDays=(h.status.slowDays||0)+d;
    log(`${card.name}: Verlangsamung ${d}T.`);
  } else if(k==='weaken'){
    const d = Math.max(1, Math.round(scaledValue(card)));
    h.status.weakenPct = clamp((h.status.weakenPct||0)+d, 0, 90);
    log(`${card.name}: Schwächung +${d}%.`);
  } else if(k==='reduce_maxhp'){
    const d = Math.max(1, Math.round(scaledValue(card)));
    h.maxHp=Math.max(1,h.maxHp-d); h.hp=Math.min(h.hp,h.maxHp);
    log(`${card.name}: MaxHP -${d}.`);
  } else if(k==='gain_energy'){
    GameState.energy += Math.max(1, Math.round(scaledValue(card)));
    log(`${card.name}: Energie +${Math.max(1, Math.round(scaledValue(card)))}.`);
  } else if(k==='gain_souls'){
    GameState.souls += Math.max(1, Math.round(scaledValue(card)));
    log(`${card.name}: Seelen +${Math.max(1, Math.round(scaledValue(card)))}.`);
  } else if(k==='draw_now'){
    drawCards(Math.max(1, Math.round(scaledValue(card))));
  } else {
    log(`${card.name} gespielt (Platzhalter-Effekt).`);
  }

  // in Ablage verschieben
  GameState.discard.push(card);
  GameState.hand = GameState.hand.filter(c=>c.uid!==card.uid);
  return { ok:true };
}

// Karte auf Feld legen (als „Falle/Zone“)
function placeOnNode(card, nodeId){
  const list = GameState.placed.get(nodeId) || [];
  list.push({
    uid: uid(),
    id: card.id,
    name: card.name,
    once: true,              // einfache Falle: einmalig auslösen und verschwinden
    cardRef: { ...card },    // Snapshot (Level, Effekte etc.)
    createdDay: GameState.day
  });
  GameState.placed.set(nodeId, list);
  log(`Platziert: ${card.name} @ Node`);
}

// Beim Betreten eines Feldes auslösen
export function triggerNode(nodeId){
  const entries = GameState.placed.get(nodeId);
  if(!entries || !entries.length) return;

  const h = GameState.hero;
  let keep = [];

  entries.forEach(p=>{
    const c = p.cardRef;
    const e = c.effect?.kind;
    const val = Math.max(1, Math.floor(scaledValue(c)));

    if(e==="damage" || e==="aoe_damage"){
      h.hp = clamp(h.hp - val, 0, h.maxHp);
      log(`<b>Falle</b> ${c.name} trifft für ${val}.`);
    } else if(e==="dot" || e==="bleed"){
      h.dots.push({ dmg: val, days:3 });
      log(`<b>Zone</b> ${c.name} – DoT ${val} für 3T.`);
    } else if(e==="freeze_days" || e==="slow_move_days"){
      const d = Math.max(1, Math.round(scaledValue(c)));
      if(e==="freeze_days") h.status.frozenDays = (h.status.frozenDays||0) + d;
      else h.status.slowDays = (h.status.slowDays||0) + d;
      log(`<b>Kontrolle</b> ${c.name} – ${d}T.`);
    } else {
      // Fallback: wie Sofortkarte behandeln (ohne Kosten)
      const energyBackup = GameState.energy;
      GameState.energy = 999;
      playCard({ ...c, cost:0 }, null);
      GameState.energy = energyBackup;
    }

    if(!p.once){ keep.push(p); }
  });

  if(keep.length) GameState.placed.set(nodeId, keep);
  else GameState.placed.delete(nodeId);
}
