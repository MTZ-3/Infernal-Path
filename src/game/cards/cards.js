// ============================================================================
// Karten-Engine (instanzbasiert)
// ----------------------------------------------------------------------------
// Grundidee:
// - Es gibt VORLAGEN (Card-Templates) in einer Library (einmalig).
// - Im Deck/Hand liegen INSTANZEN { uid, tplId, level }.
// - Am Tagesbeginn werden 5 Instanzen zufällig gezogen.
// - Beim Spielen/Platzieren verlässt die Instanz die Hand und
//   geht (sofern nicht geopfert) sofort ZURÜCK INS DECK (gemischt).
// - Nur "Opferung" entfernt eine Instanz dauerhaft.
// ============================================================================

import { GameState, uid, clamp } from "../core/gameState.js";

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


// GANZ UNTEN (oder irgendwo nach tplById)
export function isHeroCard(inst) {
  // inst → { uid, tplId, level }
  const t = tplById(inst.tplId);
  // Nur diese Typen gehen direkt auf den Helden:
  return t.type === "fluch" || t.type === "s_fluch";
}



// ==============================
// Instanzen
// ==============================

/** Neue Karten-Instanz aus einer Vorlage erzeugen. */
export function newInstance(tplId, level = 1) {
  return { uid: uid(), tplId, level };
}

/** Praktisch für Rendering: Template + Instanz-Daten zusammenführen. */
export function instView(inst) {
  const t = tplById(inst.tplId);
  return { ...t, uid: inst.uid, level: inst.level };
}

// ==============================
// Skalierung (linear / log / cap)
// ==============================

/**
 * Skaliert den Effektwert einer Karte anhand des Instanz-Levels.
 * Nimmt entweder eine Instanz {tplId, level} ODER direkt ein Template-Objekt
 * mit `effect` entgegen.
 */
export function scaledValue(cardOrInst) {
  // Template ermitteln
  const t = cardOrInst.tplId ? tplById(cardOrInst.tplId) : cardOrInst;
  const level = (cardOrInst.level || 1);

  const e = t.effect || { base: 0, growth: 0, scaleType: "linear" };
  if (e.scaleType === "log") {
    const cap = e.cap ?? Infinity;
    const val = e.base + Math.log1p(Math.max(0, level - 1)) * (e.growth || 0);
    return Math.min(val, cap);
  }
  // linear
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

/** Einfaches Fisher–Yates-Shuffle. */
const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Zieht n Instanzen aus dem Deck (keine discard-Mechanik). */
export function drawCards(n) {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (GameState.hand.length >= 20) break;      // Handlimit (anpassbar)
    if (GameState.deck.length === 0) break;      // nichts mehr da
    const inst = GameState.deck.pop();
    GameState.hand.push(inst);
    drawn++;
  }
  log(`<span class="small muted">gezogen: ${drawn} • Hand=${GameState.hand.length} • Deck=${GameState.deck.length}</span>`);
}

/** Legt eine Instanz zurück ins Deck und mischt leicht. */
export function returnToDeck(inst) {
  GameState.deck.push(inst);
  // leicht mischen – schnell & ausreichend für Prototyp
  GameState.deck = shuffle(GameState.deck);
}

// ==============================
// Opferung & Level-Up
// ==============================

/**
 * Entfernt EINE Instanz endgültig (Opferung).
 * @returns { ok: boolean }
 */
export function sacrificeByUid(cardUid) {
  const remove = (arr) => {
    const i = arr.findIndex(c => c.uid === cardUid);
    if (i >= 0) arr.splice(i, 1);
  };
  remove(GameState.hand);
  remove(GameState.deck);
  remove(GameState.discard); // ungenutzt, aber harmless
  return { ok: true };
}

/**
 * Kompatibler Helfer: Opfer von A und Level-Up auf B.
 * fromCardUid wird gelöscht; toCardUid +1 Level (falls vorhanden).
 */
