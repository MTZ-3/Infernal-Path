// src/game/cards/cards.js
// ============================================================================
// Karten-Engine (instanzbasiert)
// ----------------------------------------------------------------------------
// - Templates in einer Library (TPL)
// - Deck/Hand bestehen aus Instanzen { uid, tplId, level }
// - Karten werden (meist) nach dem Spielen ins Deck zurückgemischt
// - Opferung entfernt Instanzen endgültig
//
// DEINE REGELN (aktuell):
// - Dorf/Dungeon: chance_event mit 2 Outcomes (playerWin / heroWin)
// - Auf Dorf/Dungeon-Feld darf nur 1 Karte liegen
// - Fallen/Zone lösen beim Betreten aus (triggerNode)
// ============================================================================

import { GameState, uid, clamp } from "../core/gameState.js";
import { runActions, onChanceEventResolved } from "../effects/effects.js";

// ==============================
// Element-Logik (Held Resists/Weak)
// ==============================

export function elementalFactorFor(hero, element) {
  if (!hero || !element) return 1;

  // Immun check
  const immune = hero.status?.immuneElements || [];
  if (immune.includes(element)) return 0;

  let f = 1;
  if (hero.weakElement && hero.weakElement === element) f *= 2;
  if (hero.strongElement && hero.strongElement === element) f *= 0.5;
  return f;
}


function computeFinalDamage(base, element, cardOrInst = null) {
  const h = GameState.hero;
  const pass = computePassiveBonuses();

  let dmg = Math.max(0, Math.round(base));

  // Element-Faktor (weak/resist/immune)
  let factor = elementalFactorFor(h, element);
  if (cardOrInst) factor *= elementDamageMultiplier(cardOrInst);

  // passive: element bonus
  if (element && pass.elemPct[element]) factor *= (1 + pass.elemPct[element] / 100);

  // passive: per-element bonus (zählt Elemente der Karte)
  if (cardOrInst) {
    const t = cardOrInst?.tplId ? tplById(cardOrInst.tplId) : cardOrInst;
    const nElems = (t?.elements || []).length;
    if (nElems > 0 && pass.perElementPct) factor *= (1 + (pass.perElementPct * nElems) / 100);
  }

  // passive: low hp bonus (mehr Schaden, wenn Held low)
  if (h && h.maxHp > 0) {
    const hpRatio = (h.hp ?? 0) / h.maxHp;
    if (hpRatio <= pass.lowHpThreshold && pass.lowHpDamagePct) {
      factor *= (1 + pass.lowHpDamagePct / 100);
    }
  }

  // status: vuln/resist (additiv als DamageTaken-Mod)
  const vuln = h?.status?.vuln?.pct || 0;
  const resist = h?.status?.resist?.pct || 0;
  factor *= (1 + vuln / 100);
  factor *= (1 - resist / 100);

  // status: trap_buff (nur einmalig, wird beim Trigger konsumiert – das machen wir unten)
  // -> hier NICHT pauschal, sondern im Trigger

  const final = Math.max(0, Math.round(dmg * factor));
  return final;
}

function elementDamageMultiplier(_cardOrInst) {
  return 1;
}

function computeElementalDamage(base, element, cardOrInst = null) {
  const h = GameState.hero;
  let factor = elementalFactorFor(h, element);
  if (cardOrInst) factor *= elementDamageMultiplier(cardOrInst);
  return Math.max(0, Math.round(base * factor));
}

function logElementHit(label, base, final, element) {
  const elemTxt = element ? ` (${element})` : "";
  if (final === base) log(`${label}: ${final} Schaden${elemTxt}.`);
  else log(`${label}: ${base}→${final} Schaden${elemTxt}.`);
}

// ==============================
// Library / Meta
// ==============================

const TPL = new Map();

export function setCardLibrary(list) {
  TPL.clear();
  (list || []).forEach((t) => TPL.set(t.id, t));
}

function tplById(tplId) {
  const t = TPL.get(tplId);
  if (!t) throw new Error(`[cards] Unbekannte Vorlage: ${tplId}`);
  return t;
}

export function templateView(tplId) {
  return tplById(tplId);
}

// Dein map.js importiert das noch. Da es keine Heldkarten mehr gibt,
// exportieren wir es als "immer false" (Crashfix).
export function isHeroCard(_inst) {
  return false;
}

