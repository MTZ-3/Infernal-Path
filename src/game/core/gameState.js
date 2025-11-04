import { buildMap } from '../map/map.js';
import { createHero } from '../hero/hero.js';
import { t } from '../../i18n.js';
import { CARD_DEFS, allCardIds, shuffle, scaledValue } from '../cards/cards.js';


export const state = {
mode: 'select', // 'select' | 'run'
day: 1,
maxDay: 10,
energy: 0,
maxEnergy: 3,
souls: 0,
map: [],
hero: null,
heroPos: 0,
// Runen/Shop wie gehabt
shop: { open: true, runes: {} },
runes: {},


// Karten-Pool & Deckbau
cardPool: [], // alle verfügbaren Karten-IDs
selection: [], // aktuell ausgewählte Startkarten (IDs)
selectionTarget: 10,


// In-Run Deck
drawPile: [],
hand: [],
discard: [],
effects: { bleed: 0, weak: 0 },


// Tages-Draft
draftOpen: false,
draftOptions: [], // IDs


// Level-Logik für Skalierung
powerLevel: 1, // Baseline fürs Karten-Level; hier anpassbar
};


export function initPools(){
state.cardPool = allCardIds();
}


export function enterSelection(){
state.mode = 'select';
state.selection = [];
}


export function toggleSelectCard(id){
const i = state.selection.indexOf(id);
if (i >= 0) state.selection.splice(i,1);
else if (state.selection.length < state.selectionTarget) state.selection.push(id);
}


export function canStartRun(){
return state.selection.length === state.selectionTarget;
}


export function newRunFromSelection(){
// Grundwerte resetten
state.mode = 'run';
state.day = 1;
state.powerLevel = 1; // Start-Level (kannst du anders mappen)
state.energy = state.maxEnergy;
state.souls = 0;
state.map = buildMap();
state.hero = createHero();
state.heroPos = 0;
state.shop.open = true;
state.runes = {};
state.effects = { bleed: 0, weak: 0 };


// Deck initialisieren aus Auswahl (eine Kopie pro Karte)
state.drawPile = shuffle(state.selection.slice());
state.hand = [];
state.discard = [];


// Start-Hand
drawCards(5);
}


export function tryAttack(){
if (state.energy <= 0) return;
state.energy -= 1;
const bonus = (state.runes.rune_damage || 0);
const dmg = 2 + bonus - (state.effects.weak>0?1:0);
applyDamage(dmg);
}


function applyDamage(n){
const real = Math.max(0, n - (state.effects.weak>0?1:0));
state.hero.hp -= real;
if (state.hero.hp <= 0) killHero();
}

// Tages-Draft öffnen (z. B. am Tagesbeginn)
export function openDailyDraft(n = 3) {
  if (state.mode !== 'run') return;
  const ids = shuffle(state.cardPool.slice());
  state.draftOptions = ids.slice(0, n);   // 3 Vorschläge
  state.draftOpen = true;
}

// Eine der 3 Draft-Karten wählen
export function chooseDraftCard(id) {
  if (!state.draftOpen) return;
  if (!state.draftOptions.includes(id)) return;

  // Gewählte Karte ins Deck (Ablage -> wird gemischt wenn drawPile leer)
  state.discard.push(id);

  // Draft schließen
  state.draftOpen = false;
  state.draftOptions = [];
}



export function drawCards(n=1){
}