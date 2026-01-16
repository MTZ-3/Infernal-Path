// src/game/core/turns.js
// ============================================================================
// Tages-Logik für "Infernal Path"
// - beginDay: Energie auffüllen, Portal zeigen, danach Karten ziehen
// - endDay  : DoTs, Camp-Tage, Bewegung, Tod/Schloss prüfen
//             • Held tot  → neue Runde (Tag wieder 1, neuer Held, neue Map)
//             • Schloss   → Game Over (Held gewinnt)
//             • maxDays erreicht, Schloss NICHT erreicht → Sieg für dich
// ============================================================================

import { GameState, BASE_ENERGY, BASE_DRAW, clamp, RUN_DAYS  } from "./gameState.js";
import { drawCards,triggerNode,computePassiveBonuses,elementalFactorFor }   from "../cards/cards.js";
import { regenerateMap, renderMap } from "../map/map.js";
import { tickEffectsOneDay, tickHeroStatusOneDay } from "../effects/effects.js";

// kleines lokales Shuffle – reicht fürs Tagesmischen
const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ============================================================================
// beginDay: Energie setzen + Portal (entscheidet, wann gezogen wird)
// ============================================================================
export function beginDay() {
  const pass = computePassiveBonuses();

  GameState.energy = BASE_ENERGY + (pass.energyBonus || 0);

  const drawCount = BASE_DRAW + (pass.drawBonus || 0);

  // optional: Gratis-Rerolls für Shop pro Tag
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
// endDay: zentraler Tagesabschluss
// ============================================================================
export function endDay() {
  console.log("[endDay] START", { day: GameState.day, round: GameState.round, hero: !!GameState.hero });

  // --- 0) Held sicherstellen ---
  if (!GameState.hero) {
    console.warn("[endDay] Kein Held → spawn");
    if (typeof window.__spawnHero === "function") {
      window.__spawnHero(GameState.round ?? 1);
    } else {
      fallbackSpawnHero();
    }
  }

  if (GameState.round == null)    GameState.round    = 1;
  if (GameState.campDays == null) GameState.campDays = 3; // 3 Start-Tage im Lager

  const h = GameState.hero;
  h.dots   = Array.isArray(h.dots) ? h.dots : [];
  h.status = h.status || {};

    // --- 1) DoTs ticken lassen (mit Elementen) ---
  let totalFinal = 0;
  const parts = [];
  tickEffectsOneDay();       // deine Effekt-Library (verstoert etc.)
  tickHeroStatusOneDay();    // frozen/vuln/resist/blockItems/...

  h.dots.forEach(d => {
    const base = d.dmg;
    const elem = d.element || null;
    const factor = elementalFactorFor(h, elem);
    const final = Math.max(0, Math.round(base * factor));

    if (final > 0) {
      h.hp = clamp(h.hp - final, 0, h.maxHp);
      totalFinal += final;

      if (elem) {
        if (final === base) {
          parts.push(`${final} ${elem}`);
        } else {
          parts.push(`${base}→${final} ${elem}`);
        }
      } else {
        parts.push(`${final}`);
      }
    }
    d.days--;
  });

  h.dots = h.dots.filter(d => d.days > 0);

  if (totalFinal > 0) {
    const txt = parts.join(", ");
    window.__log?.(
      `<span class="small muted">DoT: ${txt} (gesamt ${totalFinal} Schaden)</span>`
    );
  }

  // delayed blasts ticken und auslösen
  h.status.delayed = Array.isArray(h.status.delayed) ? h.status.delayed : [];
  const keepDelayed = [];
  for (const d of h.status.delayed) {
    d.daysLeft = Math.max(0, (d.daysLeft ?? 0) - 1);
    if (d.daysLeft > 0) { keepDelayed.push(d); continue; }

    const base = Math.max(0, Math.round(d.dmg ?? 0));
    const elem = d.element ?? null;
    const factor = elementalFactorFor(h, elem);
    const final = Math.max(0, Math.round(base * factor));

    if (final > 0) {
      h.hp = clamp(h.hp - final, 0, h.maxHp);
      window.__log?.(`<span class="small">💥 Explosion: ${final}${elem ? ` (${elem})` : ""}</span>`);
    }
  }
  h.status.delayed = keepDelayed;


  // --- 2) Dauer-Effekte abbauen ---
  if ((h.status.frozenDays ?? 0) > 0) h.status.frozenDays--;
  tickEffectsOneDay();

  // --- 3) Bewegung / Camp-Logik ---
  const frozenNow = (h.status.frozenDays ?? 0) > 0;

  if (h.alive !== false && h.hp > 0) {
    if ((GameState.campDays ?? 0) > 0) {
      GameState.campDays--;
      const spent = 3 - (GameState.campDays ?? 0);
      window.__log?.(
        `<span class="small muted">Der Held lagert am Start (${spent}/3)</span>`
      );
    } else if (!frozenNow) {
      moveHeroOneStep();
    }
  }

  // --- 4) SCHLOSS-CHECK: Held hat Burg erreicht? → Niederlage ---
  if (h.alive !== false && GameState.heroPos === GameState.map.castleId) {
    window.__toast?.(`<b>Niederlage</b> – Der Held erreicht das Schloss.`);
    alert("Niederlage! Der Held erreicht das Schloss.");
    freezeRun();
    console.log("[endDay] GAME OVER (Schloss erreicht)");
    return;
  }

  // --- 5) Hand → Deck & mischen ---
  if (GameState.hand.length) {
    GameState.deck.push(...GameState.hand);
    GameState.hand = [];
    GameState.deck = shuffle(GameState.deck);
  }

  // --- 6) HELD-TOD: neue Runde, Tage zurück auf 1 ---
 
  if (h.hp <= 0 && h.alive !== false) {
    h.alive = false;

    // Basis-Beute
    const baseSouls = 3;

    // Bonus: je früher der Held fällt, desto mehr
    // Beispiel: maxDays=10
    // - stirbt an Tag 1  → earlyRaw = 9 → earlyBonus = 4
    // - stirbt an Tag 5  → earlyRaw = 5 → earlyBonus = 2
    // - stirbt an Tag 10 → earlyRaw = 0 → earlyBonus = 0
    const maxDays   = GameState.maxDays || RUN_DAYS;
    const dayNow    = GameState.day || 1;
    const earlyRaw  = Math.max(0, maxDays - dayNow);
    const earlyBonus = Math.floor(earlyRaw / 2); // alle 2 "ersparten" Tage = +1 Seele


    const gain = baseSouls + earlyBonus;
    GameState.souls += gain;

    window.__toast?.(
      `<b>SIEG</b> – Held fällt (+${gain} Seelen: ${baseSouls} Basis, ${earlyBonus} früh)`
    );

    // Runden-/Levelzähler hoch
    GameState.round = (GameState.round ?? 1) + 1;

    GameState.day = 1;

    try {
      regenerateMap(GameState.round);
    } catch (e) {
      console.error("[endDay] regenerateMap crashed → fallback", e);
    }

    if (typeof window.__spawnHero === "function") {
      window.__spawnHero(GameState.round);
    } else {
      fallbackSpawnHero();
    }

    GameState.campDays = 3;

    beginDay();
    renderMap?.();
    window.__log?.(
      `<span class="small muted">Runde ${GameState.round} startet. (+${gain} Seelen erhalten)</span>`
    );
    console.log("[endDay] NEXT ROUND → Tag", GameState.day, "Round", GameState.round);
    return;
  }
  
  

  // --- 7) Normaler Tagwechsel (Held lebt, Schloss nicht erreicht) ---
  GameState.day++;

  // maxDays = dein „Run geht 10 Tage“-Timer
  // ❗ Hier gewinnt jetzt NICHT der Held, sondern DU:
  if (GameState.maxDays && GameState.day > GameState.maxDays) {
    alert("Sieg! Du hast den Helden lange genug aufgehalten.");
    freezeRun();
    console.log("[endDay] RUN END (maxDays erreicht → Sieg für Spieler)");
    return;
  }

  // --- 8) Nächster Tag: beginDay + Feedback ---
  beginDay();
  window.__toast?.(`Tag <b>${GameState.day}</b>`);
  console.log("[endDay] DONE → Tag", GameState.day);
} 

// ============================================================================
// Heldbewegung: 1 Schritt Richtung nächste "Schicht" (layer+1), zufälliger Pfad
// ============================================================================
function moveHeroOneStep() {
  const hereId   = GameState.heroPos;
  const targetId = GameState.map.castleId;
  if (!hereId || !targetId || hereId === targetId) return;

  const hereNode   = nodeById(hereId);
  const neighIds   = neighborsOf(hereId);
  const neighNodes = neighIds.map(id => nodeById(id)).filter(Boolean);
  if (!hereNode || !neighNodes.length) return;

  // bevorzugt: layer+1 (nach vorne); sonst beliebiger Nachbar
  const forward    = neighNodes.filter(n => n.layer === hereNode.layer + 1);
  const candidates = forward.length ? forward : neighNodes;

  const next = candidates[Math.floor(Math.random() * candidates.length)];
  GameState.heroPos = next.id;

  // platzierte Karten + Tile-Effekte
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
    h.hp = h.maxHp;
    n.kind = "visited_village";
    window.__log?.(`<span class="small">Das Dorf heilt den Helden vollständig.</span>`);
  }
    else if (n.kind === "ruined_village") {
    window.__log?.(`<span class="small muted">Das Dorf ist zerstört. Keine Heilung.</span>`);
    n.kind = "visited_village";
  }
  else if (n.kind === "dungeon") {
    if (Math.random() < 0.5) {
      const dmg = 5 + Math.floor(Math.random() * 6); // 5..10
      h.hp = clamp(h.hp - dmg, 0, h.maxHp);
      window.__log?.(`<span class="small">Dungeon-Falle! ${dmg} Schaden.</span>`);
    }
    else if (n.kind === "ruined_dungeon") {
    window.__log?.(`<span class="small muted">Der Dungeon ist zerstört. Keine Beute.</span>`);
    n.kind = "cleared_dungeon";
    }
    else {
      GameState.souls += 5;
      window.__log?.(`<span class="small">Dungeon-Beute! +5 Seelen.</span>`);
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
// Run einfrieren (bei Sieg/Niederlage): Deck/Hand/Ablage leeren
// ============================================================================
function freezeRun() {
  GameState.hand    = [];
  GameState.deck    = [];
  GameState.discard = [];
  GameState.energy  = 0;
}

// ============================================================================
// Fallback-Spawn, falls __spawnHero nicht definiert ist
// ============================================================================
function fallbackSpawnHero() {
  const startNode = GameState.map?.nodes?.find(n => n.layer === 0) ?? GameState.map?.nodes?.[0];

  GameState.hero = {
    name: "Held",
    maxHp: 90,
    hp: 90,
    dots: [],
    status: {},
    alive: true,
  };
  if (startNode) GameState.heroPos = startNode.id;

  GameState.campDays = 3;
}
