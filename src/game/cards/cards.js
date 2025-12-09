// ============================================================================
// Karten-Engine (instanzbasiert)
// ----------------------------------------------------------------------------
// - Templates in einer Library (TPL)
// - Deck/Hand bestehen aus Instanzen { uid, tplId, level }
// - Instanzen werden gezogen, gespielt und kehren (meist) ins Deck zurück
// - Nur Opferung entfernt Instanzen endgültig
// - Element-Schwächen/Stärken + Element-Runen werden beim Schaden berücksichtigt
// ============================================================================

// ============================================================================
// Karten-Engine (instanzbasiert)
// ============================================================================

import { GameState, uid, clamp } from "../core/gameState.js";

// ---------------------------------------------------------------------------
// Element-Logik: Held-Resists/Schwächen + Element-Runen
// ---------------------------------------------------------------------------

// Held: starkes/schwaches Element → Faktor 0.5 / 2.0
function elementalFactorFor(hero, element) {
  if (!hero || !element) return 1;
  let f = 1;
  if (hero.weakElement && hero.weakElement === element)     f *= 2;   // schwach → doppelter Schaden
  if (hero.strongElement && hero.strongElement === element) f *= 0.5; // stark → halber Schaden
  return f;
}

// Runen: +20 % Schaden pro passendem Element (bis zu deinen Slots)
function elementDamageMultiplier(cardOrInst) {
  const t = cardOrInst.tplId ? tplById(cardOrInst.tplId) : cardOrInst;
  const elems = t.elements || [];

  const runeState = GameState.runes || {};
  const elemRunes = runeState.elements || {};

  let matches = 0;
  for (const e of elems) {
    if (elemRunes[e]) matches++;
  }
  if (matches <= 0) return 1;

  // pro passender Rune +20 %
  return 1 + 0.2 * matches;
}

// finale Berechnung: Basis * (Held-Faktor) * (Runen-Faktor)
function computeElementalDamage(base, element, cardOrInst = null) {
  const h = GameState.hero;
  let factor = elementalFactorFor(h, element);

  if (cardOrInst) {
    factor *= elementDamageMultiplier(cardOrInst);
  }

  return Math.max(0, Math.round(base * factor));
}

function logElementHit(label, base, final, element) {
  const elemTxt = element ? ` (${element})` : "";
  if (final === base) {
    log(`${label}: ${final} Schaden${elemTxt}.`);
  } else {
    log(`${label}: ${base}→${final} Schaden${elemTxt}.`);
  }
}

// ==============================
// Library / Meta
// ==============================

/** Interne Map: templates nach ID (tplId) für schnellen Lookup. */
const TPL = new Map();

/** Library aus deinen Karten-Vorlagen laden. */
export function setCardLibrary(list) {
  TPL.clear();
  (list || []).forEach(t => TPL.set(t.id, t));
}

/** Vorlage holen (Fehler, falls nicht vorhanden). */
function tplById(tplId) {
  const t = TPL.get(tplId);
  if (!t) throw new Error(`[cards] Unbekannte Vorlage: ${tplId}`);
  return t;
}

/** Typ-Check: darf direkt auf den Helden gewirkt werden? */
export function isHeroCard(inst) {
  const t = tplById(inst.tplId);
  // nur direkte Heldentreffer-Typen:
  return t.type === "fluch" || t.type === "s_fluch";
}

// ==============================
// Instanzen
// ==============================

export function newInstance(tplId, level = 1) {
  return { uid: uid(), tplId, level };
}

export function instView(inst) {
  const t = tplById(inst.tplId);
  return { ...t, uid: inst.uid, level: inst.level };
}

// ==============================
// Skalierung (linear / log / cap)
// ==============================

