// src/main.js
import { GameState } from "./game/core/gameState.js";
import { mountUI, render, bindLogs, showPortalOffer, showLobby, showShop } from "./ui/render.js";
import { setCardLibrary, newInstance, revealTraits } from "./game/cards/cards.js";
import { createHero, applyItemPassives } from "./game/hero/hero.js";
import { beginDay, endDay } from "./game/core/turns.js";
import { mountStaticMap, renderMap, regenerateMap } from "./game/map/map.js";
import { setEffectLibrary, bindEffectLogger } from "./game/effects/effects.js";

// ------------------------------------------------------------
// Utils
// ------------------------------------------------------------
function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadJSON(path, fallback) {
  try {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.warn(`[loadJSON] ${path} fallback`, e?.message || e);
    return fallback;
  }
}

// ------------------------------------------------------------
// UI mount
// ------------------------------------------------------------
const app = document.querySelector("#app");
mountUI(app);
bindLogs();

window.__revealTraits = (n) => revealTraits(n);
window.__cheatRevealOne = () => revealTraits(1);

window.__cheatToggleRevealAll = () => {
  const h = GameState.hero;
  if (!h) return;

  h.revealed = h.revealed || {};
  h._revealSnapshot = h._revealSnapshot || {};

  // wenn gerade NICHT all-reveal aktiv ist -> snapshot speichern und alles zeigen
  if (!h._revealAll) {
    // snapshot: nur echte revealed speichern
    h._revealSnapshot = { ...h.revealed };

    // Alles sichtbar (aber nur die Keys, die es bei dir gibt!)
    h.revealed.strongElement = true;
    h.revealed.weakElement   = true;
    h.revealed.ability       = true;
    h.revealed.maxHp         = true;

    h._revealAll = true;
    window.__log?.(`<span class="small muted">👁 Cheat: Alle Heldendaten sichtbar.</span>`);
  } else {
    // zurück auf snapshot: nur das sichtbar lassen, was wirklich schon aufgedeckt wurde
    h.revealed = { ...h._revealSnapshot };
    h._revealAll = false;
    window.__log?.(`<span class="small muted">👁 Cheat: Zurück auf echte Aufdeckungen.</span>`);
  }

  window.__render?.();
};

// ------------------------------------------------------------
// Load data
// ------------------------------------------------------------
const effects = await loadJSON("./data/effects.de.json", []);
setEffectLibrary(effects);
bindEffectLogger(window.__log);

const cards = await loadJSON("./data/cards.de.json", []);
setCardLibrary(cards);

const ACTIVE_CARDS  = cards.filter(c => c.type !== "passiv");
const PASSIVE_CARDS = cards.filter(c => c.type === "passiv");

// heroes.de.json kann sein:
// - { names, abilities, baseHeroes }
// - ODER: Array von base heroes
const heroRaw = await loadJSON("./data/heroes.de.json", { names: [], abilities: [], baseHeroes: [] });

const heroData = Array.isArray(heroRaw)
  ? { names: [], abilities: [], baseHeroes: heroRaw }
  : (heroRaw || { names: [], abilities: [], baseHeroes: [] });

window.__HERO_NAMES     = heroData.names || [];
window.__HERO_ABILITIES = heroData.abilities || [];
window.__BASE_HEROES    = heroData.baseHeroes || [];

// ------------------------------------------------------------
// Map mount
// ------------------------------------------------------------
mountStaticMap(document.querySelector("#map"));

// ------------------------------------------------------------
// Portal hook
// ------------------------------------------------------------
window.__portalDaily = (drawCount) => {
  showPortalOffer(ACTIVE_CARDS, drawCount);
};

