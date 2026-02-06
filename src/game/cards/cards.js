// src/game/cards/cards.js
// ============================================================================
// Karten-Engine (instanzbasiert)
// - Templates in Library (TPL)
// - Deck/Hand bestehen aus Instanzen { uid, tplId, level }
// - triggerNode führt Fallen + chance_event aus
// ============================================================================

import { GameState, uid, clamp, HAND_LIMIT } from "../core/gameState.js";
import { onChanceEventResolved, applyEffect } from "../effects/effects.js";
import { applyDamage, applyHeal, heroHasItem, giveHeroRandomItem } from "../hero/hero.js";

// ==============================
// Element-Faktor (weak/resist/immune)
// ==============================

export function elementalFactorFor(hero, element) {
  if (!hero || !element) return 1;

  const immune = hero.status?.immuneElements || [];
  if (Array.isArray(immune) && immune.includes(element)) return 0;

  let f = 1;
  if (hero.weakElement === element) f *= 2;
  if (hero.strongElement === element) f *= 0.5;
  return f;
}

// ==============================
// Library
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

// kompat: keine Heldkarten mehr
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
// Skalierung
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

  return (e.base || 0) + (level - 1) * (e.growth || 0);
}

// ==============================
// Passive-Boni (aus Deck/Hand/Discard)
// ==============================

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

    elemPct: { feuer: 0, eis: 0, blut: 0, schatten: 0, natur: 0, licht: 0 },
    perElementPct: 0,

    sacrificeLevelBonus: 0,
    shopSlotsBonus: 0,
    freeRerollBonus: 0,

    revealTraitsPerDay: 0,
  };

  for (const arr of all) {
    for (const inst of arr || []) {
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

      else if (kind === "passive_per_element_pct") out.perElementPct += val;

      else if (kind === "passive_sacrifice_level") out.sacrificeLevelBonus += val;
      else if (kind === "passive_shop_slots") out.shopSlotsBonus += val;
      else if (kind === "passive_free_reroll") out.freeRerollBonus += val;

      else if (kind === "passive_reveal") out.revealTraitsPerDay += val;
    }
  }

  return out;
}

// ==============================
// Damage-Berechnung zentral (für Fallen/Events)
// ==============================

function computeFinalDamage(base, element, cardOrInst = null) {
  const h = GameState.hero;
  const pass = computePassiveBonuses();

  let dmg = Math.max(0, Math.round(base));
  let factor = elementalFactorFor(h, element);

  // passive: element bonus
  if (element && pass.elemPct?.[element]) {
    factor *= (1 + pass.elemPct[element] / 100);
  }

  // passive: per-element bonus (Elemente der Karte)
  if (cardOrInst) {
    const t = cardOrInst?.tplId ? tplById(cardOrInst.tplId) : cardOrInst;
    const nElems = (t?.elements || []).length;
    if (nElems > 0 && pass.perElementPct) {
      factor *= (1 + (pass.perElementPct * nElems) / 100);
    }
  }

  // passive: low hp bonus (mehr Schaden, wenn Held low)
  if (h && h.maxHp > 0) {
    const hpRatio = (h.hp ?? 0) / h.maxHp;
    if (hpRatio <= (pass.lowHpThreshold ?? 0.3) && pass.lowHpDamagePct) {
      factor *= (1 + pass.lowHpDamagePct / 100);
    }
  }

  // status: vuln/resist
  const vuln = h?.status?.vuln?.pct || 0;
  const resist = h?.status?.resist?.pct || 0;
  factor *= (1 + vuln / 100);
  factor *= (1 - resist / 100);

  return Math.max(0, Math.round(dmg * factor));
}

// ==============================
// Logger
// ==============================

let _logCb = null;
export function bindLogger(fn) {
  _logCb = fn;
}
const log = (msg) => _logCb?.(msg);

