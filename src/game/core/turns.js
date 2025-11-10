// ============================================================================
// Tages-Logik: beginDay / endDay / Heldenbewegung
// - beginDay: Energie auffüllen, Startkarten ziehen
// - endDay: DoTs ticken lassen, Held bewegen, Hand ins Deck zurückmischen,
//           Tag hochzählen, ggf. Run-Ende prüfen, nächsten Tag starten
// ============================================================================

import { GameState, BASE_ENERGY, BASE_DRAW, HAND_LIMIT, clamp } from "./gameState.js";
import { drawCards } from "../cards/cards.js";
import { triggerNode } from "../cards/cards.js";
import { renderMap } from "../map/map.js";

// kleines lokales Shuffle – reicht für Tagesmischung
const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ----------------------------------------------------------------------------
// beginDay: Energie setzen + Karten ziehen
// ----------------------------------------------------------------------------
export function beginDay() {
  // 1) Energie
  const extraEnergy = GameState.runes?.energy ? 1 : 0;
  GameState.energy = BASE_ENERGY + extraEnergy;

  // 2) Ziehen (Handlimit wird in drawCards respektiert)
  const extraDraw = GameState.runes?.draw ? 1 : 0;
  const drawCount = BASE_DRAW + extraDraw;
  drawCards(drawCount);

  // 3) Debug/Info
  window.__log?.(
    `<span class="small muted">beginDay → Energie=${GameState.energy}, Hand=${GameState.hand.length}, Deck=${GameState.deck.length}</span>`
  );
}

// ----------------------------------------------------------------------------
// endDay: Status abhandeln, bewegen, Hand zurück, Tag++ (und ggf. nächster Tag)
// ----------------------------------------------------------------------------
export function endDay() {
  const h = GameState.hero;
  if (!h) return;

  // Safety: Felder initialisieren, falls nicht vorhanden
  h.dots   = Array.isArray(h.dots) ? h.dots : [];
  h.status = h.status || {};

  // 1) DoTs ticken lassen
  let dotTotal = 0;
  h.dots.forEach(d => { dotTotal += d.dmg; d.days--; });
  h.dots = h.dots.filter(d => d.days > 0);
  if (dotTotal > 0) {
    h.hp = clamp(h.hp - dotTotal, 0, h.maxHp);
    window.__log?.(`<span class="small muted">DoT: ${dotTotal} Schaden</span>`);
  }

  // 2) Dauer-Effekte abbauen (nur Zähler runter; Logik kann später erweitert werden)
  if (h.status.frozenDays > 0) h.status.frozenDays--;
  if (h.status.slowDays   > 0) h.status.slowDays--;

  // 3) Held bewegen (1 Node pro Tag), außer eingefroren oder tot
  const frozenNow = (h.status.frozenDays ?? 0) > 0;
  if (h.alive !== false && !frozenNow) {
    moveHeroOneStep();
  }

  // 4) Hand zurück ins Deck und mischen (rotierendes Deck)
  if (GameState.hand.length) {
    GameState.deck.push(...GameState.hand);
    GameState.hand = [];
    GameState.deck = shuffle(GameState.deck);
  }

  // Held tot?
  
  if (h.hp <= 0 && h.alive !== false) {
    // Seelen gutschreiben
    h.alive = false;
    const gain = 3 + (GameState.runes?.soul ? 1 : 0);
    GameState.souls += gain;

    // kurzer, nicht-blockierender Toast
    window.__toast?.(`<b>SIEG</b> – Held gefallen (+${gain} Seelen)`);

    // Runde hochzählen (nächste Heldenwelle)
    GameState.round++;

    // NÄCHSTER TAG beginnt gleich im Hintergrund:
    GameState.day++;
    if (GameState.day > GameState.maxDays) {
      alert("Sieg!");            // oder dein Endscreen
      freezeRun();
      return;
    }

    // neuen (stärkeren) Helden am Start spawnen
    if (typeof window.__spawnHero === "function") {
      window.__spawnHero();
    } else {
      // Fallback
      const startNode = GameState.map?.nodes?.[0]?.id ?? GameState.heroPos;
      h.hp = h.maxHp; h.alive = true; h.dots = []; h.status = {};
      if (startNode) GameState.heroPos = startNode;
    }
    renderMap?.();

    // neues Ziehen & Energie für den neuen Tag
    beginDay();
    return;
}

  // 6) Schloss erreicht? -> Niederlage
  if (h.alive !== false && GameState.heroPos === GameState.map.castleId) {
    alert("Niederlage! Der Held erreichte das Schloss.");
    freezeRun();
    return;
  }

  // Held lebt → normaler Tagwechsel
  GameState.day++;
  if (GameState.day > GameState.maxDays) {
    alert("Niederlage!");        // oder Endscreen
    freezeRun();
    return;
  }

  // 8) Nächster Tag startet automatisch
  beginDay();
}

// ----------------------------------------------------------------------------
// Bewegung: 1 Schritt Richtung Schloss (kürzeste Luftlinie)
// ----------------------------------------------------------------------------
function moveHeroOneStep() {
  const here   = GameState.heroPos;
  const target = GameState.map.castleId;
  if (!here || !target || here === target) return;

  const neigh = neighborsOf(here);
  if (!neigh.length) return;

  // wähle Nachbar mit kleinster Luftlinie zur Burg
  const castleNode = nodeById(target);
  let best = neigh[0], bestD = dist(nodeById(neigh[0]), castleNode);
  for (let i = 1; i < neigh.length; i++) {
    const d = dist(nodeById(neigh[i]), castleNode);
    if (d < bestD) { best = neigh[i]; bestD = d; }
  }

  GameState.heroPos = best;

  // Feld-Effekte auslösen + Map neu zeichnen
  triggerNode(best);
  renderMap?.();
}

// ----------------------------------------------------------------------------
// kleine Graph-Helfer
// ----------------------------------------------------------------------------
function nodeById(id) { return GameState.map.nodes.find(n => n.id === id); }
function neighborsOf(id) {
  const out = [];
  GameState.map.links.forEach(l => {
    if (l.a === id) out.push(l.b);
    else if (l.b === id) out.push(l.a);
  });
  return out;
}
const dist = (A, B) => Math.hypot(A.x - B.x, A.y - B.y);

// ----------------------------------------------------------------------------
// Freeze: Run „einfrieren“ (bei Sieg/Niederlage); Deck/Hand leeren
// ----------------------------------------------------------------------------
function freezeRun() {
  GameState.hand    = [];
  GameState.deck    = [];
  GameState.discard = [];
  // Optional: Hier könntest du auch Buttons deaktivieren, Overlay zeigen etc.
}