// ==============================
// Instanzen
// ==============================

export function newInstance(tplId, level = 1) {
  return { uid: uid(), tplId, level };
}

export function instView(inst) {
  const t = tplById(inst.tplId);
  return { ...t, uid: inst.uid, level: inst.level, tplId: inst.tplId };
}

// ==============================
// Skalierung (linear / log / cap)
// ==============================

export function scaledValue(cardOrInst) {
  const t = cardOrInst?.tplId ? tplById(cardOrInst.tplId) : cardOrInst;
  const level = cardOrInst?.level || 1;

  const e = t.effect || { base: 0, growth: 0, scaleType: "linear" };

  if (e.scaleType === "log") {
    const cap = e.cap ?? Infinity;
    const val = (e.base || 0) + Math.log1p(Math.max(0, level - 1)) * (e.growth || 0);
    return Math.min(val, cap);
  }

  // linear
  return (e.base || 0) + (level - 1) * (e.growth || 0);
}

// ==============================
// Passive-Boni (Kompatibilität)
// ==============================
// Falls du passive Karten im Deck hast, die z.B. mehr Draw/Energy geben.
// Du kannst hier später neue passive kinds hinzufügen.
export function computePassiveBonuses() {
  const all = [GameState.deck, GameState.hand, GameState.discard];

  const out = {
    drawBonus: 0,
    energyBonus: 0,

    
    soulsGainPct: 0,
    dotPct: 0,
    dotDaysBonus: 0,
    lowHpDamagePct: 0,
    lowHpThreshold: 0.3,

    elemPct: { feuer:0, eis:0, blut:0, schatten:0, natur:0, licht:0 },
    perElementPct: 0,

    sacrificeLevelBonus: 0,
    shopSlotsBonus: 0,
    freeRerollBonus: 0,

    revealTraitsPerDay: 0,
  };

  for (const arr of all) {
    for (const inst of arr) {
      if (!inst?.tplId) continue;
      const t = tplById(inst.tplId);
      if (t.type !== "passiv") continue;

      const kind = t.effect?.kind;
      const val = Math.max(0, Math.round(scaledValue(inst)));

      if (kind === "passive_draw") out.drawBonus += val;
      else if (kind === "passive_energy") out.energyBonus += val;

      else if (kind === "passive_souls_pct") out.soulsGainPct += val;
      else if (kind === "passive_dot_pct") out.dotPct += val;
      else if (kind === "passive_dot_days") out.dotDaysBonus += val;

      else if (kind === "passive_lowhp_taken_pct") {
        out.lowHpDamagePct += val;
        out.lowHpThreshold = t.effect?.threshold ?? out.lowHpThreshold;
      }

      else if (kind === "passive_elem_pct") {
        const el = t.effect?.element;
        if (el && out.elemPct[el] != null) out.elemPct[el] += val;
      }

      else if (kind === "passive_per_element_pct") {
        out.perElementPct += val;
      }

      else if (kind === "passive_sacrifice_level") out.sacrificeLevelBonus += val;
      else if (kind === "passive_shop_slots") out.shopSlotsBonus += val;
      else if (kind === "passive_free_reroll") out.freeRerollBonus += val;

      else if (kind === "passive_reveal") out.revealTraitsPerDay += val;
    }
  }

  return out;
}


// ==============================
// Logging-Hook (UI)
// ==============================

let _logCb = null;
export function bindLogger(fn) {
  _logCb = fn;
}
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
// Hand neu ziehen (Redraw)
// ==============================

export function redrawHand() {
  const s = GameState;
  const prevCount = s.hand.length;

  if (prevCount === 0) return { ok: false, log: "Keine Karten in der Hand zum Neu-Mischen." };
  if (s.energy <= 0) return { ok: false, log: "Nicht genug Energie (benötigt 1)." };

  s.deck.push(...s.hand);
  s.hand = [];
  s.deck = shuffle(s.deck);
  s.energy -= 1;

  let drawn = 0;
  for (let i = 0; i < prevCount; i++) {
    if (!s.deck.length) break;
    s.hand.push(s.deck.pop());
    drawn++;
  }

  log(`<span class="small muted">Hand neu gemischt: ${drawn} Karten, Energie jetzt ${s.energy}.</span>`);
  return { ok: true };
}

