import { GameState, clamp } from "../core/gameState.js";

let _logCb = null;
export function bindLogger(fn) { _logCb = fn; }
function log(m) { if (_logCb) _logCb(m); }

// Alle bekannten Elemente im Spiel
const ELEMENTS = ["feuer", "eis", "blut", "schatten", "natur", "licht"];

function rollElementPair() {
  const a = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
  let b = a;
  // so lange würfeln, bis b != a
  while (b === a) {
    b = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
  }
  return { strong: a, weak: b };
}

export function createHero(blueprint) {
  const { strong, weak } = rollElementPair();

  const h = {
    name: blueprint.name,
    maxHp: blueprint.maxHp,
    hp:  blueprint.maxHp,
    dist: GameState.maxDays,
    dots: [],
    speed: blueprint.baseSpeed || 1,
    alive: true,
    status: { frozenDays: 0, slowDays: 0, weakenPct: 0 },

    // NEU: elementare Stärken/Schwächen
    strongElement: strong,  // bekommt nur 50% Schaden von diesem Element
    weakElement:   weak     // bekommt 200% Schaden von diesem Element
  };

  log?.(
    `Neuer Held: ${h.name} – stark gegen <b>${h.strongElement}</b>, ` +
    `verwundbar gegen <b>${h.weakElement}</b>.`
  );

  return h;
}
