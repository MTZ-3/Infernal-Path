// src/game/effects/effects.js
import { GameState, clamp } from "../core/gameState.js";



// -----------------------------
// Hero-Status Helpers
// -----------------------------
function ensureHeroStatus() {
  const h = GameState.hero;
  if (!h) return;
  h.status = h.status || {};
  h.status.frozenDays = h.status.frozenDays || 0;

  // temporäre Damage-Mods
  
  h.status.vuln = h.status.vuln || { pct: 0, daysLeft: 0 };
  h.status.resist = h.status.resist || { pct: 0, daysLeft: 0 };

  // Spezialzustände
  h.status.blockItemsDays = h.status.blockItemsDays || 0;
  h.status.immuneElements = h.status.immuneElements || []; // Array<string>
  h.status.nextTrapMult = h.status.nextTrapMult || 1;       // z.B. 2 wenn "betrunken"
  h.status.nextTrapBonusPct = h.status.nextTrapBonusPct || 0; // z.B. +15% auf nächste Falle

  // delayed blasts queue
  h.status.delayed = Array.isArray(h.status.delayed) ? h.status.delayed : [];
}

// Wird 1x pro endDay aufgerufen
export function tickHeroStatusOneDay() {
  const h = GameState.hero;
  if (!h) return;
  ensureHeroStatus();

  if (h.status.frozenDays > 0) h.status.frozenDays--;

  if ((h.status.vuln.daysLeft ?? 0) > 0) {
  h.status.vuln.daysLeft--;
  if (h.status.vuln.daysLeft <= 0) h.status.vuln.pct = 0;
  }
  if ((h.status.resist.daysLeft ?? 0) > 0) {
  h.status.resist.daysLeft--;
  if (h.status.resist.daysLeft <= 0) h.status.resist.pct = 0;
  }


  if (h.status.blockItemsDays > 0) h.status.blockItemsDays--;
}

// delayed blasts ticken + ggf. auslösen
export function tickDelayedBlastsOneDay(logFn) {
  const h = GameState.hero;
  if (!h) return;
  ensureHeroStatus();

  const keep = [];
  for (const d of h.status.delayed) {
    d.daysLeft = Math.max(0, (d.daysLeft ?? 0) - 1);
    if (d.daysLeft > 0) {
      keep.push(d);
      continue;
    }

    // explode now
    const base = Math.max(0, Math.round(d.dmg ?? 0));
    const elem = d.element ?? null;

    // final damage wird in cards.js berechnet (Element + Passives)
    // -> wir loggen hier nur, die tatsächliche Anwendung macht cards.js
    logFn?.(`<span class="small">💥 Verzögerte Explosion bereit: ${base}${elem ? ` (${elem})` : ""}</span>`);
    // Anwendung passiert dort, wo du es aufrufst (turns.js), weil dort computeFinalDamage bekannt ist
  }

  h.status.delayed = keep;
}

