// /src/game/core/gameState.js
import { buildMap } from '../map/map.js';
import { createHero } from '../hero/hero.js';
import { t } from '../../i18n.js';
import { CARD_DEFS, allCardIds, shuffle, scaledValue } from '../cards/cards.js';

export const state = {
  mode: 'select', day: 1, maxDay: 10,
  powerLevel: 1,                 // Karten-Level (steigt nur durch Opfer)
  energy: 0, maxEnergy: 3, souls: 0,
  map: [], hero: null, heroPos: 0,
  shop: { open: true, runes: {} }, runes: {},
  cardPool: [], selection: [], selectionTarget: 10,
  drawPile: [], hand: [], discard: [],
  effects: { bleed: 0, vulnStacks: 0 },
  draftOpen: false, draftOptions: [],
  runOver: false,                // verhindert doppelte End-Events
  placeIntent: null              // { id, def } wenn wir eine Karte platzieren wollen
};

export function initPools(){ state.cardPool = allCardIds(); }

export function enterSelection(){
  state.mode = 'select';
  Object.assign(state, {
    day: 1, powerLevel: 1, energy: 0, souls: 0,
    draftOpen: false, draftOptions: [], runOver: false,
    selection: [], drawPile: [], hand: [], discard: [],
    effects: { bleed: 0, vulnStacks: 0 }
  });
}

export function toggleSelectCard(id){
  const i = state.selection.indexOf(id);
  if (i >= 0) state.selection.splice(i,1);
  else if (state.selection.length < state.selectionTarget) state.selection.push(id);
}
export function canStartRun(){ return state.selection.length === state.selectionTarget; }

export function newRunFromSelection(){
  state.mode = 'run';
  state.day = 1;
  state.runOver = false;
  state.powerLevel = 1; // Level kommt NUR über Opfer
  state.energy = state.maxEnergy + (state.runes.rune_energy || 0);
  state.souls = 0;
  state.map = buildMap();
  state.hero = createHero();
  state.heroPos = 0;
  state.effects = { bleed: 0, vulnStacks: 0 };
  state.shop.open = true; state.runes = {};
  state.drawPile = shuffle(state.selection.slice());
  state.hand = []; state.discard = [];
  drawCards(5);
}

export function tryAttack(){
  if (state.mode!=='run' || state.runOver) return;
  if (state.energy <= 0) return;
  state.energy -= 1;
  applyDamage(2 + (state.runes.rune_damage||0));
}

export function playCard(id){
  if (state.mode!=='run' || state.runOver) return;
  const idx = state.hand.indexOf(id); if (idx===-1) return;
  const def = CARD_DEFS[id]; if (!def) return;
  const cost = def.cost || 0;
  if (state.energy < cost) return;

  // Für Platzier-Karten: zuerst in den Platzier-Modus wechseln
  const placeable = (def.type==='daemon' || def.type==='eroberung');
  if (placeable){
    state.energy -= cost;
    state.placeIntent = { id, def };
    // Karte vorerst aus der Hand nehmen; in placeCardOnTile wird sie abgelegt
    state.hand.splice(idx,1);
    return;
  }

  // Normale (nicht platzierende) Karten
  state.energy -= cost;
  applyCardImmediate(def);
  // Ablage
  state.discard.push(id);
  state.hand.splice(idx,1);
}

function applyCardImmediate(def){
  const L = currentCardLevel();
  const eff = def.effect || {};
  const val = scaledValue(eff, L);

  switch(eff.kind){
    case 'damage': case 'damage_multi':
      applyDamage(Math.round(val)); break;
    case 'dot': case 'bleed':
      state.effects.bleed += Math.round(val); break;
    case 'weaken': // Verwundbarkeit als +10%/Stack
      state.effects.vulnStacks = Math.min(99, (state.effects.vulnStacks||0) + Math.round(val)); break;
    case 'gain_souls':
      state.souls += Math.round(val); break;
    case 'gain_energy':
      state.energy += Math.round(val); break;

    // Opfer-Mechaniken → erhöhen das Karten-Level!
    case 'sacrifice_burst':
    case 'sacrifice_rune_boost_pct':
    case 'sacrifice_gain_curses':
      // Wir tun den eigentlichen Effekt:
      if (eff.kind==='sacrifice_burst') applyDamage(Math.round(val));
      // Level-Aufstieg durch Opfer:
      state.powerLevel += 1;               // <<< NUR hier steigt das Level
      break;

    // Platzierbare Effekte werden über placeIntent + placeCardOnTile abgewickelt
    default: break;
  }
}

