// /src/game/core/gameState.js
// ------------------------------------------------------
// Infernal Path – zentraler Spielzustand & Logik
// - Kartenwahl vor dem Run (10 Karten wählen)
// - Run-Flow (Deck/Hand/Ablage, Tageswechsel)
// - Tages-Draft (3 Optionen → 1 Karte wählen)
// - Effekte: Blutung (DoT), Verwundbarkeit (+10% Schaden/Stack)
// - Skalierung: Werte je Karte via scaledValue() nach Level
// ------------------------------------------------------

import { buildMap } from '../map/map.js';
import { createHero } from '../hero/hero.js';
import { t } from '../../i18n.js';
import { CARD_DEFS, allCardIds, shuffle, scaledValue } from '../cards/cards.js';

// ---------- Globaler Zustand ----------
export const state = {
  // Meta / Flow
  mode: 'select',             // 'select' | 'run'
  day: 1,
  maxDay: 10,
  powerLevel: 1,              // Level-Basis für Karten (standard = Tag)

  // Ressourcen
  energy: 0,
  maxEnergy: 3,
  souls: 0,

  // Welt & Held
  map: [],
  hero: null,
  heroPos: 0,

  // Shop & Runen (Platzhalter – erweiterbar)
  shop: { open: true, runes: {} },
  runes: {},

  // Karten-Pool & Auswahl (Pre-Run)
  cardPool: [],               // alle verfügbaren Karten-IDs
  selection: [],              // gewählte Startkarten (IDs)
  selectionTarget: 10,

  // In-Run Deckzustand
  drawPile: [],
  hand: [],
  discard: [],

  // Zustände/Effekte am Helden
  effects: {
    bleed: 0,                 // DoT pro Tag
    vulnStacks: 0             // +10% erlittenen Schaden je Stack; -1/Tag
  },

  // Tages-Draft
  draftOpen: false,
  draftOptions: []            // 3 Karten-IDs
};

// ---------- Initialisierung ----------
export function initPools() {
  state.cardPool = allCardIds();
}

export function enterSelection() {
  state.mode = 'select';
  state.selection = [];
  // Grundwerte zurücksetzen
  state.day = 1;
  state.powerLevel = 1;
  state.energy = 0;
  state.souls = 0;
  state.draftOpen = false;
  state.draftOptions = [];
}

// Auswahl toggeln (bis selectionTarget)
export function toggleSelectCard(id) {
  const i = state.selection.indexOf(id);
  if (i >= 0) {
    state.selection.splice(i, 1);
  } else if (state.selection.length < state.selectionTarget) {
    state.selection.push(id);
  }
}

export function canStartRun() {
  return state.selection.length === state.selectionTarget;
}

// ---------- Run starten ----------
export function newRunFromSelection() {
  state.mode = 'run';
  state.day = 1;
  state.powerLevel = 1; // einfach: Level = Tag
  state.energy = state.maxEnergy + (state.runes.rune_energy || 0);
  state.souls = 0;

  // Karte, Held, Position
  state.map = buildMap();
  state.hero = createHero();
  state.heroPos = 0;

  // Zustände resetten
  state.effects = { bleed: 0, vulnStacks: 0 };
  state.shop.open = true;
  state.runes = {};

  // Deck aus Auswahl erzeugen (eine Kopie je gewählter Karte)
  state.drawPile = shuffle(state.selection.slice());
  state.hand = [];
  state.discard = [];

  // Starthand
  drawCards(5);
}

// ---------- Kernaktionen ----------
export function tryAttack() {
  // Debug/Beispiel: einfacher Basisangriff als Fallback
  if (state.energy <= 0) return;
  state.energy -= 1;
  const base = 2 + (state.runes.rune_damage || 0);
  applyDamage(base);
}

export function playCard(id) {
  const idx = state.hand.indexOf(id);
  if (idx === -1) return;
  const def = CARD_DEFS[id];
  if (!def) return;

  const cost = def.cost || 0;
  if (state.energy < cost) return;
  state.energy -= cost;

  const L = currentCardLevel();
  const eff = def.effect || {};
  const val = scaledValue(eff, L);

  // Basisschalter für die wichtigsten Effekte
  switch (eff.kind) {
    case 'damage':
      applyDamage(Math.round(val));
      break;
    case 'damage_multi':
      applyDamage(Math.round(val)); // einfache Version – kann später Mehrfachtreffer/Verteilung bekommen
      break;
    case 'dot':
    case 'bleed':
      state.effects.bleed += Math.round(val);
      break;
    case 'weaken': // bei uns: Verwundbarkeit (erhöht eingehenden Schaden)
      state.effects.vulnStacks = Math.min(99, (state.effects.vulnStacks || 0) + Math.round(val));
      break;
    case 'gain_souls':
      state.souls += Math.round(val);
      break;
    case 'gain_energy':
      state.energy += Math.round(val);
      break;

    // --- Platzhalter für Map-/Eroberungseffekte (später anbinden) ---
    // case 'corrupt_chance': ...
    // case 'dark_radius_fields': ...
    // case 'altar_souls_per_day': ...
    // case 'portal_slots': ...
    // case 'dungeon_poison_dot': ...
    // case 'village_still_days': ...
    // case 'dungeon_quake_damage': ...
    // case 'souls_on_village_fall': ...
    // (Analog eigene Funktionen aufrufen und state.map ändern)

    default:
      // Noch nicht implementierte Spezialeffekte landen hier.
      // Kein Fehler – Karte wird gespielt, landet in der Ablage.
      break;
  }

  // Karte ablegen
  state.discard.push(id);
  state.hand.splice(idx, 1);

  // Held tot?
  if (state.hero.hp <= 0) killHero();
}