// -----------------------------
// Zentraler Action Runner (Chance-Events)
// -----------------------------
export function runActions(actions, ctx = {}) {
  const h = GameState.hero;
  if (!h) return;

  ensureHeroStatus();

  for (const a of actions || []) {
    if (!a?.kind) continue;

    // ---------- Meta / No-op ----------
    if (a.kind === "nothing") continue;

    // ---------- Existing (deine) ----------
    if (a.kind === "gain_souls") {
      const amt = Math.max(0, Math.round(a.amount ?? 0));
      GameState.souls = (GameState.souls || 0) + applySoulBonus(amt);
      ctx.log?.(`<span class="soul">+${amt} Seelen</span>`);
      continue;
    }

    if (a.kind === "lose_souls") {
      const amt = Math.max(0, Math.round(a.amount ?? 0));
      GameState.souls = Math.max(0, (GameState.souls || 0) - amt);
      ctx.log?.(`<span class="small muted">-${amt} Seelen</span>`);
      continue;
    }

    if (a.kind === "freeze_days") {
      const days = Math.max(1, Math.round(a.days ?? 1));
      h.status.frozenDays += days;
      ctx.log?.(`<span class="small">❄️ Eingefroren: ${days} Tag(e)</span>`);
      continue;
    }

    // ---------- NEW aus cards.de.json ----------
    if (a.kind === "reveal") {
      const count = Math.max(1, Math.round(a.count ?? 1));
      // revealRandomHeroTraits ist in cards.js – wir lassen ctx.revealHook reinreichen
      ctx.revealHook?.(count);
      continue;
    }

    if (a.kind === "false_info") {
      const count = Math.max(1, Math.round(a.count ?? 1));
      for (let i = 0; i < count; i++) {
        const fake = ["Starkes Element", "Schwaches Element", "Spezialfähigkeit", "MaxHP", "Speed"][
          Math.floor(Math.random() * 5)
        ];
        ctx.log?.(`<span class="small muted">👁️ (Falsche Info) ${fake}: ???</span>`);
      }
      continue;
    }

    if (a.kind === "ruin_village") {
      // ctx.nodeId wird vom Trigger mitgegeben
      ruinNodeKind(ctx.nodeId, "village", ctx.log);
      continue;
    }

    if (a.kind === "ruin_dungeon") {
      ruinNodeKind(ctx.nodeId, "dungeon", ctx.log);
      continue;
    }

    if (a.kind === "item_shield") {
      const stacks = Math.max(1, Math.round(a.stacks ?? 1));
      if (h.status.blockItemsDays > 0) {
        ctx.log?.(`<span class="small muted">🎒 Items blockiert (${h.status.blockItemsDays}T).</span>`);
        continue;
      }
      if (typeof window.__giveHeroRandomItem === "function") {
        for (let i = 0; i < stacks; i++) window.__giveHeroRandomItem();
      } else {
        ctx.log?.(`<span class="small muted">[Item-System fehlt: item_shield ×${stacks}]</span>`);
      }
      continue;
    }

    if (a.kind === "hero_resist_days") {
      const pct = Math.max(0, Math.round(a.pct ?? 0));
      const days = Math.max(1, Math.round(a.days ?? 1));
      h.status.resist = { pct, daysLeft: days };
      ctx.log?.(`<span class="small">🛡️ Resist: -${pct}% Schaden für ${days}T</span>`);
      continue;
    }

    if (a.kind === "hero_vuln_days") {
      const pct = Math.max(0, Math.round(a.pct ?? 0));
      const days = Math.max(1, Math.round(a.days ?? 1));
      h.status.vuln = { pct, daysLeft: days };
      ctx.log?.(`<span class="small">😨 Verwundbar: +${pct}% Schaden für ${days}T</span>`);
      continue;
    }

    if (a.kind === "shop_penalty") {
      const amt = Math.max(0, Math.round(a.amount ?? 0));
      GameState.mods = GameState.mods || {};
      GameState.mods.shopPenalty = (GameState.mods.shopPenalty || 0) + amt;
      ctx.log?.(`<span class="small muted">🛒 Nächster Einkauf +${amt} Seelen</span>`);
      continue;
    }

    if (a.kind === "immune_to_strong") {
      // Text sagt: immun gegen 3 zufällige Elemente
      const ELEMENTS = ["feuer", "eis", "blut", "schatten", "natur", "licht"];
      const pool = [...ELEMENTS].sort(() => Math.random() - 0.5);
      h.status.immuneElements = pool.slice(0, 3);
      ctx.log?.(`<span class="small">🧿 Immun: ${h.status.immuneElements.join(", ")}</span>`);
      continue;
    }

    if (a.kind === "drunk_next_trap") {
      const mult = Math.max(1, Math.round(a.mult ?? 2));
      h.status.nextTrapMult = Math.max(1, h.status.nextTrapMult) * mult;
      ctx.log?.(`<span class="small">🍺 Betrunken: nächste Falle ×${mult}</span>`);
      continue;
    }

    if (a.kind === "block_items") {
      const days = Math.max(1, Math.round(a.days ?? 1));
      h.status.blockItemsDays += days;
      ctx.log?.(`<span class="small muted">🎒 Items blockiert für ${days}T</span>`);
      continue;
    }

    if (a.kind === "dot_clear") {
      h.dots = [];
      ctx.log?.(`<span class="small">🩹 DoTs entfernt.</span>`);
      continue;
    }

    if (a.kind === "dot_burst") {
      // alle verbleibenden DoT-Ticks sofort auslösen (roh, final wird in turns.js berechnet)
      const dots = Array.isArray(h.dots) ? h.dots : [];
      let raw = 0;
      for (const d of dots) raw += Math.max(0, Math.round(d.dmg ?? 0)) * Math.max(0, Math.round(d.days ?? 0));
      h.dots = [];
      ctx.dotBurstHook?.(raw); // tatsächlicher Schaden wird dort angewendet
      continue;
    }

    if (a.kind === "next_sacrifice_bonus") {
      const levels = Math.max(1, Math.round(a.levels ?? 1));
      GameState.mods = GameState.mods || {};
      GameState.mods.nextHandLevelBonus = (GameState.mods.nextHandLevelBonus || 0) + levels;
      ctx.log?.(`<span class="small">🩸 Nächste Runde: Hand +${levels} Level</span>`);
      continue;
    }

    if (a.kind === "maxhp_pct") {
      const pct = Math.round(a.pct ?? 0);
      const delta = Math.round(h.maxHp * (pct / 100));
      h.maxHp = Math.max(1, h.maxHp + delta);
      h.hp = clamp(h.hp, 0, h.maxHp);
      ctx.log?.(`<span class="small">❤️ MaxHP ${pct}% (${delta >= 0 ? "+" : ""}${delta})</span>`);
      continue;
    }

    // unbekannt
    ctx.log?.(`<span class="small muted">Unbekannte Action: ${a.kind}</span>`);
  }
}