// Karte an eine Map-Kachel binden (für Dämon/Eroberung)
export function placeCardOnTile(tileIndex){
  if (!state.placeIntent) return;
  const { id, def } = state.placeIntent;
  const tile = state.map[tileIndex]; if (!tile) return;

  // Minimale Ablage von Effekten auf dem Feld:
  tile.effects = tile.effects || [];
  tile.effects.push({ cardId: id, name: def.name, kind: def.effect?.kind, level: currentCardLevel() });

  // Sofort-Effekte bei Platzierung (einige Eroberungen):
  if (def.effect?.kind === 'dungeon_quake_damage' && tile.type==='DUNGEON') {
    applyDamage(Math.round(scaledValue(def.effect, currentCardLevel())));
  }
  if (def.effect?.kind === 'altar_souls_per_day' && tile.type!=='ALTAR'){
    tile.passive = { soulsPerDay: Math.round(scaledValue(def.effect, currentCardLevel())), daysLeft: 10 };
  }

  // Karte als gespielt betrachten
  state.discard.push(id);
  state.placeIntent = null;
}

export function cancelPlaceIntent(){ state.placeIntent = null; }

export function nextDay(){
  if (state.mode!=='run' || state.runOver) return;

  // 1) Draft öffnen und HIER abbrechen, damit das Overlay sofort sichtbar ist
  if (openDailyDraft(3)) return;

  // 2) Tages-Ticks
  if (state.effects.bleed > 0){
    state.hero.hp -= state.effects.bleed;
    if (state.hero.hp <= 0){ killHero(); return; }
  }
  if (state.effects.vulnStacks > 0) state.effects.vulnStacks -= 1;

  // Passive Felder ticken (z. B. Mini-Altäre)
  state.map.forEach(t => {
    if (t?.passive?.soulsPerDay){
      state.souls += t.passive.soulsPerDay;
      if (t.passive.daysLeft>0){ t.passive.daysLeft -= 1; if (t.passive.daysLeft===0) delete t.passive; }
    }
  });

  // 3) Nächster Tag (aber KEIN powerLevel-Auto-Boost!)
  state.day += 1;

  // 4) Energie neu
  state.energy = state.maxEnergy + (state.runes.rune_energy || 0);

  // 5) Hand abwerfen
  state.discard.push(...state.hand); state.hand = [];

  // 6) Held bewegt sich (Beispiel)
  if (state.day >= 4) moveHero();

  // 7) Altar erreicht?
  const atAltar = state.map[state.heroPos]?.type === 'ALTAR';
  if (atAltar){ endRunGameOver(); return; }

  // 8) Neue Hand
  drawCards(5);
}

// Draft: gibt true zurück, wenn es gerade geöffnet wurde
export function openDailyDraft(n=3){
  if (state.draftOpen || state.mode!=='run') return false;
  const ids = shuffle(state.cardPool.slice());
  state.draftOptions = ids.slice(0, n);
  state.draftOpen = true;
  return true;
}

export function chooseDraftCard(id){
  if (!state.draftOpen) return;
  if (!state.draftOptions.includes(id)) return;
  state.discard.push(id);        // Karte kommt ins Deck (über Ablage)
  state.draftOpen = false;
  state.draftOptions = [];
}

export function drawCards(n=1){
  for (let i=0;i<n;i++){
    if (state.drawPile.length===0){
      if (state.discard.length===0) break;
      state.drawPile = shuffle(state.discard.splice(0));
    }
    const id = state.drawPile.pop();
    if (id) state.hand.push(id);
  }
}

function applyDamage(n){
  const mul = 1 + 0.10 * (state.effects.vulnStacks || 0);
  const real = Math.max(0, Math.round(n * mul));
  state.hero.hp -= real;
  if (state.hero.hp <= 0){ killHero(); return; }
}

function moveHero(){
  const tile = state.map[state.heroPos];
  if (tile?.type==='VILLAGE' && !tile.spent){
    tile.spent = true;
    state.hero.hp = state.hero.maxHp;
    return;
  }
  state.heroPos = Math.min(state.heroPos + 1, state.map.length - 1);
}

export function killHero(){
  if (state.runOver) return;            // Guard gegen Doppel-Calls
  state.runOver = true;
  const gained = soulsBySpeed(state.day);
  state.souls += gained;
  alert(t('hero.slain', { souls: gained }) || `Held gefallen (+${gained} Seelen)`);
  enterSelection();                      // zurück zur Kartenwahl
}

function endRunGameOver(){
  if (state.runOver) return;
  state.runOver = true;
  alert(t('game.over') || 'Game Over');
  enterSelection();
}

function soulsBySpeed(day){
  const base = 10, bonus = Math.max(0, 11 - day);
  return base + bonus;
}

export function currentCardLevel(){ return state.powerLevel || 1; }