// ==============================
// Opferung & Level-Up
// ==============================

export function sacrificeByUid(cardUid) {
  const remove = (arr) => {
    const i = arr.findIndex((c) => c.uid === cardUid);
    if (i >= 0) arr.splice(i, 1);
  };
  remove(GameState.hand);
  remove(GameState.deck);
  remove(GameState.discard);
  return { ok: true };
}

export function levelUp(cardUid, delta = 1) {
  const all = [GameState.hand, GameState.deck, GameState.discard];
  for (const arr of all) {
    const c = arr.find((x) => x.uid === cardUid);
    if (c) {
      c.level = Math.max(1, (c.level || 1) + delta);
      return { ok: true, level: c.level };
    }
  }
  return { ok: false };
}

// ==============================
// Chance / Reveal / Actions
// ==============================

function clampChance(x, min = 5, max = 95) {
  return Math.max(min, Math.min(max, Math.round(x)));
}

function rollChancePct(pct) {
  return Math.random() * 100 < pct;
}

function clampPct01(x) {
  return Math.max(0, Math.min(100, Math.round(x)));
}

function revealRandomHeroTraits(n = 1) {
  const h = GameState.hero;
  if (!h) return;

  h.revealed = h.revealed || {};

  const pool = [
    { key: "strongElement", label: "Starkes Element", value: () => h.strongElement },
    { key: "weakElement", label: "Schwaches Element", value: () => h.weakElement },
    { key: "ability", label: "Spezialfähigkeit", value: () => h.abilityName || h.passives?.[0]?.id || "???" },
    { key: "maxHp", label: "MaxHP", value: () => h.maxHp },
    { key: "speed", label: "Speed", value: () => h.speed || h.baseSpeed || 1 },
    { key: "level", label: "Level", value: () => h.level ?? (GameState.round ?? 1) },
  ];

  const hidden = pool.filter((t) => !h.revealed[t.key]);
  if (!hidden.length) {
    log(`<span class="small muted">👁️ Nichts mehr aufzudecken.</span>`);
    return;
  }

  for (let i = 0; i < n; i++) {
    const stillHidden = pool.filter((t) => !h.revealed[t.key]);
    if (!stillHidden.length) break;

    const pick = stillHidden[Math.floor(Math.random() * stillHidden.length)];
    h.revealed[pick.key] = true;
    log(`<span class="small">👁️ Aufgedeckt: <b>${pick.label}</b> → ${pick.value()}</span>`);
  }
}

export function revealTraits(n=1){ revealRandomHeroTraits(n); }

/**
 * Supported action kinds:
 * - gain_souls   { amount }
 * - lose_souls   { amount }
 * - damage_flat  { amount, element? }
 * - damage_pct   { pct, element? }   // % von MaxHP
 * - heal_pct     { pct }
 * - freeze_days  { days }
 * - reveal_trait { count }
 */
function applyActions(actions) {
  const h = GameState.hero;
  if (!h) return;

  for (const a of actions || []) {
    if (!a?.kind) continue;


    if (a.kind === "gain_souls") {
      const amt = Math.max(0, Math.round(a.amount ?? 0));
      GameState.souls += amt;
      log(`<span class="soul">+${amt} Seelen</span>`);
    } else if (a.kind === "lose_souls") {
      const amt = Math.max(0, Math.round(a.amount ?? 0));
      GameState.souls = Math.max(0, (GameState.souls || 0) - amt);
      log(`<span class="small muted">-${amt} Seelen</span>`);
    } else if (a.kind === "damage_flat") {
      const amt = Math.max(0, Math.round(a.amount ?? 0));
      const element = a.element ?? null;
      const final = computeElementalDamage(amt, element);
      h.hp = clamp(h.hp - final, 0, h.maxHp);
      logElementHit(`<b>Event</b> Schaden`, amt, final, element);
    } else if (a.kind === "damage_pct") {
      const pct = clampPct01(a.pct ?? 0);
      const raw = Math.max(0, Math.round(h.maxHp * (pct / 100)));
      const element = a.element ?? null;
      const final = computeElementalDamage(raw, element);
      h.hp = clamp(h.hp - final, 0, h.maxHp);
      logElementHit(`<b>Event</b> ${pct}% Schaden`, raw, final, element);
    } else if (a.kind === "heal_pct") {
      const pct = clampPct01(a.pct ?? 0);
      const heal = Math.max(0, Math.round(h.maxHp * (pct / 100)));
      h.hp = clamp(h.hp + heal, 0, h.maxHp);
      log(`<span class="small">Heilung: +${heal} HP</span>`);
    } else if (a.kind === "freeze_days") {
      const days = Math.max(1, Math.round(a.days ?? 1));
      h.status = h.status || {};
      h.status.frozenDays = (h.status.frozenDays || 0) + days;
      log(`<span class="small">❄️ Eingefroren: ${days} Tag(e)</span>`);
    } else if (a.kind === "reveal_trait") {
      const count = Math.max(1, Math.round(a.count ?? 1));
      revealRandomHeroTraits(count);
    } else {
      log(`<span class="small muted">Unbekannte Action: ${a.kind}</span>`);
    }
  }
}

