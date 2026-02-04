// src/game/core/turns.js
// ============================================================================
// Tages-Logik für "Infernal Path"
// - beginDay: Energie auffüllen, Portal zeigen, danach Karten ziehen
// - endDay  : Effekte/DoTs ticken, Camp-Tage, Bewegung, Tod/Schloss prüfen
// ============================================================================

import { GameState, BASE_ENERGY, BASE_DRAW, RUN_DAYS } from "./gameState.js";
import { drawCards, triggerNode, computePassiveBonuses, elementalFactorFor } from "../cards/cards.js";
import { regenerateMap, renderMap } from "../map/map.js";
import { tickEffectsOneDay } from "../effects/effects.js";

import {
  applyDamage,
  applyHeal,
  onHeroDayStart,
  onHeroDayEnd,
  onHeroEnterVillage,
  heroMoveSteps,
  heroHasItem
} from "../hero/hero.js";

// kleines lokales Shuffle
const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ============================================================================
// beginDay
// ============================================================================
export function beginDay() {
  const pass = computePassiveBonuses?.() || {};

  GameState.energy = BASE_ENERGY + (pass.energyBonus || 0);
  const drawCount  = BASE_DRAW + (pass.drawBonus || 0);

  // Tagesreset für Hero-Abilities
  onHeroDayStart?.(GameState.hero);

  // optional: Gratis-Rerolls pro Tag
  GameState.mods = GameState.mods || {};
  GameState.mods.freeRerollsLeft = pass.freeRerollBonus || 0;

  if (typeof window.__portalDaily === "function") {
    window.__portalDaily(drawCount);
  } else {
    drawCards(drawCount);
    window.__log?.(
      `<span class="small muted">beginDay → Tag ${GameState.day} • Energie=${GameState.energy} • Hand=${GameState.hand.length} • Deck=${GameState.deck.length}</span>`
    );
    window.__render?.();
    renderMap?.();
  }
}

