// /src/game/core/gameState.js
// ------------------------------------------------------
// Infernal Path – zentraler Spielzustand & Logik
// - Kartenwahl (10 Karten) in großem Grid (UI in render.js)
// - Run-Flow (Deck/Hand/Ablage, Tageswechsel)
// - Tages-Draft (3 Optionen → 1 Karte wählen) – öffnet sofort
// - Effekte: Blutung (DoT), Verwundbarkeit (+10% Schaden/Stack)
// - Karten-Level steigt NUR durch Opfer-Effekte (nicht mit Tag)
// - Platzierbare Karten (Dämon/Eroberung) → auf Map-Felder legen
// - Held-Kill: Seelen geben + neuer Held spawnt (Run geht weiter)
// ------------------------------------------------------

import { buildMap } from '../map/map.js';
import { createHero } from '../hero/hero.js';
import { t } from '../../i18n.js';
import { CARD_DEFS, allCardIds, shuffle, scaledValue } from '../cards/cards.js';

export const state = {
  // Flow
  mode: 'select',             // 'select' | 'run'
  day: 1,
  maxDay: 10,
  runOver: false,

  // Karten-Level (steigt nur über Opfer)
  powerLevel: 1,

  // Ressourcen
  energy: 0,
  maxEnergy: 3,
  souls: 0,

  // Welt & Held
  map: [],
  hero: null,
  heroPos: 0,

  // Runen/Shop (Platzhalter)
  shop: { open: true, runes: {} },
  runes: {},

  // Karten-Pool & Auswahl (Pre-Run)
  cardPool: [],
  selection: [],
  selectionTarget: 10,

  // Deck
  drawPile: [],
  hand: [],
  discard: [],

  // Heldeneffekte
  effects: {
    bleed: 0,        // fester Schaden/Tag
    vulnStacks: 0    // +10% Schaden je Stack; -1/Tag
  },

  // Tages-Draft
  draftOpen: false,
  draftOptions: [],

  // Platzier-Modus (für Dämon/Eroberung)
  placeIntent: null // { id, def }
};

// ---------- Init ----------
export function initPools(){ state.cardPool = allCardIds(); }

export function enterSelection(){
  state.mode = 'select';
  Object.assign(state, {
    day: 1,
    runOver: false,
    powerLevel: 1,
    energy: 0,
    souls: 0,
    draftOpen: false,
    draftOptions: [],
    selection: [],
    drawPile: [],
    hand: [],
    discard: [],
    effects: { bleed: 0, vulnStacks: 0 },
    placeIntent: null
  });
}

export function toggleSelectCard(id){
  const i = state.selection.indexOf(id);
  if (i >= 0) state.selection.splice(i,1);
  else if (state.selection.length < state.selectionTarget) state.selection.push(id);
}
export function canStartRun(){ return state.selection.length === state.selectionTarget; }

// ---------- Run ----------
export function newRunFromSelection(){
  state.mode = 'run';
  state.day = 1;
  state.runOver = false;
  state.powerLevel = 1; // Level kommt nur über Opfer
  state.energy = state.maxEnergy + (state.runes.rune_energy || 0);
  state.souls = 0;

  state.map = buildMap();
  state.hero = createHero();
  state.heroPos = 0;

  state.effects = { bleed: 0, vulnStacks: 0 };
  state.shop.open = true;
  state.runes = {};

  state.drawPile = shuffle(state.selection.slice());
  state.hand = [];
  state.discard = [];

  drawCards(5);
}

// ---------- Aktionen ----------
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

  // Platzierbare Karten: Dämon/Eroberung → Platziermodus
  const placeable = (def.type==='daemon' || def.type==='eroberung');
  if (placeable){
    state.energy -= cost;
    state.placeIntent = { id, def };
    state.hand.splice(idx,1); // vorläufig aus Hand raus
    return;
  }

  // Sofort-Effekte
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
    case 'damage':
    case 'damage_multi':
      applyDamage(Math.round(val));
      break;

    case 'dot':
    case 'bleed':
      state.effects.bleed += Math.round(val);
      break;

    case 'weaken': // Verwundbarkeit (mehr Schaden erleidet der Held)
      state.effects.vulnStacks = Math.min(99, (state.effects.vulnStacks||0) + Math.round(val));
      break;

    case 'gain_souls':
      state.souls += Math.round(val);
      break;

    case 'gain_energy':
      state.energy += Math.round(val);
      break;

    // Opfer-Mechaniken: Level steigt NUR hier
    case 'sacrifice_burst':
      applyDamage(Math.round(val));
      state.powerLevel += 1;
      break;

    case 'sacrifice_rune_boost_pct':
    case 'sacrifice_gain_curses':
      // TODO: gewünschte Logik ergänzen
      state.powerLevel += 1;
      break;

    default:
      // noch nicht implementierte Spezialeffekte: no-op
      break;
  }
}