// ==============================
// Karte spielen / platzieren
// ==============================
// Regel: alle Karten müssen auf ein Feld gespielt werden.

export function playCard(inst, targetNodeId) {
  const t = tplById(inst.tplId);
  const cost = t.cost ?? 0;

  if (GameState.energy < cost) return { ok: false, log: `Nicht genug Energie (${cost} nötig).` };
  if (!targetNodeId) return { ok: false, log: "Diese Karte muss auf ein Feld gespielt werden." };

  // Platzierung prüfen (Dorf/Dungeon nur 1 Karte)
  const placed = placeOnNode(inst, targetNodeId);
  if (!placed.ok) return { ok: false, log: placed.log };

  GameState.energy -= cost;

  // Hand entfernen + zurück ins Deck
  GameState.hand = GameState.hand.filter((c) => c.uid !== inst.uid);
  returnToDeck(inst);

  return { ok: true, log: `${t.name} wurde auf dem Feld platziert.` };
}

// Dorf/Dungeon nur 1 Karte insgesamt
export function placeOnNode(inst, nodeId) {
  const t = tplById(inst.tplId);

  const node = GameState.map?.nodes?.find((n) => n.id === nodeId);
  const isVillageOrDungeon = node?.kind === "village" || node?.kind === "dungeon";

  const existing = GameState.placed.get(nodeId) || [];
  if (isVillageOrDungeon && existing.length > 0) {
    const msg = "Auf Dorf/Dungeon ist nur 1 Karte erlaubt.";
    log(`<span class="small muted">${t.name}: ${msg}</span>`);
    return { ok: false, log: msg };
  }

  existing.push({
    uid: uid(),
    instUid: inst.uid,
    tplId: inst.tplId,
    level: inst.level,
    once: true,
    createdDay: GameState.day,
  });

  GameState.placed.set(nodeId, existing);
  log(`Platziert: ${t.name}`);
  return { ok: true };
}

// ==============================
// Feld-Trigger
// ==============================