// ============================================================================
// endDay
// ============================================================================
export function endDay() {
  console.log("[endDay] START", { day: GameState.day, round: GameState.round, hero: !!GameState.hero });

  // --- 0) Held sicherstellen ---
  if (!GameState.hero) {
    console.warn("[endDay] Kein Held → spawn");
    if (typeof window.__spawnHero === "function") window.__spawnHero(GameState.round ?? 1);
    else fallbackSpawnHero();
  }

  if (GameState.round == null) GameState.round = 1;
  if (GameState.campDays == null) GameState.campDays = 3;

  const h = GameState.hero;
  if (!h) return;

  if (h.status?.resist?.daysLeft != null) {
    h.status.resist.daysLeft--;
    if (h.status.resist.daysLeft <= 0) delete h.status.resist;
  }
  if (h.status?.vuln?.daysLeft != null) {
    h.status.vuln.daysLeft--;
    if (h.status.vuln.daysLeft <= 0) delete h.status.vuln;
  }
  if (h.status?.blockItemsDays != null) {
    h.status.blockItemsDays--;
    if (h.status.blockItemsDays <= 0) delete h.status.blockItemsDays;
  }


  h.dots   = Array.isArray(h.dots) ? h.dots : [];
  h.status = h.status || {};
  h.tempHp = h.tempHp || 0;

  // --- 1) Effekte 1 Tag ticken ---
  try { tickEffectsOneDay?.(); }
  catch (e) { console.error("[endDay] tickEffectsOneDay crash", e); }

  // --- 2) DoTs ticken (FIX: keine undefinierten Variablen mehr) ---
  let total = 0;
  const parts = [];

  try {
    for (const d of h.dots) {
      const base = Math.max(0, Math.round(d.dmg || 0));
      const elem = d.element || null;

      // Element-Faktor (weak/strong/immun)
      const factor = elementalFactorFor(h, elem);
      const raw = Math.max(0, Math.round(base * factor));

      // applyDamage liefert (bei deiner hero.js) normalerweise "tatsächlich abgezogener Schaden"
      const dealt = applyDamage(h, raw, { type: "dot", element: elem, day: GameState.day });

      if (dealt > 0) {
        total += dealt;
        if (elem) parts.push(raw === dealt ? `${dealt} ${elem}` : `${raw}→${dealt} ${elem}`);
        else parts.push(`${dealt}`);
      }

      d.days = (d.days ?? 0) - 1;
    }

    h.dots = h.dots.filter(x => (x.days ?? 0) > 0);

    if (total > 0) {
      window.__log?.(`<span class="small muted">DoT: ${parts.join(", ")} (gesamt ${total} Schaden)</span>`);
    }
  } catch (e) {
    console.error("[endDay] DoT crash", e);
  }

  // --- 3) Dauer-Status abbauen ---
  if ((h.status.frozenDays ?? 0) > 0) h.status.frozenDays--;

  // --- 4) Bewegung / Camp ---
  const frozenNow = (h.status.frozenDays ?? 0) > 0;

  if (h.alive !== false && h.hp > 0) {
    if ((GameState.campDays ?? 0) > 0) {
      GameState.campDays--;
      const spent = 3 - (GameState.campDays ?? 0);
      window.__log?.(`<span class="small muted">Der Held lagert am Start (${spent}/3)</span>`);
    } else if (!frozenNow) {
      const steps = heroMoveSteps?.(h) ?? 1;
      for (let i = 0; i < steps; i++) {
        if (h.hp <= 0 || h.alive === false) break;
        moveHeroOneStepSingle();
        if (GameState.heroPos === GameState.map.castleId) break;
      }
    }
  }

  // --- 5) Schloss-Check ---
  if (h.alive !== false && GameState.heroPos === GameState.map.castleId) {
    window.__toast?.(`<b>Niederlage</b> – Der Held erreicht das Schloss.`);
    alert("Niederlage! Der Held erreicht das Schloss.");
    freezeRun();
    console.log("[endDay] GAME OVER (Schloss erreicht)");
    return;
  }

  // --- 6) Tagesende-Hook (z.B. self_heal) ---
  try { onHeroDayEnd?.(h); }
  catch (e) { console.error("[endDay] onHeroDayEnd crash", e); }

  // --- 7) Hand → Deck & mischen ---
  if (GameState.hand.length) {
    GameState.deck.push(...GameState.hand);
    GameState.hand = [];
    GameState.deck = shuffle(GameState.deck);
  }

  // --- 8) Held tot? neue Runde ---
  if (h.hp <= 0 && h.alive !== false) {
    h.alive = false;

    const baseSouls = 3;
    const maxDays   = GameState.maxDays || RUN_DAYS;
    const dayNow    = GameState.day || 1;
    const earlyRaw  = Math.max(0, maxDays - dayNow);
    const earlyBonus = Math.floor(earlyRaw / 2);

    const gain = baseSouls + earlyBonus;
    GameState.souls += gain;

    window.__toast?.(`<b>SIEG</b> – Held fällt (+${gain} Seelen)`);

    GameState.round = (GameState.round ?? 1) + 1;
    GameState.day = 1;

    // Shop reset falls du es nutzt
    GameState.mods = GameState.mods || {};
    GameState.mods.shopOffersRound = null;
    GameState.mods.shopOffers = null;

    try { regenerateMap(GameState.round); }
    catch (e) { console.error("[endDay] regenerateMap crash", e); }

    if (typeof window.__spawnHero === "function") window.__spawnHero(GameState.round);
    else fallbackSpawnHero();

    GameState.campDays = 3;

    beginDay();
    renderMap?.();
    window.__log?.(`<span class="small muted">Runde ${GameState.round} startet. (+${gain} Seelen)</span>`);
    return;
  }

  // --- 9) Normaler Tagwechsel ---
  GameState.day++;

  if (GameState.maxDays && GameState.day > GameState.maxDays) {
    alert("Sieg! Du hast den Helden lange genug aufgehalten.");
    freezeRun();
    console.log("[endDay] RUN END (maxDays erreicht)");
    return;
  }

  beginDay();
  window.__toast?.(`Tag <b>${GameState.day}</b>`);
  console.log("[endDay] DONE → Tag", GameState.day);
}