function logElementHit(label, base, final, element) {
  const elemTxt = element ? ` (${element})` : "";
  if (final === base) log(`${label}: ${final} Schaden${elemTxt}.`);
  else log(`${label}: ${base}→${final} Schaden${elemTxt}.`);
}

// ==============================
// Deck ziehen / mischen
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
    if (GameState.hand.length >= HAND_LIMIT) break;
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
    const i = arr.findIndex((c) => c.uid === cardUid);
    if (i >= 0) arr.splice(i, 1);
  };
  remove(GameState.hand);
  remove(GameState.deck);
  remove(GameState.discard);
  return { ok: true };
}

// Passiv darf geopfert werden, aber NICHT gelevelt werden.
export function sacrifice(fromCardUid, toCardUid) {
  sacrificeByUid(fromCardUid);

  const findByUid = (id) =>
    GameState.hand.find((c) => c.uid === id) ||
    GameState.deck.find((c) => c.uid === id) ||
    GameState.discard.find((c) => c.uid === id);

  const target = findByUid(toCardUid);
  if (!target) return { ok: false };

  const t = tplById(target.tplId);
  if (t.type === "passiv") {
    log(`<span class="small muted">Passiv-Karten können nicht gelevelt werden.</span>`);
    return { ok: true };
  }

  const pass = computePassiveBonuses();
  const bonus = Math.max(0, pass.sacrificeLevelBonus || 0);

  target.level = (target.level || 1) + 1 + bonus;
  log(`<span class="k">Level-Up</span>: uid=${toCardUid} → L${target.level}`);
  return { ok: true };
}

// ==============================
// Chance helpers
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

// ==============================
// Reveal (Traits)
// ==============================