export function triggerNode(nodeId) {
  const entries = GameState.placed.get(nodeId);
  if (!entries || !entries.length) return;

  const h = GameState.hero;
  if (!h) return;

  h.dots = Array.isArray(h.dots) ? h.dots : [];
  h.status = h.status || {};

  const keep = [];

  for (const p of entries) {
    const t = tplById(p.tplId);

    // ---- Dorf/Dungeon: chance_event ----
    if (t.type === "dorf" || t.type === "dungeon") {
      const heroLvl = GameState.hero?.level ?? (GameState.round ?? 1);
      const cardLvl = p.level ?? 1;
      const pct = clampChance(50 + (cardLvl - heroLvl) * 10);

      if (t.effect?.kind !== "chance_event") {
        log(`<span class="small muted">${t.name}: (keine chance_event Definition)</span>`);
      } else {
        const playerWins = rollChancePct(pct);
        const outcome = playerWins ? t.effect.playerWin : t.effect.heroWin;

        const label = playerWins ? "Du gewinnst" : "Held gewinnt";
        const rollTxt = `Chance ${pct}% • Karte L${cardLvl} vs Held L${heroLvl}`;

        log(`<b>${t.name}</b> – ${label} <span class="small muted">(${rollTxt})</span>`);
        if (outcome?.text) log(`<span class="small">${outcome.text}</span>`);
        applyActions(outcome?.actions || []);
        onChanceEventResolved({
        winner: playerWins ? "player" : "hero"
        });
      }

      if (!p.once) keep.push(p);
      continue;
    }

    // ---- Fallen / Zonen ----
    const v = { tplId: p.tplId, level: p.level };
    const kind = t.effect?.kind;

    const baseVal = Math.max(1, Math.floor(scaledValue(v)));
    const element = (t.elements && t.elements[0]) || null;

    const hstatus = h.status || (h.status = {});
    const mult = Math.max(1, hstatus.nextTrapMult || 1);
    const bonusPct = Math.max(0, hstatus.nextTrapBonusPct || 0);

    // helper: einmalig buff verbrauchen
    const consumeTrapBuff = () => {
      hstatus.nextTrapMult = 1;
      hstatus.nextTrapBonusPct = 0;
    };

    const applyTrapDamageOnce = (rawBase) => {
      // trap_buff Bonus (einmalig) auf die nächste Falle anwenden
      let raw = rawBase;
      if (bonusPct > 0) raw = Math.round(raw * (1 + bonusPct / 100));

      const final = computeFinalDamage(raw, element, v);
      h.hp = clamp(h.hp - final, 0, h.maxHp);
      logElementHit(`<b>Falle</b> ${t.name}`, raw, final, element);
      return final;
    };

    const applyTrapDotOnce = (rawBase, days) => {
      // passive dot bonuses
      const pass = computePassiveBonuses();
      let dmg = rawBase;
      if (pass.dotPct) dmg = Math.round(dmg * (1 + pass.dotPct / 100));
      const dDays = Math.max(1, days + (pass.dotDaysBonus || 0));

      // trap_buff Bonus
      if (bonusPct > 0) dmg = Math.round(dmg * (1 + bonusPct / 100));

      h.dots.push({ dmg, days: dDays, element });
      log(`<b>Zone</b> ${t.name} – DoT ${dmg} für ${dDays}T${element ? ` (${element})` : ""}.`);
    };

    if (kind === "trap_buff") {
      // verstärkt nächste Falle
      const pct = Math.max(0, Math.round(scaledValue(v)));
      hstatus.nextTrapBonusPct = (hstatus.nextTrapBonusPct || 0) + pct;
      log(`<span class="small">🜏 ${t.name}: nächste Falle +${pct}%</span>`);
      continue;
    }

    // alles andere: ggf. mehrfach auslösen ("betrunken")
    for (let i = 0; i < mult; i++) {
      if (kind === "damage" || kind === "aoe_damage") {
        applyTrapDamageOnce(baseVal);
      }

      else if (kind === "multi_hit") {
        const hits = Math.max(1, Math.round(t.effect?.hits ?? 2));
        for (let k = 0; k < hits; k++) applyTrapDamageOnce(baseVal);
      }

      else if (kind === "dot" || kind === "bleed") {
        const days = Math.max(1, Math.round(t.effect?.days ?? 2));
        applyTrapDotOnce(baseVal, days);
      }

      else if (kind === "delayed_blast") {
        const delay = Math.max(1, Math.round(t.effect?.delayDays ?? 1));
        hstatus.delayed = Array.isArray(hstatus.delayed) ? hstatus.delayed : [];
        hstatus.delayed.push({ dmg: baseVal, daysLeft: delay, element });
        log(`<span class="small">⏳ ${t.name}: Explosion in ${delay} Tag(en)</span>`);
      }

      else if (kind === "damage_plus_souls") {
        // damage + souls
        const soulsBase = Math.max(0, Math.round(t.effect?.soulsBase ?? 0));
        const soulsGrowth = Math.max(0, Number(t.effect?.soulsGrowth ?? 0));
        const souls = Math.max(0, Math.round(soulsBase + (v.level - 1) * soulsGrowth));

        applyTrapDamageOnce(baseVal);

        const pass = computePassiveBonuses();
        const gained = Math.round(souls * (1 + pass.soulsGainPct / 100));
        GameState.souls += gained;
        log(`<span class="soul">+${gained} Seelen</span>`);
      }

      else if (kind === "kill_bonus_souls") {
        // gibt Souls nur, wenn Held durch diesen Trigger stirbt
        const before = h.hp;
        applyTrapDamageOnce(baseVal);
        if (before > 0 && h.hp <= 0) {
          const souls = Math.max(0, Math.round(t.effect?.base ?? 0));
          const pass = computePassiveBonuses();
          const gained = Math.round(souls * (1 + pass.soulsGainPct / 100));
          GameState.souls += gained;
          log(`<span class="soul">☠️ Tod-Bonus: +${gained} Seelen</span>`);
        }
      }

      else {
        log(`<span class="small muted">${t.name}: Effekt-kind "${kind}" ist nicht implementiert.</span>`);
      }
    }

    // einmalige Buffs nach dem Trap-Trigger verbrauchen
    consumeTrapBuff();


    if (kind === "damage" || kind === "aoe_damage") {
      const element = (t.elements && t.elements[0]) || null;
      const final = computeElementalDamage(base, element, v);
      h.hp = clamp(h.hp - final, 0, h.maxHp);
      logElementHit(`<b>Falle</b> ${t.name}`, base, final, element);
    } else if (kind === "dot" || kind === "bleed") {
      const element = (t.elements && t.elements[0]) || null;
      h.dots.push({ dmg: base, days: 3, element });
      log(`<b>Zone</b> ${t.name} – DoT ${base} für 3T${element ? ` (${element})` : ""}.`);
    } else if (kind === "gain_souls") {
      const n = Math.max(0, Math.round(base));
      GameState.souls += n;
      log(`<span class="soul">+${n} Seelen</span>`);
    } else {
      log(`<span class="small muted">${t.name}: Effekt-kind "${kind}" ist nicht implementiert.</span>`);
    }

    if (!p.once) keep.push(p);
  }

  if (keep.length) GameState.placed.set(nodeId, keep);
  else GameState.placed.delete(nodeId);
}