// ---------- Tageswechsel ----------
export function nextDay() {
  if (state.mode !== 'run') return;

  // 1) Tagesbeginn: Draft öffnen
  openDailyDraft(3);

  // 2) Tägliche Effekte ticken (vor Bewegung)
  if (state.effects.bleed > 0) {
    state.hero.hp -= state.effects.bleed;
    if (state.hero.hp <= 0) {
      killHero();
      return;
    }
  }
  if (state.effects.vulnStacks > 0) state.effects.vulnStacks -= 1;

  // 3) Nächster Tag + Level-Kopplung
  state.day += 1;
  state.powerLevel = Math.max(state.powerLevel, state.day);

  // 4) Energie auffrischen
  state.energy = state.maxEnergy + (state.runes.rune_energy || 0);

  // 5) Hand abwerfen
  state.discard.push(...state.hand);
  state.hand = [];

  // 6) Heldenbewegung (Beispiel-Logik)
  if (state.day >= 4) moveHero();

  // 7) Game Over prüfen – erreicht der Held den Altar?
  const atAltar = state.map[state.heroPos]?.type === 'ALTAR';
  if (atAltar) {
    alert(t('game.over') || 'Game Over');
    enterSelection(); // zurück zur Kartenwahl
    return;
  }

  // 8) Neue Hand
  drawCards(5);
}

// ---------- Draft ----------
export function openDailyDraft(n = 3) {
  if (state.mode !== 'run') return;
  const pool = shuffle(state.cardPool.slice());
  state.draftOptions = pool.slice(0, n);
  state.draftOpen = true;
}

export function chooseDraftCard(id) {
  if (!state.draftOpen) return;
  if (!state.draftOptions.includes(id)) return;

  // Gewählte Karte ins Deck (in Ablage; wird gemischt, wenn Nachziehstapel leer)
  state.discard.push(id);

  // Draft schließen
  state.draftOpen = false;
  state.draftOptions = [];
}

// ---------- Hilfsfunktionen ----------
export function drawCards(n = 1) {
  for (let i = 0; i < n; i++) {
    if (state.drawPile.length === 0) {
      if (state.discard.length === 0) break;
      state.drawPile = shuffle(state.discard.splice(0));
    }
    const id = state.drawPile.pop();
    if (id) state.hand.push(id);
  }
  // Energie-Refill wird an anderer Stelle (nextDay / Runstart) gemacht
}

function applyDamage(n) {
  const mul = 1 + 0.10 * (state.effects.vulnStacks || 0); // +10% Schaden je Stack
  const real = Math.max(0, Math.round(n * mul));
  state.hero.hp -= real;
  if (state.hero.hp <= 0) killHero();
}

function moveHero() {
  const tile = state.map[state.heroPos];

  // Beispiel: Dorf heilt einmalig komplett, „verbraucht“ das Feld für 1 Tag
  if (tile?.type === 'VILLAGE' && !tile.spent) {
    tile.spent = true;           // 1 Tag Rast
    state.hero.hp = state.hero.maxHp;
    return;
  }

  // Schritt nach vorn (lineare Strecke)
  state.heroPos = Math.min(state.heroPos + 1, state.map.length - 1);
}

export function killHero() {
  const gained = soulsBySpeed(state.day);
  state.souls += gained;
  alert(t('hero.slain', { souls: gained }) || `Held gefallen (+${gained} Seelen)`);
  // Zurück zur Kartenwahl
  enterSelection();
}

function soulsBySpeed(day) {
  const base = 10;
  const bonus = Math.max(0, (11 - day)); // je schneller gekillt, desto mehr Seelen
  return base + bonus;
}

export function currentCardLevel() {
  // Einfaches Mapping: Level = aktueller Tag (kannst du jederzeit ersetzen)
  return state.powerLevel || state.day || 1;
}
