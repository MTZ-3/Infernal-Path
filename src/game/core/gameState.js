// ============================================================================
// Globaler Spielzustand (Singleton)
// - Enthält NUR Laufzeitdaten (kein Rendering)
// - Deck/Hand bestehen aus INSTANZEN: { uid, tplId, level }
// - Platzierte Karten auf der Map speichern Snapshots (tplId/level zum Zeitpunkt)
// ============================================================================

// ---- Basiswerte / Limits ----------------------------------------------------
export const BASE_ENERGY = 3;   // Start-Energie pro Tag (ohne Runen)
export const HAND_LIMIT  = 7;   // max. Karten in der Hand (Draw stoppt vorher)
export const BASE_DRAW   = 4;   // Karten, die zu Tagesbeginn gezogen werden
export let   RUN_DAYS    = 10;  // Ziel-Tage (kann durch Karten verlängert werden)

// ---- Zentraler State --------------------------------------------------------
// Alles, was während eines Runs mutiert, liegt hier.
export const GameState = {
  // --- Run-Status ---
  day: 1,               // aktueller Tag (1..maxDays)
  maxDays: RUN_DAYS,    // dynamisch erweiterbar (z. B. durch Karten)
  energy: 0,            // verfügbare Energie im aktuellen Tag
  souls: 0,             // Währung für Runen/Meta
  round: 1,             // wie viele Helden besiegt (Start = 1)
  campDays: 3,          // verbleibende „am Start bleiben“-Tage

  // --- Deck/Hand/Ablage ---
  // Deck/Hand: Arrays von INSTANZEN { uid, tplId, level }
  // Hinweis: "discard" wird aktuell nicht aktiv genutzt (rotierendes Deck),
  // bleibt aber aus Kompatibilitätsgründen im State.
  deck: [],
  hand: [],
  discard: [],

  // --- Held / Runen / temporäre Modifikatoren ---
  hero: null,                               // wird bei Run-Start via createHero() gesetzt
    runes: {                                  // Meta-Boni, die beginDay/endDay beeinflussen
    draw:   false,                          // +1 Karte ziehen pro Tag (Beispiel)
    energy: false,                          // +1 Energie pro Tag (Beispiel)
    soul:   false,                          // +1 Seele je Kill (Beispiel)

    // Element-Runen: true = +20 % Schaden für dieses Element
    elements: {
      feuer:    false,
      blut:     false,
      schatten: false,
      eis:      false,
      natur:    false,
      licht:    false,
    },

    // maximale Anzahl gleichzeitig ausgerüsteter Element-Runen
    maxElementSlots: 3,
  },

  mods: {                                   // temporäre Multiplikatoren/Buffs
    cursePct:     0,                        // z. B. +% Fluchschaden
    tempDamagePct:0                         // temporäre +% auf Schaden
  },

  // --- Weltkarte & Platzierte Karten ---
  // Einfache Graph-Struktur (siehe map.js)
  map:     { nodes: [], links: [], castleId: null },
  heroPos: null,                            // Node-ID, an der der Held aktuell steht

  // Map<nodeId, Array<Placed>>
  // Placed = { uid, instUid, tplId, level, once, createdDay }
  //  - uid:        eindeutige ID dieses Platzierungs-Objekts
  //  - instUid:    referenzierte Hand-Instanz (falls du sie später verfolgen willst)
  //  - tplId:      Vorlagen-ID (stabil, Lookup über Card-Library)
  //  - level:      Level der Instanz zum Zeitpunkt des Platzierens (Snapshot)
  //  - once:       true = löst einmal aus und verschwindet
  //  - createdDay: an welchem Tag platziert
  placed: new Map(),

  // --- API-Helfer direkt am State ---
  // Verlängert den Run (z. B. durch Karte "Blutopfer")
  extendDays(d){ GameState.maxDays += d; }
};

// ---- Kleine Helfer (Utilities) ---------------------------------------------
// clamp: Zahl auf Intervall [min,max] begrenzen
export const clamp = (v, min=0, max=9999) => Math.max(min, Math.min(max, v));

// uid: kurze zufällige ID für Instanzen/Platzierungen
export const uid   = () => Math.random().toString(36).slice(2);

// rand: ganzzahliger Zufall im Bereich [a,b]
export const rand  = (a,b) => Math.floor(Math.random() * (b - a + 1)) + a;

/*
Hinweise:
- Das eigentliche Karten-Template-Management (Library) liegt in cards.js
  (setCardLibrary, newInstance, instView, playCard, drawCards, …).
- beginDay()/endDay() (in turns.js) nutzen BASE_ENERGY/BASE_DRAW sowie
  GameState.runes, um Energie/Karten pro Tag zu bestimmen.
- Das rotierende Deck bedeutet: Gespielte/platzierte Karten-Instanzen
  gehen zurück ins Deck (nur "Opfern" entfernt eine Instanz dauerhaft).
*/
