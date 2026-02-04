// src/game/hero/hero.js
// ============================================================================
// Held-Logik (zentral)
// - createHero(): baut einen Held aus Blueprint
// - heroHasAbility(): checkt Fähigkeit
// - applyDamage(): EIN zentraler Punkt für JEGLICHEN Schaden (direct/dot/aoe)
// - applyHeal(): zentraler Heal
// - onHeroDayStart()/onHeroDayEnd(): tägliche Resets + Self-Heals
// - heroMoveSteps(): Bewegung (blood_rush)
// - onHeroEnterVillage(): Dorfbonus (village_blessing)
// ============================================================================

import { GameState, clamp } from "../core/gameState.js";

let _logCb = null;
export function bindLogger(fn) { _logCb = fn; }
function log(m) { _logCb?.(m); }

// Alle bekannten Elemente im Spiel
const ELEMENTS = ["feuer", "eis", "blut", "schatten", "natur", "licht"];

function rollElementPair() {
  const a = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
  let b = a;
  while (b === a) b = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
  return { strong: a, weak: b };
}

export function heroHasAbility(hero, id) {
  if (!hero || !id) return false;

  // Primär: abilityId (dein System)
  if (hero.abilityId && hero.abilityId === id) return true;

  // Optional: falls du später arrays nutzt
  const arr = hero.abilities || hero.passives || [];
  return Array.isArray(arr) && arr.some(a => (a?.id || a) === id);
}

// Wird z.B. in effects.js benutzt, um "curse_immunity" zu respektieren
export function heroBlocksNegativeEffects(hero) {
  return heroHasAbility(hero, "curse_immunity");
}

// Falls du element_void zusätzlich zentral nutzen willst
export function heroIsImmuneToElement(hero, element) {
  if (!hero || !element) return false;
  // element_void: immun gegen Schaden seines starken Elements
  return heroHasAbility(hero, "element_void") && hero.strongElement === element;
}

// -----------------------------
// Item Helpers
// -----------------------------
export function heroHasItem(hero, itemId) {
  if (!hero || !itemId) return false;
  return Array.isArray(hero.items) && hero.items.includes(itemId);
}

export function heroItemCount(hero, itemId) {
  if (!hero || !itemId) return 0;
  const arr = Array.isArray(hero.items) ? hero.items : [];
  return arr.filter(x => x === itemId).length;
}

// Wird bei Tagesstart/Item-Gain aufgerufen
export function applyItemPassives(hero) {
  if (!hero) return;

  // (4) Weak Element entfernen (allgemein)
  if (heroHasItem(hero, "item_ward_of_equilibrium")) {
    hero.weakElement = null;
  }
}




// ============================================================================
// createHero
// ============================================================================
export function createHero(blueprint) {
  const { strong, weak } = rollElementPair();

  const h = {
    // Basis (kommt aus blueprint/baseHero)
    name: blueprint.name || "",
    level: (GameState.round ?? 1),
    maxHp: blueprint.maxHp,
    hp: blueprint.maxHp,
    speed: blueprint.baseSpeed || 1,
    alive: true,

    // Status / Container
    dots: [],
    status: { frozenDays: 0, weakenPct: 0 },
    items: [],
    effects: [],

    // Elemente
    strongElement: strong,
    weakElement: weak,

    // Fähigkeit (kann blueprint setzen, sonst random)
    abilityId: blueprint.abilityId ?? null,
    abilityName: blueprint.abilityName ?? null,
    abilityDesc: blueprint.abilityDesc ?? null,
  };

  // ✅ Name zufällig, wenn leer
  const names = window.__HERO_NAMES || [];
  if (!h.name && names.length) {
    h.name = names[Math.floor(Math.random() * names.length)];
  }
  if (!h.name) h.name = "Held";

  // ✅ Fähigkeit zufällig, wenn nicht gesetzt
  const abilities = window.__HERO_ABILITIES || [];
  if (!h.abilityId && abilities.length) {
    const a = abilities[Math.floor(Math.random() * abilities.length)];
    h.abilityId = a.id;
    h.abilityName = a.name;
    h.abilityDesc = a.desc;
  }

  // Falls gar keine abilities geladen wurden:
  if (!h.abilityId) {
    h.abilityId = null;
    h.abilityName = "Keine";
    h.abilityDesc = "";
  }

  log?.(
    `Neuer Held: <b>${h.name}</b> – stark gegen <b>${h.strongElement}</b>, ` +
    `verwundbar gegen <b>${h.weakElement}</b>` +
    (h.abilityId ? ` • Fähigkeit: <b>${h.abilityName}</b>` : "")
  );

  // Item-Passives initial anwenden
  applyItemPassives(h);

  // alles verborgen bis auf Name
  h.revealed = h.revealed || {};

  return h;
}

