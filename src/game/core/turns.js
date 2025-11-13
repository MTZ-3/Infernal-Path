// src/game/core/turns.js
// ============================================================================
// Tages-Logik: beginDay / endDay / Heldenbewegung
// - beginDay: Energie auffüllen, Startkarten ziehen
// - endDay : VERY SIMPLE VERSION
//            • DoTs ticken
//            • Held 1 Feld bewegen (falls möglich)
//            • Hand ins Deck + mischen
//            • Tag++
//            • beginDay() für nächsten Tag
// ============================================================================

import { GameState, BASE_ENERGY, BASE_DRAW, HAND_LIMIT, clamp } from "./gameState.js";
import { drawCards }   from "../cards/cards.js";
import { triggerNode } from "../cards/cards.js";
import { renderMap }   from "../map/map.js";

// kleines lokales Shuffle – nur für Tagesmischung
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
  const extraEnergy = GameState.runes?.energy ? 1 : 0;
  GameState.energy = BASE_ENERGY + extraEnergy;

  const extraDraw = GameState.runes?.draw ? 1 : 0;
  const drawCount = BASE_DRAW + extraDraw;

  drawCards(drawCount);

  window.__log?.(
    `<span class="small muted">beginDay → Tag ${GameState.day} • Energie=${GameState.energy} • Hand=${GameState.hand.length} • Deck=${GameState.deck.length}</span>`
  );
  // UI sicher aktualisieren
  window.__render?.();
  renderMap?.();
}

// ----------------------------------------------------------------------------
// endDay: sehr einfache, robuste Version
// ----------------------------------------------------------------------------
export function endDay() {
  console.log("[endDay] START", { day: GameState.day, hero: !!GameState.hero });

  // --- 0) Held sicherstellen ---
  if (!GameState.hero) {
    console.warn("[endDay] Kein Held → fallback spawn");
    // Minimal-Spawn, falls du kein __spawnHero hast
    if (typeof window.__spawnHero === "function") {
      window.__spawnHero();
    } else {
      const startNode = GameState.map?.nodes?.[0];
      GameState.hero = {
        name: "Held",
        maxHp: 90,
        hp: 90,
        dots: [],
        status: {},
        alive: true,
      };
      if (startNode) GameState.heroPos = startNode.id;
    }
  }

  const h = GameState.hero;
  h.dots   = Array.isArray(h.dots) ? h.dots : [];
  h.status = h.status || {};

  // --- 1) DoTs ticken ---
  let dotTotal = 0;
  h.dots.forEach(d => { dotTotal += d.dmg; d.days--; });
  h.dots = h.dots.filter(d => d.days > 0);
  if (dotTotal > 0) {
    h.hp = clamp(h.hp - dotTotal, 0, h.maxHp);
    window.__log?.(`<span class="small muted">DoT: ${dotTotal} Schaden</span>`);
  }

  // --- 2) Einfache Bewegung (wenn lebendig) ---
  if (h.alive !== false && h.hp > 0) {
    moveHeroOneStep();
  }

  // --- 3) Hand → Deck & mischen ---
  if (GameState.hand.length) {
    GameState.deck.push(...GameState.hand);
    GameState.hand = [];
    GameState.deck = shuffle(GameState.deck);
  }

  // --- 4) Sehr simpler Tod-/Schloss-Check (KEINE Map-Neuerzeugung, KEIN Run-Ende) ---
  if (h.hp <= 0) {
    h.alive = false;
    const gain = 3 + (GameState.runes?.soul ? 1 : 0);
    GameState.souls += gain;
    window.__log?.(`<span class="soul">Held fällt. +${gain} Seelen.</span>`);
  }

  // --- 5) Tag++ ---
  GameState.day++;

  // --- 6) Nächster Tag: Energie auffüllen & ziehen ---
  beginDay();

  console.log("[endDay] DONE → Tag", GameState.day);
}

// ----------------------------------------------------------------------------
// Bewegung: Held 1 Schritt Richtung "rechts" / nächste Schicht, sehr simpel
// ----------------------------------------------------------------------------
function moveHeroOneStep() {
  const hereId = GameState.heroPos;
  if (!hereId) return;
  const hereNode = nodeById(hereId);
  if (!hereNode) return;

  const neighIds = neighborsOf(hereId);
  if (!neighIds.length) return;

  // Versuch: Nachbarn mit höherem x (nach "rechts") bevorzugen
  const hereX = hereNode.x;
  const neighNodes = neighIds.map(id => nodeById(id)).filter(Boolean);

  let candidates = neighNodes.filter(n => n.x > hereX + 1);
  if (!candidates.length) candidates = neighNodes; // Fallback

  const next = candidates[0]; // super simpel: ersten Kandidaten nehmen
  GameState.heroPos = next.id;

  // Platzierte Karten auf dem Feld auslösen
  try { triggerNode(next.id); } catch(e) { console.error("triggerNode fail", e); }

  renderMap?.();
}

// ----------------------------------------------------------------------------
// Graph-Helfer
// ----------------------------------------------------------------------------
function nodeById(id) {
  return GameState.map.nodes.find(n => n.id === id);
}
function neighborsOf(id) {
  const out = [];
  GameState.map.links.forEach(l => {
    if (l.a === id) out.push(l.b);
    else if (l.b === id) out.push(l.a);
  });
  return out;
}