// ---------- Platzieren auf Map ----------
export function placeCardOnTile(tileIndex){
  if (!state.placeIntent) return;
  const { id, def } = state.placeIntent;
  const tile = state.map[tileIndex]; 
  if (!tile) return;
  if (tile.type === 'ALTAR') return; // nur Altar sperren

  // Tile-Effekte ablegen (für Anzeige/Passives)
  tile.effects = tile.effects || [];
  tile.effects.push({ cardId: id, name: def.name, kind: def.effect?.kind, level: currentCardLevel() });

  // Beispiel: Sofort-/Passiveffekte bei Platzierung
  if (def.effect?.kind === 'dungeon_quake_damage' && tile.type==='DUNGEON') {
    applyDamage(Math.round(scaledValue(def.effect, currentCardLevel())));
  }
  if (def.effect?.kind === 'altar_souls_per_day' && tile.type!=='ALTAR'){
    tile.passive = { soulsPerDay: Math.round(scaledValue(def.effect, currentCardLevel())), daysLeft: 10 };
  }

  // Karte ist gespielt
  state.discard.push(id);
  state.placeIntent = null;
}
export function cancelPlaceIntent(){ state.placeIntent = null; }

// ---------- Tageswechsel ----------
export function nextDay(){
  if (state.mode!=='run' || state.runOver) return;

  // 1) Tages-Draft öffnen und SOFORT zurück, damit Overlay direkt angezeigt wird
  if (openDailyDraft(3)) return;

  // 2) Tägliche Effekte
  if (state.effects.bleed > 0){
    state.hero.hp -= state.effects.bleed;
    if (state.hero.hp <= 0){ killHero(); return; }
  }
  if (state.effects.vulnStacks > 0) state.effects.vulnStacks -= 1;

  // Passives auf Tiles
  state.map.forEach(t => {
    if (t?.passive?.soulsPerDay){
      state.souls += t.passive.soulsPerDay;
      if (t.passive.daysLeft>0){ t.passive.daysLeft -= 1; if (t.passive.daysLeft===0) delete t.passive; }
    }
  });

  // 3) Tag +1 (Karten-Level NICHT automatisch erhöhen!)
  state.day += 1;

  // 4) Energie neu
  state.energy = state.maxEnergy + (state.runes.rune_energy || 0);

  // 5) Hand abwerfen
  state.discard.push(...state.hand);
  state.hand = [];

  // 6) Heldenbewegung
  if (state.day >= 4) moveHero();

  // 7) Altar erreicht?
  const atAltar = state.map[state.heroPos]?.type === 'ALTAR';
  if (atAltar){ endRunGameOver(); return; }

  // 8) Neue Hand
  drawCards(5);
}

// ---------- Draft ----------
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

  // Gewählte Karte kommt ins Deck (Ablage → wird gemischt wenn drawPile leer)
  state.discard.push(id);

  // Draft schließen
  state.draftOpen = false;
  state.draftOptions = [];
}

// ---------- Helpers ----------
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

  // Beispiel: Dorf heilt einmalig
  if (tile?.type==='VILLAGE' && !tile.spent){
    tile.spent = true;
    state.hero.hp = state.hero.maxHp;
    return;
  }
  state.heroPos = Math.min(state.heroPos + 1, state.map.length - 1);
}

export function killHero(){
  if (state.runOver) return; // nur 1x
  const gained = soulsBySpeed(state.day);
  state.souls += gained;
  alert(t('hero.slain', { souls: gained }) || `Held gefallen (+${gained} Seelen)`);

  // Run GEHT WEITER → neuer Held spawnt
  spawnNewHero();
}

function spawnNewHero(){
  state.hero = createHero();
  state.heroPos = 0;
  // Effekte resetten, da sie den toten Held betreffen
  state.effects.bleed = 0;
  state.effects.vulnStacks = 0;
  // Hand neu mischen/ziehen
  state.discard.push(...state.hand);
  state.hand = [];
  drawCards(5);
}

function endRunGameOver(){
  if (state.runOver) return;
  state.runOver = true;
  alert(t('game.over') || 'Game Over');
  enterSelection(); // zurück zur Auswahl
}

function soulsBySpeed(day){
  const base = 10, bonus = Math.max(0, 11 - day);
  return base + bonus;
}

export function currentCardLevel(){ return state.powerLevel || 1; }