export function scaledValue(cardOrInst) {
  const t = cardOrInst.tplId ? tplById(cardOrInst.tplId) : cardOrInst;
  const level = (cardOrInst.level || 1);

  const e = t.effect || { base: 0, growth: 0, scaleType: "linear" };
  if (e.scaleType === "log") {
    const cap = e.cap ?? Infinity;
    const val = e.base + Math.log1p(Math.max(0, level - 1)) * (e.growth || 0);
    return Math.min(val, cap);
  }
  return (e.base || 0) + (level - 1) * (e.growth || 0);
}

// ==============================
// Logging-Hook (UI)
// ==============================

let _logCb = null;
export function bindLogger(fn) { _logCb = fn; }
const log = (msg) => _logCb?.(msg);

// ==============================
// Ziehen / Mischen / Rotieren
// ==============================

const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function drawCards(n) {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (GameState.hand.length >= 20) break;
    if (GameState.deck.length === 0) break;
    const inst = GameState.deck.pop();
    GameState.hand.push(inst);
    drawn++;
  }
  log(
    `<span class="small muted">gezogen: ${drawn} • Hand=${GameState.hand.length} • Deck=${GameState.deck.length}</span>`
  );
}

export function returnToDeck(inst) {
  GameState.deck.push(inst);
  GameState.deck = shuffle(GameState.deck);
}

// ==============================
// Opferung & Level-Up
// ==============================

export function sacrificeByUid(cardUid) {
  const remove = (arr) => {
    const i = arr.findIndex(c => c.uid === cardUid);
    if (i >= 0) arr.splice(i, 1);
  };
  remove(GameState.hand);
  remove(GameState.deck);
  remove(GameState.discard);
  return { ok: true };
}

export function sacrifice(fromCardUid, toCardUid) {
  sacrificeByUid(fromCardUid);

  const findByUid = (uid) =>
    GameState.hand.find(c => c.uid === uid) ||
    GameState.deck.find(c => c.uid === uid) ||
    GameState.discard.find(c => c.uid === uid);

  const target = findByUid(toCardUid);
  if (target) {
    target.level = (target.level || 1) + 1;
    log(`<span class="k">Level-Up</span>: uid=${toCardUid} → L${target.level}`);
    return { ok: true };
  }
  return { ok: false };
}

export function levelUp(cardUid, delta = 1) {
  const all = [GameState.hand, GameState.deck, GameState.discard];
  for (const arr of all) {
    const c = arr.find(x => x.uid === cardUid);
    if (c) {
      c.level = Math.max(1, (c.level || 1) + delta);
      return { ok: true, level: c.level };
    }
  }
  return { ok: false };
}

// ==============================
// Karte spielen / platzieren
// ==============================