// ============================================================================
// Tages-Hooks
// ============================================================================

export function onHeroDayStart(hero) {
  if (!hero) return;

  // iron_flesh reset
  hero._damageTakenToday = 0;

  // Item-Passives täglich “hart” setzen (z.B. Weak entfernen)
  applyItemPassives(hero);

  // (6) Blutpakt: 1x pro Tag triggerbar
  hero._bloodPactUsed = false;
}




export function onHeroDayEnd(hero) {
  if (!hero || hero.hp <= 0) return;

  // self_heal: +5% MaxHP am Tagesende
  if (heroHasAbility(hero, "self_heal")) {
    const heal = Math.max(1, Math.floor(hero.maxHp * 0.05));
    const got = applyHeal(hero, heal);
    if (got > 0) log?.(`<span class="small k">Fähigkeit</span>: Selbstheilung +${got} HP`);
  }

  // (2) Ring der Regeneration: +5% MaxHP am Tagesende (stackbar)
  const regenStacks = heroItemCount(hero, "item_regen_ring");
  if (regenStacks > 0) {
    const heal = Math.max(1, Math.floor(hero.maxHp * 0.05 * regenStacks));
    const got = applyHeal(hero, heal);
    if (got > 0) log?.(`<span class="small k">Item</span>: Ring der Regeneration +${got} HP`);
  }



  // desperation_heal: unter 20% HP +8% MaxHP täglich
  if (heroHasAbility(hero, "desperation_heal")) {
    const ratio = hero.maxHp > 0 ? (hero.hp / hero.maxHp) : 1;
    if (ratio < 0.20) {
      const heal = Math.max(1, Math.floor(hero.maxHp * 0.08));
      const got = applyHeal(hero, heal);
      if (got > 0) log?.(`<span class="small k">Fähigkeit</span>: Verzweiflungsheilung +${got} HP`);
    }
  }
}

export function onHeroEnterVillage(hero) {
  if (!hero || hero.hp <= 0) return;

  // village_blessing: +10 "temporäre HP"
  // Wir machen es simpel: +10 extra HP über maxHp (tempHp)
  // Diese tempHp kannst du später z.B. am Tagesende abbauen, wenn du willst.
  if (heroHasAbility(hero, "village_blessing")) {
    hero.status = hero.status || {};
    hero.status.tempHp = (hero.status.tempHp || 0) + 10;
    hero.hp += 10;
    log?.(`<span class="small k">Fähigkeit</span>: Dorfsegen +10 temporäre HP`);
  }
}

// ============================================================================
// Bewegung
// ============================================================================

export function heroMoveSteps(hero, baseSteps = 1) {
  if (!hero) return baseSteps;

  // blood_rush: unter 30% HP doppelte Bewegung
  if (heroHasAbility(hero, "blood_rush")) {
    const ratio = hero.maxHp > 0 ? (hero.hp / hero.maxHp) : 1;
    if (ratio < 0.30) return baseSteps * 2;
  }

  return baseSteps;
}

// ============================================================================
// Schaden / Heal (ZENTRAL)
// meta.type: "direct" | "dot"
// meta.isAoE: true/false
// meta.day: optional (für cold_mind)
// meta.element: optional (wenn du hier auch element_void prüfen willst)
// ============================================================================

