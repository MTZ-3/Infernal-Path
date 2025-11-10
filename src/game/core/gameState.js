export const BASE_ENERGY = 3;
export const HAND_LIMIT = 7;
export const BASE_DRAW = 5;
export let RUN_DAYS = 10; // kann per Karte verlängert werden


export const GameState = {
  // --- Run-Status ---
  day: 1,
  maxDays: 10,
  energy: 0,
  souls: 0,

  // --- Deck/Hand/Ablage ---
  deck: [],
  hand: [],
  discard: [],

  // --- Held / Mods / Runen ---
  hero: null,                                  // wird beim Run-Start gesetzt
  runes: { draw:false, energy:false, soul:false },
  mods: { cursePct:0, tempDamagePct:0 },

  // --- Weltkarte & Platzierte Karten ---
  map: { nodes: [], links: [], castleId: null }, // einfache Graph-Struktur
  heroPos: null,                                  // ID des aktuellen Nodes
  placed: new Map(),                               // Map<nodeId, Array<placedCard>>
  // placedCard: { uid, id, name, once, cardRef, createdDay }

  // --- Hilfsfunktion (z. B. bei "Run verlängern") ---
  extendDays(d){ GameState.maxDays += d; },
};



// Kleine Helfer
export const clamp = (v,min=0,max=9999)=>Math.max(min,Math.min(max,v));
export const uid = ()=>Math.random().toString(36).slice(2);
export const rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;