// Souls-Bonus (passiv_souls_pct) wird von cards.js über ctx gesetzt,
// aber wir machen hier einen safe default:
function applySoulBonus(x) {
  const pct = GameState.mods?.soulsGainPct || 0;
  const v = Math.max(0, Math.round(x));
  return Math.max(0, Math.round(v * (1 + pct / 100)));
}

function ruinNodeKind(nodeId, kind, logFn) {
  if (!nodeId) return;
  const n = GameState.map?.nodes?.find(x => x.id === nodeId);
  if (!n) return;
  if (kind === "village" && n.kind === "village") {
    n.kind = "ruined_village";
    logFn?.(`<span class="small muted">🏚 Dorf zerstört.</span>`);
  }
  if (kind === "dungeon" && n.kind === "dungeon") {
    n.kind = "ruined_dungeon";
    logFn?.(`<span class="small muted">⌖ Dungeon zerstört.</span>`);
  }
}

export function onChanceEventResolved({ winner }) {
  const h = GameState.hero;
  if (!h || !Array.isArray(h.effects)) return;

  for (const e of h.effects) {
    const def = EFFECTS.get(e.id);
    if (!def) continue;

    if (winner === "hero" && Array.isArray(def.onHeroWinEvent)) {
      runEffectActions(def.onHeroWinEvent, {
        stacks: e.stacks,
        effectId: e.id,
      });
    }

    if (winner === "player" && Array.isArray(def.onPlayerWinEvent)) {
      runEffectActions(def.onPlayerWinEvent, {
        stacks: e.stacks,
        effectId: e.id,
      });
    }
  }
}

// Tick: 1x pro Tag
export function tickEffectsOneDay() {
  const h = GameState.hero;
  if (!h || !Array.isArray(h.effects)) return;

  const keep = [];

  for (const e of h.effects) {
    const def = getDef(e.id);
    if (!def) continue;

    // permanent
    if (e.daysLeft == null) {
      keep.push(e);
      continue;
    }

    e.daysLeft = Math.max(0, (e.daysLeft ?? 0) - 1);

    if (e.daysLeft > 0) {
      keep.push(e);
    } else {
      // onExpire actions
      if (Array.isArray(def.onExpire)) runEffectActions(def.onExpire, { stacks: e.stacks, effectId: e.id });
    }
  }

  h.effects = keep;
}


let _logCb = null;

export function bindEffectLogger(fn) {
  _logCb = fn;
}

function log(m) {
  _logCb?.(m);
}


const EFFECTS = new Map();
export function setEffectLibrary(list) {
  EFFECTS.clear();
  (list || []).forEach(e => EFFECTS.set(e.id, e));
}

function getDef(id) {
  return EFFECTS.get(id);
}

function ensureEffects(hero) {
  hero.effects = Array.isArray(hero.effects) ? hero.effects : [];
  hero.status = hero.status || {};
  hero.dots = Array.isArray(hero.dots) ? hero.dots : [];
}