// ------------------------------------------------------------
// Hero spawning (robust + cheat-friendly)
// ------------------------------------------------------------
function pickRandom(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function applyHeroNameAndAbility(hero, forcedAbilityId = null) {
  // Name (zufällig, NICHT rotieren)
  const name = pickRandom(window.__HERO_NAMES);
  if (name) hero.name = name;

  // Ability
  const abilities = window.__HERO_ABILITIES || [];
  let abil = null;

  if (forcedAbilityId) {
    abil = abilities.find(a => a.id === forcedAbilityId) || null;
  } else {
    abil = pickRandom(abilities);
  }

  if (abil) {
    hero.abilityId   = abil.id;
    hero.abilityName = abil.name;
    hero.abilityDesc = abil.desc;
  } else {
    hero.abilityId = null;
    hero.abilityName = null;
    hero.abilityDesc = null;
  }
}

function placeHeroAtStart() {
  const startNode =
    GameState.map?.nodes?.find(n => n.layer === 0)?.id ??
    GameState.map?.nodes?.[0]?.id;

  if (startNode) GameState.heroPos = startNode;
  GameState.campDays = 3;
}

window.__spawnHero = (round = 1) => {
  const bases = window.__BASE_HEROES || [];
  if (!bases.length) {
    console.warn("[spawnHero] Keine baseHeroes geladen!");
    GameState.hero = createHero({ name: "Held", maxHp: 90, baseSpeed: 1 });
    applyHeroNameAndAbility(GameState.hero);
    placeHeroAtStart();
    renderMap?.();
    window.__render?.();
    return;
  }

  const base = pickRandom(bases);

  const factor = 1 + 0.15 * (round - 1);
  const scaled = {
    ...base,
    maxHp: Math.round((base.maxHp || 1) * factor),
  };

  const hero = createHero(scaled);

  // WICHTIG: HP sauber setzen
  hero.maxHp = scaled.maxHp;
  hero.hp    = scaled.maxHp;

  applyHeroNameAndAbility(hero);
  GameState.hero = hero;

  placeHeroAtStart();
  renderMap?.();
  window.__render?.();
};

// Cheat: spawn with specific ability
window.__spawnHeroWithAbilityId = (abilityId) => {
  const round = GameState.round ?? 1;
  window.__spawnHero(round);
  applyHeroNameAndAbility(GameState.hero, abilityId);
  window.__render?.();
  renderMap?.();
};

// Backwards compatibility (falls dein Cheat-UI das so aufruft)
window.__spawnHeroWithAbility = (abilityObj) => {
  const id = abilityObj?.id || null;
  window.__spawnHeroWithAbilityId(id);
};
// ------------------------------------------------------------
// HERO SPAWN (ein Held, random Name + random Ability)
// ------------------------------------------------------------


function applyNameAndAbility(hero, forcedAbilityId = null) {
  // Name: immer random aus heroes.de.json -> names
  const n = pickRandom(window.__HERO_NAMES);
  if (n) hero.name = n;

  // Ability: random oder erzwungen
  const abilities = window.__HERO_ABILITIES || [];
  let a = null;

  if (forcedAbilityId) {
    a = abilities.find(x => x.id === forcedAbilityId) || null;
  } else {
    a = pickRandom(abilities);
  }

  if (a) {
    hero.abilityId = a.id;
    hero.abilityName = a.name;
    hero.abilityDesc = a.desc;
  } else {
    hero.abilityId = null;
    hero.abilityName = null;
    hero.abilityDesc = null;
  }
}


window.__spawnHero = (round = 1, forcedAbilityId = null) => {
  // Basis-HP (kannst du frei ändern)
  const BASE_HP = 90;

  // Scaling wie vorher (15% pro Runde)
  const factor = 1 + 0.15 * (Math.max(1, round) - 1);
  const maxHp = Math.round(BASE_HP * factor);

  // createHero soll nur ein Hero-Objekt bauen (Elemente etc. darf er machen)
  const hero = createHero({
    name: "Held",
    maxHp,
    baseSpeed: 1,
  });

  // HP sicher setzen
  hero.maxHp = maxHp;
  hero.hp = maxHp;
  hero.level = round;

  // Name + Ability setzen
  applyNameAndAbility(hero, forcedAbilityId);

  // Containers
  hero.items = Array.isArray(hero.items) ? hero.items : [];
  hero.effects = Array.isArray(hero.effects) ? hero.effects : [];

  GameState.hero = hero;

  placeHeroAtStart();
  renderMap?.();
  window.__render?.();
};

// Cheat: exakt diese Fähigkeit
window.__spawnHeroWithAbilityId = (abilityId) => {
  const round = GameState.round ?? 1;
  window.__spawnHero(round, abilityId);
};

// Backwards compatibility (falls irgendwo noch ability-Objekt übergeben wird)
window.__spawnHeroWithAbility = (abilityObj) => {
  window.__spawnHeroWithAbilityId(abilityObj?.id);
};

// ------------------------------------------------------------
// Buttons
// ------------------------------------------------------------
document.querySelector("#btn-new-run").onclick = () => showLobby(ACTIVE_CARDS);

document.querySelector("#btn-end-day").onclick = () => {
  try { endDay(); } catch (e) { console.error("[endDay crash]", e); }
  try { render(); renderMap?.(); } catch (e) { console.error("[render crash]", e); }
};

document.querySelector("#btn-demon").onclick = () => showShop(PASSIVE_CARDS);

// ------------------------------------------------------------
// Run start
// ------------------------------------------------------------
window.__startRun = (chosenTplIds) => {
  GameState.round   = 1;
  GameState.day     = 1;
  GameState.maxDays = GameState.maxDays || 50;
  GameState.energy  = 0;
  GameState.souls   = 0;

  GameState.hand    = [];
  GameState.discard = [];
  GameState.placed  = new Map();

  GameState.deck = shuffle(chosenTplIds.map(tplId => newInstance(tplId, 1)));

  try { regenerateMap(1); } catch (e) { console.error("regenerateMap(1) fail", e); }

  window.__spawnHero(1);
  beginDay();

  render();
  renderMap?.();

  window.__log?.(`<b>Run start</b>: Tag ${GameState.day} • Hand=${GameState.hand.length} • Deck=${GameState.deck.length}`);
};

// ------------------------------------------------------------
// Items (optional)
// ------------------------------------------------------------
const items = await loadJSON("./data/items.de.json", []);
window.__ITEMS = items;

window.__giveHeroRandomItem = () => {
  const h = GameState.hero;
  const list = window.__ITEMS || [];
  if (!h || !list.length) return;

  const it = list[Math.floor(Math.random() * list.length)];
  h.items = Array.isArray(h.items) ? h.items : [];
  h.items.push(it.id);
  applyItemPassives(h);

  window.__log?.(`<span class="small k">🎒 Item</span>: Held erhält <b>${it.name}</b>.`);
};

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
showLobby(ACTIVE_CARDS);
render();
