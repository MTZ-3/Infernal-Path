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

if (typeof window !== "undefined") {
  window.__heroBlocksNegativeEffects = heroBlocksNegativeEffects;
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

  // colossus_blood: +20% MaxHP (einmalig beim Spawn)
  if (heroHasAbility(h, "colossus_blood")) {
    const newMax = Math.max(1, Math.round(h.maxHp * 1.2));
    h.maxHp = newMax;
    h.hp = newMax;
  }

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



  // (6) Blutpakt-Siegel: 1x pro Tag, wenn unter 30% HP -> +10% MaxHP heal
  if (heroHasItem(hero, "item_blood_pact")) {
  const ratio = hero.maxHp > 0 ? (hero.hp / hero.maxHp) : 1;
  if (ratio < 0.30 && !hero._bloodPactUsed) {
    hero._bloodPactUsed = true;
    const heal = Math.max(1, Math.floor(hero.maxHp * 0.10));
    const got = applyHeal(hero, heal);
    if (got > 0) log?.(`<span class="small k">Item</span>: Blutpakt-Siegel +${got} HP`);
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

// meta: { node } damit ruin_village/ruin_dungeon das aktuelle Feld ändern kann
function applyActions(actions, meta = {}) {
  const h = GameState.hero;
  if (!h) return;

  GameState.mods = GameState.mods || {};
  h.status = h.status || {};
  h.dots = Array.isArray(h.dots) ? h.dots : [];

  for (const a of actions || []) {
    if (!a?.kind) continue;

    // ------------------------------------------------------------
    // Reveal / False info
    // ------------------------------------------------------------
    if (a.kind === "reveal") {
      const count = Math.max(1, Math.round(a.count ?? 1));
      revealRandomHeroTraits(count);
      continue;
    }

    if (a.kind === "false_info") {
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

    // ------------------------------------------------------------
    // ✅ Effekte aus effects.de.json (nur Karte greift drauf zu)
    // action: { kind:"apply_effect", id:"gift", stacks?:1, days?:3 }
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // Map/Tile Änderungen
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // Souls / Shop
    // ------------------------------------------------------------
    if (a.kind === "gain_souls") {
      const amt = Math.max(0, Math.round(a.amount ?? 0));
      GameState.souls = (GameState.souls || 0) + amt;
      log(`<span class="soul">+${amt} Seelen</span>`);
      continue;
    }

    if (a.kind === "shop_penalty") {
      const amt = Math.max(0, Math.round(a.amount ?? 0));
      GameState.mods.shopPenalty = (GameState.mods.shopPenalty || 0) + amt;
      log(`<span class="small muted">🛒 Nächster Einkauf +${amt}.</span>`);
      continue;
    }

    // ------------------------------------------------------------
    // Schaden / Heal
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // Freeze
    // ------------------------------------------------------------
    if (a.kind === "freeze_days") {
      const days = Math.max(1, Math.round(a.days ?? 1));
      h.status.frozenDays = (h.status.frozenDays || 0) + days;
      log(`<span class="small">❄️ Eingefroren: ${days} Tag(e)</span>`);
      continue;
    }

    // ------------------------------------------------------------
    // Resist/Vuln (alt – wenn du später alles über apply_effect machst, kannst du die entfernen)
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // Immunity
    // ------------------------------------------------------------
    if (a.kind === "immune_to_strong") {
      const els = pickDistinctElements(3);
      h.status.immuneElements = Array.isArray(h.status.immuneElements) ? h.status.immuneElements : [];
      for (const el of els) if (!h.status.immuneElements.includes(el)) h.status.immuneElements.push(el);
      log(`<span class="small">🧿 Immun gegen: ${els.join(", ")}</span>`);
      continue;
    }

    // ------------------------------------------------------------
    // MaxHP % change
    // ------------------------------------------------------------
    if (a.kind === "maxhp_pct") {
      const pct = Math.round(a.pct ?? 0);
      const delta = Math.round((h.maxHp || 0) * (pct / 100));
      h.maxHp = Math.max(1, (h.maxHp || 1) + delta);
      h.hp = clamp(h.hp, 0, h.maxHp);
      log(`<span class="small">❤️ MaxHP ${pct}% (${delta >= 0 ? "+" : ""}${delta})</span>`);
      continue;
    }

    // ------------------------------------------------------------
    // Items (✅ random)
    // item_shield bleibt als "give item(s)" kompatibel
    // ------------------------------------------------------------
    if (a.kind === "item_shield") {
      const stacks = Math.max(1, Math.round(a.stacks ?? 1));

      if ((h.status.blockItemsDays || 0) > 0) {
        log(`<span class="small muted">🎒 Items blockiert: ${h.status.blockItemsDays} Tag(e)</span>`);
        continue;
      }

      // ✅ echtes Item-System
      giveHeroRandomItem?.(h, stacks);
      continue;
    }

    if (a.kind === "block_items") {
      const days = Math.max(1, Math.round(a.days ?? 1));
      h.status.blockItemsDays = Math.max(h.status.blockItemsDays || 0, days);
      log(`<span class="small muted">🎒 Items blockiert: ${days} Tag(e)</span>`);
      continue;
    }

    // ------------------------------------------------------------
    // DoT Actions
    // ------------------------------------------------------------
    if (a.kind === "dot_clear") {
      const removed = h.dots.length;
      h.dots = [];
      log(`<span class="small">🩸 DoT entfernt (${removed})</span>`);
      continue;
    }

    if (a.kind === "dot_burst") {
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

    // ------------------------------------------------------------
    // Trap Modifiers
    // ------------------------------------------------------------
    if (a.kind === "drunk_next_trap") {
      const mult = Math.max(2, Math.round(a.mult ?? 2));
      h.status.nextTrapMult = mult;
      log(`<span class="small">🍺 Betrunken: nächste Falle x${mult}</span>`);
      continue;
    }

    // ------------------------------------------------------------
    // Next sacrifice bonus
    // ------------------------------------------------------------
    if (a.kind === "next_sacrifice_bonus") {
      const levels = Math.max(1, Math.round(a.levels ?? 1));
      GameState.mods.nextHandLevelBonus = (GameState.mods.nextHandLevelBonus || 0) + levels;
      log(`<span class="small">🩸 Nächste Runde: Hand +${levels} Level</span>`);
      continue;
    }

    // ------------------------------------------------------------
    // nothing
    // ------------------------------------------------------------
    if (a.kind === "nothing") {
      log(`<span class="small muted">… nichts passiert.</span>`);
      continue;
    }

    log(`<span class="small muted">Unbekannte Action: ${a.kind}</span>`);
  }
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

export function giveHeroRandomItem(hero, count = 1) {
  if (!hero) return;

  const items = window.__ITEMS || [];
  if (!Array.isArray(items) || !items.length) return;

  hero.items = Array.isArray(hero.items) ? hero.items : [];

  const n = Math.max(1, Math.round(count));
  for (let i = 0; i < n; i++) {
    const it = items[Math.floor(Math.random() * items.length)];
    if (!it?.id) continue;

    hero.items.push(it.id);

    // optional log (wenn du logger gebunden hast)
    // log?.(`<span class="small k">🎒 Item</span>: Held erhält <b>${it.name}</b>.`);
  }
}

export function applyDamage(hero, rawDamage, meta = {}) {
  if (!hero) return 0;

  let dmg = Math.max(0, Math.round(rawDamage || 0));
  if (dmg <= 0) return 0;

  const type = meta.type || "direct";     // "direct" | "dot"
  const isAoE = !!meta.isAoE;
  const day = meta.day ?? GameState.day ?? 1;
  const element = meta.element ?? null;

  hero.status = hero.status || {};
  hero.items = Array.isArray(hero.items) ? hero.items : [];
  hero.effects = Array.isArray(hero.effects) ? hero.effects : [];

  // -----------------------------
  // Ability: cold_mind (ignore DoTs first 2 days)
  // -----------------------------
  if (type === "dot" && heroHasAbility(hero, "cold_mind")) {
    if ((day ?? 1) <= 2) return 0;
  }

  // -----------------------------
  // Ability: element_void (immune to strong element)
  // -----------------------------
  if (type !== "dot" && heroHasAbility(hero, "element_void") && element && hero.strongElement === element) {
    return 0;
  }
  if (type === "dot" && heroHasAbility(hero, "element_void") && element && hero.strongElement === element) {
    return 0;
  }

  // -----------------------------
  // Global status: vuln/resist (vereinheitlicht)
  // -----------------------------
  const vulnPct = hero.status?.vuln?.pct || 0;
  const resistPct = hero.status?.resist?.pct || 0;
  if (vulnPct) dmg = Math.round(dmg * (1 + vulnPct / 100));
  if (resistPct) dmg = Math.round(dmg * (1 - resistPct / 100));

  // -----------------------------
  // Ability: damage_armor (direct -25%, DoT normal)
  // -----------------------------
  if (type === "direct" && heroHasAbility(hero, "damage_armor")) {
    dmg = Math.round(dmg * 0.75);
  }

  // -----------------------------
  // Ability: pain_distortion (DoT +25%, direct -25%)
  // -----------------------------
  if (heroHasAbility(hero, "pain_distortion")) {
    if (type === "dot") dmg = Math.round(dmg * 1.25);
    if (type === "direct") dmg = Math.round(dmg * 0.75);
  }

  // -----------------------------
  // Ability: shadow_filter (AoE only 50%)
  // -----------------------------
  if (isAoE && heroHasAbility(hero, "shadow_filter")) {
    dmg = Math.round(dmg * 0.5);
  }

  // -----------------------------
  // Item: schild_roststahl (damageTakenPct -10)
  // -----------------------------
  if (heroHasItem(hero, "schild_roststahl")) {
    dmg = Math.round(dmg * 0.9);
  }

  // -----------------------------
  // Item: Splitterpanzer (item_ice_shell)
  // Vorschlag: reduziert den ERSTEN direct hit pro Tag um 2 (pro Stack)
  // -----------------------------
  if (type === "direct") {
    const iceStacks = heroItemCount(hero, "item_ice_shell");
    if (iceStacks > 0) {
      const tag = "_iceShellUsedDay";
      if (hero[tag] !== day) {
        hero[tag] = day;
        dmg = Math.max(0, dmg - 2 * iceStacks);
      }
    }
  }

  // -----------------------------
  // Ability: iron_flesh (max 25% MaxHP damage/day)
  // -----------------------------
  if (heroHasAbility(hero, "iron_flesh") && type === "direct") {
    hero._damageTakenToday = hero._damageTakenToday || 0;
    const cap = Math.max(0, Math.floor(hero.maxHp * 0.25));
    const left = Math.max(0, cap - hero._damageTakenToday);
    dmg = Math.min(dmg, left);
  }

  // -----------------------------
  // Ability: unyielding_will (direct cannot drop below 1 HP)
  // -----------------------------
  if (heroHasAbility(hero, "unyielding_will") && type === "direct") {
    if (hero.hp - dmg < 1) dmg = Math.max(0, hero.hp - 1);
  }

  dmg = Math.max(0, Math.round(dmg));
  if (dmg <= 0) return 0;

  // -----------------------------
  // Apply damage to tempHp first (status.tempHp)
  // -----------------------------
  const temp = Math.max(0, Math.round(hero.status.tempHp || 0));
  if (temp > 0) {
    const use = Math.min(temp, dmg);
    hero.status.tempHp = temp - use;
    dmg -= use;
  }

  // Apply to HP
  hero.hp = Math.max(0, hero.hp - dmg);

  // Track iron_flesh consumption
  if (heroHasAbility(hero, "iron_flesh") && type === "direct") {
    hero._damageTakenToday = (hero._damageTakenToday || 0) + dmg;
  }

  // -----------------------------
  // Item: Totem der Wiederkehr (totem_50) - 1x death save
  // -----------------------------
  if (hero.hp <= 0 && heroHasItem(hero, "totem_50")) {
    // consume one totem
    const idx = hero.items.findIndex(x => x === "totem_50");
    if (idx >= 0) hero.items.splice(idx, 1);

    const restore = Math.max(1, Math.floor(hero.maxHp * 0.5));
    hero.hp = restore;
    hero.alive = true;

    // verhindert "dealt" doppelt zu zählen -> wir geben dmg zurück, das bereits angewendet wurde
    log?.(`<span class="small k">Item</span>: Totem der Wiederkehr rettet den Helden! (+${restore} HP)`);
    return Math.max(0, Math.round(rawDamage || 0)); // logisch: "Schaden wurde ausgelöst"
  }

  if (hero.hp <= 0) hero.alive = false;

  return Math.max(0, Math.round(rawDamage || 0));
}