// ==============================
// Optional: Validator (Debug)
// ==============================

export function validateCardLibrary() {
  const issues = [];
  for (const [id, t] of TPL.entries()) {
    if (!t?.id || t.id !== id) issues.push(`[${id}] id mismatch`);
    if (!t?.name) issues.push(`[${id}] missing name`);
    if (!t?.type) issues.push(`[${id}] missing type`);
    if (!t?.effect?.kind) issues.push(`[${id}] missing effect.kind`);

    if (t.type !== "passiv") {
      if (!Array.isArray(t.elements) || t.elements.length < 1) {
        issues.push(`[${id}] non-passive must have at least 1 element`);
      }
    } else {
      if (Array.isArray(t.elements) && t.elements.length > 0) {
        issues.push(`[${id}] passive should have no elements`);
      }
    }

    if (t.effect?.kind === "chance_event") {
      if (!t.effect.playerWin || !t.effect.heroWin) issues.push(`[${id}] chance_event missing playerWin/heroWin`);
      if (!Array.isArray(t.effect?.playerWin?.actions)) issues.push(`[${id}] playerWin.actions missing`);
      if (!Array.isArray(t.effect?.heroWin?.actions)) issues.push(`[${id}] heroWin.actions missing`);
    }
  }

  if (issues.length) {
    console.groupCollapsed(`%c[CardValidator] ${issues.length} issue(s)`, "color:#fca5a5;font-weight:bold");
    issues.forEach((x) => console.warn(x));
    console.groupEnd();
  } else {
    console.log("%c[CardValidator] OK", "color:#86efac;font-weight:bold");
  }

  return issues;
}

export function sacrifice(fromCardUid, toCardUid) {
  sacrificeByUid(fromCardUid);

  const findByUid = (id) =>
    GameState.hand.find((c) => c.uid === id) ||
    GameState.deck.find((c) => c.uid === id) ||
    GameState.discard.find((c) => c.uid === id);

  const target = findByUid(toCardUid);
  if (!target) return { ok: false };

  const pass = computePassiveBonuses();
  const bonus = Math.max(0, pass.sacrificeLevelBonus || 0);

  target.level = (target.level || 1) + 1 + bonus;

  log(`<span class="k">Level-Up</span>: uid=${toCardUid} → L${target.level}`);
  return { ok: true };
}