function revealRandomHeroTraits(n = 1) {
  const h = GameState.hero;
  if (!h) return;

  h.revealed = h.revealed || {};

  const pool = [
    { key: "strongElement", label: "Starkes Element", value: () => h.strongElement },
    { key: "weakElement", label: "Schwaches Element", value: () => h.weakElement },
    { key: "ability", label: "Spezialfähigkeit", value: () => h.abilityName || h.abilityId || "???" },
    { key: "maxHp", label: "MaxHP", value: () => h.maxHp },
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

export function revealTraits(n = 1) {
  revealRandomHeroTraits(n);
}

// ==============================
// Actions aus chance_event outcomes (DEINE JSON)
// ==============================

const ELEMENTS = ["feuer", "eis", "blut", "schatten", "natur", "licht"];

function pickDistinctElements(count = 3) {
  const pool = [...ELEMENTS];
  const out = [];
  while (pool.length && out.length < count) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// meta: { node } damit ruin_village/ruin_dungeon das aktuelle Feld ändern kann
function applyActions(actions, meta = {}) {
  const h = GameState.hero;
  if (!h) return;

  GameState.mods = GameState.mods || {};
  h.status = h.status || {};
  h.dots = Array.isArray(h.dots) ? h.dots : [];

  for (const a of actions || []) {
    if (!a?.kind) continue;

    // --- Reveal / False info ---
    if (a.kind === "reveal") {
      const count = Math.max(1, Math.round(a.count ?? 1));
      revealRandomHeroTraits(count);
      continue;
    }

    if (a.kind === "false_info") {
      // zeigt absichtlich falsche Info (nur Text, keine echten revealed flags)
      const fake = [
        `👁️ Aufgedeckt: <b>Starkes Element</b> → ${ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)]}`,
        `👁️ Aufgedeckt: <b>Schwaches Element</b> → ${ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)]}`,
        `👁️ Aufgedeckt: <b>MaxHP</b> → ${Math.floor((h.maxHp || 1) * (0.6 + Math.random() * 0.8))}`,
      ];
      log(
        `<span class="small muted">${fake[Math.floor(Math.random() * fake.length)]} <i>(falsch)</i></span>`
      );
      continue;
    }

    // ✅ NEW: Effekte aus effects.de.json anwenden
    // action: { kind:"apply_effect", id:"gift", stacks?:1, days?:3 }
    if (a.kind === "apply_effect") {
      const id = a.id;
      const stacks = Math.max(1, Math.round(a.stacks ?? 1));
      const days = a.days != null ? Math.max(1, Math.round(a.days)) : null;

      if (!id) {
        log(`<span class="small muted">⚠️ apply_effect: fehlende id</span>`);
        continue;
      }

      const ok = applyEffect?.(id, { stacks, days });
      if (ok) {
        log(
          `<span class="small">✨ Effekt: <b>${id}</b>${stacks > 1 ? ` ×${stacks}` : ""}${
            days != null ? ` (${days}T)` : ""
          }</span>`
        );
      } else {
        log(`<span class="small muted">⚠️ Effekt nicht gefunden: ${id}</span>`);
      }
      continue;
    }

    // --- Map/Tile Änderungen ---
    if (a.kind === "ruin_village") {
      if (meta.node && (meta.node.kind === "village" || meta.node.kind === "visited_village")) {
        meta.node.kind = "ruined_village";
        log(`<span class="small">🏚️ Dorf zerstört.</span>`);
      }
      continue;
    }

    if (a.kind === "ruin_dungeon") {
      if (meta.node && (meta.node.kind === "dungeon" || meta.node.kind === "cleared_dungeon")) {
        meta.node.kind = "ruined_dungeon";
        log(`<span class="small">🕳️ Dungeon zerstört.</span>`);
      }
      continue;
    }

    // --- Souls / Shop penalty ---
    if (a.kind === "gain_souls") {
      const amt = Math.max(0, Math.round(a.amount ?? 0));
      GameState.souls = (GameState.souls || 0) + amt;
      log(`<span class="soul">+${amt} Seelen</span>`);
      continue;
    }

    if (a.kind === "shop_penalty") {
      const amt = Math.max(0, Math.round(a.amount ?? 0));
      GameState.mods.shopPenalty = (GameState.mods.shopPenalty || 0) + amt;
      log(`<span class="small muted">Shop: nächster Einkauf +${amt}.</span>`);
      continue;
    }

    // --- Schaden/Heal ---
    if (a.kind === "damage_flat") {
      const amt = Math.max(0, Math.round(a.amount ?? 0));
      const element = a.element ?? null;
      const final = computeFinalDamage(amt, element, null);
      const dealt = applyDamage(h, final, { type: "direct", element, source: "event" });
      logElementHit(`<b>Event</b> Schaden`, final, dealt, element);
      continue;
    }

    if (a.kind === "damage_pct") {
      const pct = clampPct01(a.pct ?? 0);
      const element = a.element ?? null;
      const base = Math.max(0, Math.round((h.maxHp || 0) * (pct / 100)));
      const final = computeFinalDamage(base, element, null);
      const dealt = applyDamage(h, final, { type: "direct", element, source: "event" });
      logElementHit(`<b>Event</b> ${pct}% Schaden`, final, dealt, element);
      continue;
    }

    if (a.kind === "heal_pct") {
      const pct = clampPct01(a.pct ?? 0);
      const heal = Math.max(0, Math.round((h.maxHp || 0) * (pct / 100)));
      const real = applyHeal(h, heal);
      log(`<span class="small">Heilung: +${real} HP</span>`);
      continue;
    }

    // --- Freeze ---
    if (a.kind === "freeze_days") {
      const days = Math.max(1, Math.round(a.days ?? 1));
      h.status.frozenDays = (h.status.frozenDays || 0) + days;
      log(`<span class="small">❄️ Eingefroren: ${days} Tag(e)</span>`);
      continue;
    }

    // --- Resist / Vuln (zeitlich) ---
    // (wenn du das künftig NUR über apply_effect machen willst,
    // kannst du diese beiden Cases später löschen)
    if (a.kind === "hero_resist_days") {
      const pct = Math.max(0, Math.round(a.pct ?? 0));
      const days = Math.max(1, Math.round(a.days ?? 1));
      h.status.resist = { pct, daysLeft: days };
      log(`<span class="small">🛡️ Resist: ${pct}% für ${days} Tag(e)</span>`);
      continue;
    }

    if (a.kind === "hero_vuln_days") {
      const pct = Math.max(0, Math.round(a.pct ?? 0));
      const days = Math.max(1, Math.round(a.days ?? 1));
      h.status.vuln = { pct, daysLeft: days };
      log(`<span class="small">💥 Verwundbar: +${pct}% für ${days} Tag(e)</span>`);
      continue;
    }

    // --- Immunity action ---
    if (a.kind === "immune_to_strong") {
      const els = pickDistinctElements(3);
      h.status.immuneElements = Array.isArray(h.status.immuneElements) ? h.status.immuneElements : [];
      for (const el of els) if (!h.status.immuneElements.includes(el)) h.status.immuneElements.push(el);
      log(`<span class="small">🧿 Immun gegen: ${els.join(", ")}</span>`);
      continue;
    }

    // --- MaxHP % change ---
    // (wenn du das künftig NUR über apply_effect machen willst,
    // kannst du maxhp_pct später löschen)
    if (a.kind === "maxhp_pct") {
      const pct = Math.round(a.pct ?? 0); // kann negativ sein
      const delta = Math.round((h.maxHp || 0) * (pct / 100));
      h.maxHp = Math.max(1, (h.maxHp || 1) + delta);
      h.hp = clamp(h.hp, 0, h.maxHp);
      log(`<span class="small">❤️ MaxHP ${pct}% (${delta >= 0 ? "+" : ""}${delta})</span>`);
      continue;
    }

    // --- Items / Block items ---
    // ✅ item_shield = gib RANDOM item(s)
    if (a.kind === "item_shield") {
      const stacks = Math.max(1, Math.round(a.stacks ?? 1));

      // blockItems respected
      if ((h.status.blockItemsDays || 0) > 0) {
        log(`<span class="small muted">🎒 Items blockiert: ${h.status.blockItemsDays} Tag(e)</span>`);
        continue;
      }

      // richtig: random item(s) aus items.de.json
      if (typeof giveHeroRandomItem === "function") {
        giveHeroRandomItem(h, stacks);
      } else if (typeof window.__giveHeroRandomItem === "function") {
        // fallback falls du es noch irgendwo hast
        for (let i = 0; i < stacks; i++) window.__giveHeroRandomItem();
      } else {
        log(`<span class="small muted">[Item-System fehlt: random item ×${stacks}]</span>`);
      }
      continue;
    }

    if (a.kind === "block_items") {
      const days = Math.max(1, Math.round(a.days ?? 1));
      h.status.blockItemsDays = Math.max(h.status.blockItemsDays || 0, days);
      log(`<span class="small muted">🎒 Items blockiert: ${days} Tag(e)</span>`);
      continue;
    }

    // --- DoT actions ---
    if (a.kind === "dot_clear") {
      const removed = h.dots.length;
      h.dots = [];
      log(`<span class="small">🩸 DoT entfernt (${removed})</span>`);
      continue;
    }

    if (a.kind === "dot_burst") {
      // "DoT sofort": einmalig sofort den aktuellen DoT-Schaden anwenden (ohne Tage zu reduzieren)
      let sum = 0;
      for (const d of h.dots) {
        const base = Math.max(0, Math.round(d.dmg || 0));
        const element = d.element ?? null;
        const final = computeFinalDamage(base, element, null);
        const dealt = applyDamage(h, final, { type: "dot", element, source: "dot_burst" });
        sum += dealt;
      }
      log(`<span class="small">🩸 DoT sofort: ${sum} Schaden</span>`);
      continue;
    }

    // --- Trap modifiers ---
    if (a.kind === "drunk_next_trap") {
      const mult = Math.max(2, Math.round(a.mult ?? 2));
      h.status.nextTrapMult = mult;
      log(`<span class="small">🍺 Betrunken: nächste Falle x${mult}</span>`);
      continue;
    }

    // --- next sacrifice bonus ---
    if (a.kind === "next_sacrifice_bonus") {
      const levels = Math.max(1, Math.round(a.levels ?? 1));
      GameState.mods.nextHandLevelBonus = (GameState.mods.nextHandLevelBonus || 0) + levels;
      log(`<span class="small">🩸 Nächste Runde: Hand +${levels} Level</span>`);
      continue;
    }

    // --- nothing ---
    if (a.kind === "nothing") {
      log(`<span class="small muted">… nichts passiert.</span>`);
      continue;
    }

    log(`<span class="small muted">Unbekannte Action: ${a.kind}</span>`);
  }
}


// ==============================
// Karte spielen / platzieren
// ==============================

export function playCard(inst, targetNodeId) {
  const t = tplById(inst.tplId);
  const cost = t.cost ?? 0;

  if (GameState.energy < cost) return { ok: false, log: `Nicht genug Energie (${cost} nötig).` };
  if (!targetNodeId) return { ok: false, log: "Diese Karte muss auf ein Feld gespielt werden." };

  const placed = placeOnNode(inst, targetNodeId);
  if (!placed.ok) return { ok: false, log: placed.log };

  GameState.energy -= cost;

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

  const node = GameState.map?.nodes?.find((n) => n.id === nodeId) || null;

  const keep = [];

  for (const p of entries) {
    const t = tplById(p.tplId);

    // ---- Dorf/Dungeon: chance_event ----
    if (t.type === "dorf" || t.type === "dungeon") {
      const heroLvl = GameState.hero?.level ?? (GameState.round ?? 1);
      const cardLvl = p.level ?? 1;
      let pct = clampChance(50 + (cardLvl - heroLvl) * 10);

      // (9) Helm der Wachsamkeit: Held gewinnt häufiger -> Player-Chance -15%
      if (heroHasItem(GameState.hero, "item_alert_helm")) {
        pct = clampChance(pct - 15);
      }

      if (t.effect?.kind !== "chance_event") {
        log(`<span class="small muted">${t.name}: (keine chance_event Definition)</span>`);
      } else {
        // Falls Held "cautious" ist, könntest du hier forced-fail einbauen.
        const playerWins = rollChancePct(pct);
        const outcome = playerWins ? t.effect.playerWin : t.effect.heroWin;

        log(
          `<b>${t.name}</b> – ${playerWins ? "Du gewinnst" : "Held gewinnt"} ` +
          `<span class="small muted">(Chance ${pct}%)</span>`
        );
        if (outcome?.text) log(`<span class="small">${outcome.text}</span>`);

        applyActions(outcome?.actions || [], { node, nodeId, tpl: t });

        onChanceEventResolved?.({ winner: playerWins ? "player" : "hero" });
      }

      if (!p.once) keep.push(p);
      continue;
    }

    // ---- Fallen / Zonen ----
    const v = { tplId: p.tplId, level: p.level };
    const kind = t.effect?.kind;
    const baseVal = Math.max(1, Math.floor(scaledValue(v)));
    const element = (t.elements && t.elements[0]) || null;

    const pass = computePassiveBonuses();
    const hstatus = h.status || (h.status = {});
    const mult = Math.max(1, hstatus.nextTrapMult || 1);
    const bonusPct = Math.max(0, hstatus.nextTrapBonusPct || 0);

    const consumeTrapBuff = () => {
      hstatus.nextTrapMult = 1;
      hstatus.nextTrapBonusPct = 0;
    };

    const applyTrapDamageOnce = (rawBase) => {
      let raw = rawBase;
      if (bonusPct > 0) raw = Math.round(raw * (1 + bonusPct / 100));

      const final = computeFinalDamage(raw, element, v);
      const isAoE = (kind === "aoe_damage");
      const dealt = applyDamage(h, final, {
      type: "direct",
      isAoE,
      element,
      source: t.id,
      day: GameState.day
      });


      logElementHit(`<b>Falle</b> ${t.name}`, final, dealt, element);
      return dealt;
    };

    const applyTrapDotOnce = (rawBase, days) => {
      let dmg = rawBase;

      // passive dot bonuses
      if (pass.dotPct) dmg = Math.round(dmg * (1 + pass.dotPct / 100));
      const dDays = Math.max(1, days + (pass.dotDaysBonus || 0));

      // trap_buff Bonus
      if (bonusPct > 0) dmg = Math.round(dmg * (1 + bonusPct / 100));

      h.dots.push({ dmg, days: dDays, element });
      log(`<b>Zone</b> ${t.name} – DoT ${dmg} für ${dDays}T${element ? ` (${element})` : ""}.`);
    };

    if (kind === "trap_buff") {
      const pct = Math.max(0, Math.round(scaledValue(v)));
      hstatus.nextTrapBonusPct = (hstatus.nextTrapBonusPct || 0) + pct;
      log(`<span class="small">🜏 ${t.name}: nächste Falle +${pct}%</span>`);
      if (!p.once) keep.push(p);
      continue;
    }

    for (let i = 0; i < mult; i++) {
      if (kind === "damage" || kind === "aoe_damage") {
        applyTrapDamageOnce(baseVal);
      } else if (kind === "multi_hit") {
        const hits = Math.max(1, Math.round(t.effect?.hits ?? 2));
        for (let k = 0; k < hits; k++) applyTrapDamageOnce(baseVal);
      } else if (kind === "dot" || kind === "bleed") {
        const days = Math.max(1, Math.round(t.effect?.days ?? 2));
        applyTrapDotOnce(baseVal, days);
      } else if (kind === "delayed_blast") {
        const delay = Math.max(1, Math.round(t.effect?.delayDays ?? 1));
        hstatus.delayed = Array.isArray(hstatus.delayed) ? hstatus.delayed : [];
        hstatus.delayed.push({ dmg: baseVal, daysLeft: delay, element });
        log(`<span class="small">⏳ ${t.name}: Explosion in ${delay} Tag(en)</span>`);
      } else if (kind === "damage_plus_souls") {
        const soulsBase = Math.max(0, Math.round(t.effect?.soulsBase ?? 0));
        const soulsGrowth = Math.max(0, Number(t.effect?.soulsGrowth ?? 0));
        const souls = Math.max(0, Math.round(soulsBase + (v.level - 1) * soulsGrowth));

        applyTrapDamageOnce(baseVal);

        const gained = Math.round(souls * (1 + pass.soulsGainPct / 100));
        GameState.souls += gained;
        log(`<span class="soul">+${gained} Seelen</span>`);
      } else if (kind === "kill_bonus_souls") {
        const before = h.hp;
        applyTrapDamageOnce(baseVal);
        if (before > 0 && h.hp <= 0) {
          const souls = Math.max(0, Math.round(t.effect?.base ?? 0));
          const gained = Math.round(souls * (1 + pass.soulsGainPct / 100));
          GameState.souls += gained;
          log(`<span class="soul">☠️ Tod-Bonus: +${gained} Seelen</span>`);
        }
      } else {
        log(`<span class="small muted">${t.name}: Effekt-kind "${kind}" ist nicht implementiert.</span>`);
      }
    }

    consumeTrapBuff();

    if (!p.once) keep.push(p);
  }

  if (keep.length) GameState.placed.set(nodeId, keep);
  else GameState.placed.delete(nodeId);
}

// ==============================
// Optional: Validator
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
