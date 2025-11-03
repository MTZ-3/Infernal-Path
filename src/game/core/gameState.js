// src/game/core/gameState.js
import { buildMap } from '../map/map.js';
import { createHero } from '../hero/hero.js';
import { t } from '../../i18n.js';

export const state = {
  day: 1,
  maxDay: 10, // Tag 10 => Game Over
  energy: 0,
  maxEnergy: 3,
  souls: 0,     // Seelenfragmente
  map: [],
  hero: null,
  heroPos: 0,   // Index im Map-Array
  shop: { open: true, runes: {} }, // Shop ist immer offen
  runes: {},    // aktive Runen des Runs
};

export function newRun() {
  state.day = 1;
  state.energy = state.maxEnergy;
  state.souls = 0;
  state.map = buildMap();
  state.hero = createHero();
  state.heroPos = 0; // Startdorf
  state.shop.open = true;
  state.runes = {};
}

export function nextDay() {
  // Tagesstart
  state.day += 1;
  state.energy = state.maxEnergy + (state.runes.rune_energy || 0);

  // Held bewegt sich ab Tag 4
  if (state.day >= 4) {
    moveHero();
  }

  // Game Over?
  const atAltar = state.map[state.heroPos]?.type === 'ALTAR';
  if (atAltar) {
    alert(t('game.over'));
    newRun();
  }
}

function moveHero() {
  // Verbringt 1 Tag im Dorf zur Heilung (wenn auf Dorf & Tagwechsel)
  const tile = state.map[state.heroPos];
  if (tile.type === 'VILLAGE' && !tile.spent) {
    tile.spent = true; // „heilen & rasten“
    state.hero.hp = Math.min(state.hero.maxHp, state.hero.hp + 9999); // volle Heilung simpel
    return; // bleibt 1 Tag stehen
  }
  // Weiterziehen
  state.heroPos = Math.min(state.heroPos + 1, state.map.length - 1);
}

export function tryAttack() {
  if (state.energy <= 0) return;
  state.energy -= 1;
  const dmg = 2 + (state.runes.rune_damage || 0);
  state.hero.hp -= dmg;
  if (state.hero.hp <= 0) {
    killHero();
  }
}

export function killHero() {
  // Seelenfragmente-Belohnung nach Geschwindigkeit
  const gained = soulsBySpeed(state.day);
  state.souls += gained;
  alert(t('hero.slain', { souls: gained }));
  // Neuer Run
  newRun();
}

export function buyRune(key) {
  if (!key) return;
  const def = RUNE_DEFS[key];
  if (!def) return;
  if (state.souls < def.cost) return;
  state.souls -= def.cost;
  state.runes[key] = (state.runes[key] || 0) + def.stack;
}

function soulsBySpeed(day) {
  // Je früher, desto mehr (Tag 1–10)
  const base = 10;
  const bonus = Math.max(0, (11 - day)); // Tag 1 => +10, Tag 10 => +1
  return base + bonus;
}

export const RUNE_DEFS = {
  rune_draw:   { key: 'rune_draw',   name: 'Rune der Gier',      cost: 12, stack: 1, desc: '+1 Karte pro Runde (UI-WIP)' },
  rune_damage: { key: 'rune_damage', name: 'Rune der Finsternis', cost: 15, stack: 1, desc: '+1 Schaden für Dämonen-Angriffe' },
  rune_energy: { key: 'rune_energy', name: 'Rune der Opferung',   cost: 10, stack: 1, desc: '+1 maximale Energie' },
};