export function playCard(inst, targetNodeId = null) {
  const t = inst.tplId ? tplById(inst.tplId) : inst;
  const cost = t.cost ?? 0;
  if (GameState.energy < cost) return { ok: false, log: `Nicht genug Energie` };
  GameState.energy -= cost;

  // Map-Platzierung (Fallen/Zonen)
  if (targetNodeId) {
    placeOnNode(inst, targetNodeId);
    GameState.hand = GameState.hand.filter(c => c.uid !== inst.uid);
    returnToDeck(inst);
    return { ok: true, log: `${t.name} wurde auf Feld platziert.` };
  }

  // Sofort-Effekt (Held direkt)
  const h = GameState.hero;
  const k = t.effect?.kind;
  const base = Math.max(1, Math.floor(scaledValue(inst)));

  if (k === "damage" || k === "aoe_damage") {
    const element = (t.elements && t.elements[0]) || null;
    const final   = computeElementalDamage(base, element, inst);
    h.hp = clamp(h.hp - final, 0, h.maxHp);
    logElementHit(t.name, base, final, element);
  } else if (k === "dot" || k === "bleed") {
    const element = (t.elements && t.elements[0]) || null;
    h.dots.push({ dmg: base, days: 3, element });
    log(`${t.name} DoT ${base} für 3T${element ? " (" + element + ")" : ""}.`);
  } else if (k === "freeze_days") {
    const d = Math.max(1, Math.round(scaledValue(inst)));
    h.status.frozenDays = (h.status.frozenDays || 0) + d;
    log(`${t.name}: Eingefroren ${d}T.`);
  } else if (k === "slow_move_days") {
    const d = Math.max(1, Math.round(scaledValue(inst)));
    h.status.slowDays = (h.status.slowDays || 0) + d;
    log(`${t.name}: Verlangsamung ${d}T.`);
  } else if (k === "weaken") {
    const d = Math.max(1, Math.round(scaledValue(inst)));
    h.status.weakenPct = clamp((h.status.weakenPct || 0) + d, 0, 90);
    log(`${t.name}: Schwächung +${d}%.`);
  } else if (k === "reduce_maxhp") {
    const d = Math.max(1, Math.round(scaledValue(inst)));
    h.maxHp = Math.max(1, h.maxHp - d);
    h.hp = Math.min(h.hp, h.maxHp);
    log(`${t.name}: MaxHP -${d}.`);
  } else if (k === "gain_energy") {
    const d = Math.max(1, Math.round(scaledValue(inst)));
    GameState.energy += d;
    log(`${t.name}: Energie +${d}.`);
  } else if (k === "gain_souls") {
    const d = Math.max(1, Math.round(scaledValue(inst)));
    GameState.souls += d;
    log(`${t.name}: Seelen +${d}.`);
  } else if (k === "draw_now") {
    const d = Math.max(1, Math.round(scaledValue(inst)));
    drawCards(d);
  } else {
    log(`${t.name} gespielt (Platzhalter-Effekt).`);
  }

  GameState.hand = GameState.hand.filter(c => c.uid !== inst.uid);
  returnToDeck(inst);
  return { ok: true };
}

export function placeOnNode(inst, nodeId) {
  const t = tplById(inst.tplId);
  const list = GameState.placed.get(nodeId) || [];
  list.push({
    uid: uid(),
    instUid: inst.uid,
    tplId: inst.tplId,
    level: inst.level,
    once: true,
    createdDay: GameState.day
  });
  GameState.placed.set(nodeId, list);
  log(`Platziert: ${t.name}`);
}

// ==============================
// Field-Trigger
// ==============================

export function triggerNode(nodeId) {
  const entries = GameState.placed.get(nodeId);
  if (!entries || !entries.length) return;

  const h = GameState.hero;
  const keep = [];

  entries.forEach(p => {
    const t = tplById(p.tplId);
    const v = { tplId: p.tplId, level: p.level };
    const k = t.effect?.kind;
    const base = Math.max(1, Math.floor(scaledValue(v)));

    if (k === "damage" || k === "aoe_damage") {
      const element = (t.elements && t.elements[0]) || null;
      const final   = computeElementalDamage(base, element, v);
      h.hp = clamp(h.hp - final, 0, h.maxHp);
      logElementHit(`<b>Falle</b> ${t.name}`, base, final, element);
    } else if (k === "dot" || k === "bleed") {
      const element = (t.elements && t.elements[0]) || null;
      h.dots.push({ dmg: base, days: 3, element });
      log(
        `<b>Zone</b> ${t.name} – DoT ${base} für 3T` +
        (element ? ` (${element})` : "") +
        `.`
      );
    } else if (k === "freeze_days" || k === "slow_move_days") {
      const d = Math.max(1, Math.round(scaledValue(v)));
      if (k === "freeze_days") h.status.frozenDays = (h.status.frozenDays || 0) + d;
      else h.status.slowDays = (h.status.slowDays || 0) + d;
      log(`<b>Kontrolle</b> ${t.name} – ${d}T.`);
    } else {
      const backup = GameState.energy;
      GameState.energy = 999;
      playCard({ tplId: p.tplId, level: p.level }, null);
      GameState.energy = backup;
    }

    if (!p.once) keep.push(p);
  });

  if (keep.length) GameState.placed.set(nodeId, keep);
  else GameState.placed.delete(nodeId);
}