export function applyDamage(hero, rawDamage, meta = {}) {
  if (!hero) return 0;

  let dmg = Math.max(0, Math.round(rawDamage || 0));
  if (dmg <= 0) return 0;

  const type = meta.type || "direct";         // "direct" oder "dot"
  const isAoE = !!meta.isAoE;
  const day = meta.day ?? GameState.day ?? 1;

  // cold_mind: ignoriert DoTs für die ersten 2 Tage
  if (type === "dot" && heroHasAbility(hero, "cold_mind") && day <= 2) {
    return 0;
  }

  // element_void (optional hier, falls du meta.element gibst)
  if (meta.element && heroIsImmuneToElement(hero, meta.element)) {
    return 0;
  }

  // -------------------------
  // Modifikatoren
  // -------------------------

  // shadow_filter: AoE nur 50%
  if (isAoE && heroHasAbility(hero, "shadow_filter")) {
    dmg = Math.round(dmg * 0.5);
  }

  // damage_armor: Direktschaden -25%, DoT normal
  if (type === "direct" && heroHasAbility(hero, "damage_armor")) {
    dmg = Math.round(dmg * 0.75);
  }

  // pain_distortion: DoT +25%, Direktschaden -25%
  if (heroHasAbility(hero, "pain_distortion")) {
    if (type === "dot") dmg = Math.round(dmg * 1.25);
    if (type === "direct") dmg = Math.round(dmg * 0.75);
  }

  dmg = Math.max(0, dmg);
  if (dmg <= 0) return 0;

  // (5) Splitterpanzer: DoT-Schaden -30% (pro Stack multiplikativ)
  if (type === "dot") {
    const stacks = heroItemCount(hero, "item_ice_shell");
    if (stacks > 0) {
      const mult = Math.pow(0.7, stacks); // 0.7, 0.49, ...
      dmg = Math.round(dmg * mult);
    }
  }


  // iron_flesh: pro Tag max 25% MaxHP Schaden (gilt für alles, was Schaden ist)
  if (heroHasAbility(hero, "iron_flesh")) {
    const cap = Math.floor(hero.maxHp * 0.25);
    const already = hero._damageTakenToday || 0;
    const remaining = Math.max(0, cap - already);
    dmg = Math.min(dmg, remaining);
    hero._damageTakenToday = already + dmg;
  }

  if (dmg <= 0) return 0;

  // unyielding_will: durch Direktschaden nicht unter 1 HP fallen
  // (DoT darf trotzdem töten)
  if (type === "direct" && heroHasAbility(hero, "unyielding_will")) {
    const newHp = hero.hp - dmg;
    if (newHp < 1) {
      dmg = Math.max(0, hero.hp - 1);
    }
  }

  if (dmg <= 0) return 0;

  hero.hp = clamp(hero.hp - dmg, 0, hero.maxHp + (hero.status?.tempHp || 0));

  // (6) Blutpakt-Siegel: unter 30% HP -> sofort +10% MaxHP (1x pro Tag)
  if (heroHasItem(hero, "item_blood_pact") && !hero._bloodPactUsed && hero.hp > 0) {
    const ratio = hero.maxHp > 0 ? (hero.hp / hero.maxHp) : 1;
    if (ratio < 0.30) {
      hero._bloodPactUsed = true;
      const heal = Math.max(1, Math.floor(hero.maxHp * 0.10));
      const got = applyHeal(hero, heal);
      if (got > 0) log?.(`<span class="small k">Item</span>: Blutpakt-Siegel +${got} HP`);
    }
  }


  // tempHp abbauen, wenn hero.hp wieder unter maxHp fällt
  // (damit tempHp "nur extra HP" ist)
  if (hero.status?.tempHp) {
    const maxWithTemp = hero.maxHp + hero.status.tempHp;
    hero.hp = clamp(hero.hp, 0, maxWithTemp);

    // wenn HP <= maxHp, tempHp auf 0 (Temp-Schild ist weg)
    if (hero.hp <= hero.maxHp) {
      hero.status.tempHp = 0;
      hero.hp = clamp(hero.hp, 0, hero.maxHp);
    }
  }

  return dmg;
}

export function applyHeal(hero, rawAmount) {
  if (!hero) return 0;

  const amt = Math.max(0, Math.round(rawAmount || 0));
  if (amt <= 0) return 0;

  const before = hero.hp;
  const maxWithTemp = hero.maxHp + (hero.status?.tempHp || 0);
  hero.hp = clamp(hero.hp + amt, 0, maxWithTemp);
  return hero.hp - before;
}

export function changeMaxHp(hero, delta) {
  if (!hero) return 0;

  const d = Math.round(delta || 0);
  if (d === 0) return 0;

  hero.maxHp = Math.max(1, hero.maxHp + d);
  // HP clamp inkl. tempHp
  const maxWithTemp = hero.maxHp + (hero.status?.tempHp || 0);
  hero.hp = clamp(hero.hp, 0, maxWithTemp);
  return d;
}