export function sacrifice(fromCardUid, toCardUid) {
  // 1) Opfer entfernen
  sacrificeByUid(fromCardUid);

  // 2) Ziel finden & leveln
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

/** Reines Level-Up per uid (optional) */
export function levelUp(cardUid, delta = 1) {
  const all = [GameState.hand, GameState.deck, GameState.discard];
  for (const arr of all) {
    const c = arr.find(x => x.uid === cardUid);
    if (c) { c.level = Math.max(1, (c.level || 1) + delta); return { ok: true, level: c.level }; }
  }
  return { ok: false };
}

// ==============================
// Karte spielen / platzieren
// ==============================

/**
 * Karte spielen.
 * - ohne targetNodeId: Sofort-Effekt (wirkt direkt auf den Helden)
 * - mit  targetNodeId: als „Falle/Zone“ auf der Map platzieren
 * In beiden Fällen: Instanz verlässt Hand und geht zurück ins Deck (rotierendes Deck).
 */
export function playCard(inst, targetNodeId = null) {
  // 1) Template holen & Kosten bezahlen
  const t = inst.tplId ? tplById(inst.tplId) : inst; // Fail-safe: falls doch Template übergeben
  const cost = t.cost ?? 0;
  if (GameState.energy < cost) return { ok: false, log: `Nicht genug Energie` };
  GameState.energy -= cost;

  // 2) Platzieren auf Node
  if (targetNodeId) {
    placeOnNode(inst, targetNodeId);
    // Instanz aus Hand nehmen & zurück ins Deck
    GameState.hand = GameState.hand.filter(c => c.uid !== inst.uid);
    returnToDeck(inst);
    return { ok: true, log: `${t.name} wurde auf Feld platziert.` };
  }

  // 3) Sofort-Effekt (vereinfacht, typisches Set an Effekten)
  const h = GameState.hero;
  const k = t.effect?.kind;
  const val = Math.max(1, Math.floor(scaledValue(inst)));

  if (k === "damage" || k === "aoe_damage") {
    h.hp = clamp(h.hp - val, 0, h.maxHp);
    log(`${t.name} trifft für ${val}.`);
  } else if (k === "dot" || k === "bleed") {
    h.dots.push({ dmg: val, days: 3 });
    log(`${t.name} DoT ${val} für 3T.`);
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
    h.maxHp = Math.max(1, h.maxHp - d); h.hp = Math.min(h.hp, h.maxHp);
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

  // 4) Instanz aus Hand & zurück ins Deck (rotierend)
  GameState.hand = GameState.hand.filter(c => c.uid !== inst.uid);
  returnToDeck(inst);
  return { ok: true };
}

/** Karte/Instanz als „Falle/Zone“ auf Node legen (Snapshot für Field-Trigger). */
export function placeOnNode(inst, nodeId) {
  const t = tplById(inst.tplId);
  const list = GameState.placed.get(nodeId) || [];
  list.push({
    uid: uid(),             // placement-id, NICHT die inst.uid!
    instUid: inst.uid,      // referenz auf die Instanz (falls du später zurückfinden willst)
    tplId: inst.tplId,      // Vorlage
    level: inst.level,      // Level zum Zeitpunkt des Platzierens
    once: true,             // einfache Falle: einmal auslösen → weg
    createdDay: GameState.day
  });
  GameState.placed.set(nodeId, list);
  log(`Platziert: ${t.name}`);
}

// ==============================
// Feld-Trigger
// ==============================

/** Löst alle platzierten Karten auf einem Node aus. */
export function triggerNode(nodeId) {
  const entries = GameState.placed.get(nodeId);
  if (!entries || !entries.length) return;

  const h = GameState.hero;
  const keep = [];

  entries.forEach(p => {
    const t = tplById(p.tplId);
    // temporäre "virtuelle" Instanz für die Berechnung (Level zum Platzierzeitpunkt)
    const v = { tplId: p.tplId, level: p.level };
    const k = t.effect?.kind;
    const val = Math.max(1, Math.floor(scaledValue(v)));

    if (k === "damage" || k === "aoe_damage") {
      h.hp = clamp(h.hp - val, 0, h.maxHp);
      log(`<b>Falle</b> ${t.name} trifft für ${val}.`);
    } else if (k === "dot" || k === "bleed") {
      h.dots.push({ dmg: val, days: 3 });
      log(`<b>Zone</b> ${t.name} – DoT ${val} für 3T.`);
    } else if (k === "freeze_days" || k === "slow_move_days") {
      const d = Math.max(1, Math.round(scaledValue(v)));
      if (k === "freeze_days") h.status.frozenDays = (h.status.frozenDays || 0) + d;
      else h.status.slowDays = (h.status.slowDays || 0) + d;
      log(`<b>Kontrolle</b> ${t.name} – ${d}T.`);
    } else {
      // Fallback: „als Sofortkarte behandeln“ (selten nötig)
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