// ============================================================================
// 1 Schritt Bewegung + Trigger
// ============================================================================
function moveHeroOneStepSingle() {
  const hereId = GameState.heroPos;
  const targetId = GameState.map.castleId;
  if (!hereId || !targetId || hereId === targetId) return;

  const hereNode = nodeById(hereId);
  const neighNodes = neighborsOf(hereId).map(id => nodeById(id)).filter(Boolean);
  if (!hereNode || !neighNodes.length) return;

  // bevorzugt: layer+1
  const forward = neighNodes.filter(n => n.layer === hereNode.layer + 1);
  const candidates = forward.length ? forward : neighNodes;

  const next = candidates[Math.floor(Math.random() * candidates.length)];
  GameState.heroPos = next.id;

  // (1) Banner der Entschlossenheit: beim Betreten +10% Resist für 1 Tag
  const h = GameState.hero;
  if (h && heroHasItem(h, "item_banner_resolve")) {
    h.status = h.status || {};
    // Wir nutzen daysLeft-Format wie in 
    h.status.resist = { pct: 10, daysLeft: 1 };
    window.__log?.(`<span class="small k">Item</span>: Banner der Entschlossenheit (Resist 10% für 1 Tag)`);
  }


  try { triggerNode(next.id); } catch (e) { console.error("triggerNode fail", e); }
  applyTileOnEnter(next);

  renderMap?.();
}

// ============================================================================
// Tile-Effekte (Dorf / Dungeon)
// ============================================================================
function applyTileOnEnter(n) {
  const h = GameState.hero;
  if (!h) return;

  if (n.kind === "village") {
    applyHeal(h, h.maxHp);
    onHeroEnterVillage?.(h);
    n.kind = "visited_village";
    window.__log?.(`<span class="small">Das Dorf heilt den Helden vollständig.</span>`);
  } else if (n.kind === "dungeon") {

    // 1) Dungeon-Effekt: Schaden ODER "nichts weiter"
    if (Math.random() < 0.5) {
      const dmg = 5 + Math.floor(Math.random() * 6);
      applyDamage(h, dmg, { type: "direct" });
      window.__log?.(`<span class="small">Dungeon-Falle! ${dmg} Schaden.</span>`);
    } else {
      window.__log?.(`<span class="small">Dungeon: Der Held findet einen Weg ohne Schaden.</span>`);
    }

    // 2) ✅ IMMER ein random Item zusätzlich
    if (typeof window.__giveHeroRandomItem === "function") {
      window.__giveHeroRandomItem();
      window.__log?.(`<span class="small">Dungeon-Beute: Der Held erhält ein Item.</span>`);
    } else {
      window.__log?.(`<span class="small muted">Dungeon-Beute: (Item-System fehlt)</span>`);
    }

    n.kind = "cleared_dungeon";
  }

}

// ============================================================================
// Graph-Helfer
// ============================================================================
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

// ============================================================================
// Run einfrieren
// ============================================================================
function freezeRun() {
  GameState.hand = [];
  GameState.deck = [];
  GameState.discard = [];
  GameState.energy = 0;
}

// ============================================================================
// Fallback-Held
// ============================================================================
function fallbackSpawnHero() {
  const startNode = GameState.map?.nodes?.find(n => n.layer === 0) ?? GameState.map?.nodes?.[0];

  GameState.hero = {
    name: "Held",
    maxHp: 90,
    hp: 90,
    dots: [],
    status: {},
    tempHp: 0,
    alive: true,
  };

  if (startNode) GameState.heroPos = startNode.id;
  GameState.campDays = 3;
}
