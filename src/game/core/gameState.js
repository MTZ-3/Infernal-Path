import { buildMap } from '../map/map.js';
import { createHero } from '../hero/hero.js';
import { t } from '../../i18n.js';
import { CARD_DEFS, allCardIds, shuffle, scaledValue } from '../cards/cards.js';


export function canStartRun() {
  return state.selection.length === state.selectionTarget;
}



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