function pickDistinct(list, n) {
  const pool = [...list];
  const out = [];
  while (pool.length && out.length < n) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

function runEffectActions(actions, ctx = {}) {
  const h = GameState.hero;
  if (!h) return;

  ensureEffects(h);

  for (const a of actions || []) {
    if (!a?.kind) continue;

    if (a.kind === "set_vuln_pct") {
      h.status.vuln = h.status.vuln || {};
      h.status.vuln.pct = Math.max(0, Math.round(a.pct ?? 0));
      // daysLeft handled by effect timer, nicht hier
      continue;
    }

    if (a.kind === "set_resist_pct") {
      h.status.resist = h.status.resist || {};
      h.status.resist.pct = Math.max(0, Math.round(a.pct ?? 0));
      continue;
    }

    if (a.kind === "reduce_maxhp_pct") {
      const pct = Math.max(0, Math.round(a.pct ?? 0));
      const delta = Math.round(h.maxHp * (pct / 100));
      h.maxHp = Math.max(1, h.maxHp - delta);
      h.hp = clamp(h.hp, 0, h.maxHp + (h.status?.tempHp || 0));
      continue;
    }

    if (a.kind === "increase_maxhp_pct") {
      const pct = Math.max(0, Math.round(a.pct ?? 0));
      const delta = Math.round(h.maxHp * (pct / 100));
      h.maxHp = Math.max(1, h.maxHp + delta);
      h.hp = clamp(h.hp, 0, h.maxHp + (h.status?.tempHp || 0));
      continue;
    }

    if (a.kind === "next_trap_mult") {
      const mult = Math.max(1, Math.round(a.mult ?? 1));
      h.status.nextTrapMult = Math.max(1, h.status.nextTrapMult || 1) * mult;
      continue;
    }

    if (a.kind === "immune_random_elements") {
      const ELEMENTS = ["feuer", "eis", "blut", "schatten", "natur", "licht"];
      const count = Math.max(1, Math.round(a.count ?? 3));
      h.status.immuneElements = pickDistinct(ELEMENTS, count);
      continue;
    }

    if (a.kind === "clear_immune_elements") {
      h.status.immuneElements = [];
      continue;
    }

    if (a.kind === "add_dot") {
      const dmg = Math.max(0, Math.round(a.dmg ?? 0));
      const days = Math.max(1, Math.round(a.days ?? 1));
      const element = a.element ?? null;

      // stack-aware: ctx.stacks multipliziert die Dot-stärke
      const stacks = Math.max(1, Math.round(ctx.stacks ?? 1));
      h.dots.push({ dmg: dmg * stacks, days, element });
      continue;
    }
  }
}

// ✅ Effekt anwenden – DAS ist der zentrale Entry
export function applyEffect(effectId, { stacks = 1, days = null } = {}) {
  const h = GameState.hero;
  if (!h) return false;

  ensureEffects(h);

  const def = getDef(effectId);
  if (!def) return false;

  // curse_immunity: block negative effects
  // Heuristik: wenn onApply existiert und irgendein "schlechter" kind drin ist => negativ
  // (du kannst später in JSON ein Flag "negative:true" ergänzen)
  const blocks = (typeof window !== "undefined" && window.__heroBlocksNegativeEffects)
    ? window.__heroBlocksNegativeEffects(h)
    : false;

  const looksNegative = (() => {
    const badKinds = new Set([
      "set_vuln_pct",
      "reduce_maxhp_pct",
      "add_dot",
      "next_trap_mult" // "betrunken" ist i.d.R. negativ
    ]);
    return Array.isArray(def.onApply) && def.onApply.some(x => badKinds.has(x?.kind));
  })();

  if (blocks && looksNegative) return false;



  // stacking
  const maxStacks = def.maxStacks ?? 1;
  const stackable = !!def.stackable;

  let inst = h.effects.find(x => x.id === effectId);

  if (!inst) {
    inst = { id: effectId, stacks: 0, daysLeft: def.durationDays ?? null };
    h.effects.push(inst);
  }

  const add = stackable ? Math.max(1, Math.round(stacks)) : 1;
  inst.stacks = Math.min(maxStacks, (inst.stacks || 0) + add);

  // duration override (optional)
  if (days != null) inst.daysLeft = Math.max(1, Math.round(days));
  else if (def.durationDays != null) inst.daysLeft = def.durationDays;

  // onApply actions
  if (Array.isArray(def.onApply)) runEffectActions(def.onApply, { stacks: inst.stacks, effectId });

  return true;
}

