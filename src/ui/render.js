// src/ui/render.js
// ============================================================================
// UI für "Infernal Path"
// - Layout: Topbar, Map links, Hand unten, Log rechts
// - Logs & Toasts
// - Hand-Rendering (Instanzen!)
// - Lobby (Deck-Auswahl)
// - Portal
// - Opferaltar & Deck-Übersicht
// - Shop
// ============================================================================

import { GameState, BASE_ENERGY, BASE_DRAW} from "../game/core/gameState.js";
import { playCard, instView, newInstance, drawCards, sacrifice, bindLogger as bindCardLogger, scaledValue, computePassiveBonuses, templateView} from "../game/cards/cards.js";
import { renderMap } from "../game/map/map.js";
import { endDay } from "../game/core/turns.js";


// ============================================================================
// Kleine Helper
// ============================================================================

function formatDescFromInst(inst) {
  const v = instView(inst);
  const val = Math.max(1, Math.floor(scaledValue(inst)));
  return (v.desc || "").replaceAll("{value}", String(val));
}

function formatDescFromTemplate(tpl, level = 1) {
  const fakeInst = { tplId: tpl.id, level };
  const val = Math.max(1, Math.floor(scaledValue(fakeInst)));
  return (tpl.desc || "").replaceAll("{value}", String(val));
}



function elementsHtml(arr) {
  if (!arr || !arr.length) return "";
  return `<div class="elems">${arr
    .map((e) => `<span class="elem ${e}">${e}</span>`)
    .join("")}</div>`;
}

/**
 * Effekt-Vorschau für eine Instanz – OHNE Element-Vulnerability,
 * damit die Karte einen stabilen „Basiswert“ zeigt.
 */
function effectPreviewFromInst(inst) {
  const v = instView(inst);
  const e = v.effect || {};
  const kind = e.kind;
  if (!kind) return "";

  const val = Math.max(1, Math.floor(scaledValue(inst)));

  if (kind === "damage" || kind === "aoe_damage") {
    return `Schaden: ${val}`;
  }
  if (kind === "dot" || kind === "bleed") {
    return `DoT: ${val}/Tag`;
  }
  if (kind === "freeze_days") {
    return `Einfrieren: ${val}T`;
  }
  
  if (kind === "weaken") {
    return `Schwächung: ${val}%`;
  }
  if (kind === "reduce_maxhp") {
    return `MaxHP -${val}`;
  }
  if (kind === "gain_souls") {
    return `+${val} Seelen`;
  }
  if (kind === "gain_energy") {
    return `+${val} Energie`;
  }

  return "";
}

/** Vorschau für Templates (z.B. Portal / Deck-Übersicht). */
function effectPreviewFromTemplate(t, level = 1) {
  const fakeInst = { tplId: t.id, level };
  return effectPreviewFromInst(fakeInst);
}

let logBox;

// ============================================================================
// Grundlayout aufbauen
// ============================================================================

export function mountUI(app) {
  app.innerHTML = `
    <div id="top-bar">
      <div id="stats"></div>
      <button id="btn-new-run">Neuer Run</button>
      <button id="btn-end-day">Tag beenden</button>
      <button id="btn-demon">👁 Dämon</button>
      <button id="btn-cheat">⚙️ Cheat</button>
    </div>


    

    <div id="main-layout">
      <div id="left-side">
        <div id="map"></div>
        <div id="hand" class="hand"></div>
        <div id="altar" class="altar">Opferaltar</div>
      </div>

      <div id="right-side">
        <div id="log" class="log"></div>
      </div>
    </div>

    <div id="overlay"><div id="overlay-inner"></div></div>
  `;
  logBox = document.querySelector("#log");

  const btnCheat = document.querySelector("#btn-cheat");
    if (btnCheat) {
      btnCheat.onclick = () => openCheatPanel();}

  const altar = document.querySelector("#altar");
  if (altar) altar.addEventListener("click", onAltarClick);
}

// ============================================================================
// Logs, Render-Hooks, Toasts
// ============================================================================

export function bindLogs() {
  // Normaler Log
  window.__log = (msg) => log(msg);

  // Karten-Engine ans selbe Log hängen
  bindCardLogger(log);

  // Re-Render, aus anderen Modulen aufrufbar
  window.__render = () => render();

  // Kleine Toasts (z.B. "SIEG", "Niederlage", "Tag 3")
  window.__toast = (html, ms = 1000) => {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = html;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 200);
    }, ms);
  };
}

function log(msg) {
  if (!logBox) return;
  const div = document.createElement("div");
  div.innerHTML = msg;
  // neue Logs OBEN einfügen
  if (logBox.firstChild) {
    logBox.insertBefore(div, logBox.firstChild);
  } else {
    logBox.appendChild(div);
  }
  logBox.scrollTop = 0;
}

// ============================================================================
// Opferaltar
// ============================================================================

function onAltarClick() {
  const s = GameState;
  const hand = s.hand;

  if (!hand.length) {
    window.__log?.(
      "Du hast keine Karten in der Hand, die du opfern könntest."
    );
    return;
  }

  const sac = s.targeting;
  if (!sac) {
    window.__log?.(
      "Wähle zuerst die Karte in deiner Hand, die du opfern willst, und klicke dann auf den Opferaltar."
    );
    return;
  }

  if (hand.length < 2) {
    window.__log?.(
      "Du brauchst mindestens eine weitere Karte in der Hand, die verstärkt werden kann."
    );
    return;
  }

  if (s.energy <= 0) {
    window.__log?.(
      "Du hast nicht genug Energie für ein Opfer (kostet 1 Energie)."
    );
    return;
  }

  const candidates = hand.filter((c) => c.uid !== sac.uid && instView(c).type !== "passiv");
  if (!candidates.length) {
    window.__log?.(
      "Keine andere Karte in der Hand zum Verstärken (nur passive Karten) gefunden."
    );
    return;
  }

  const target =
    candidates[Math.floor(Math.random() * candidates.length)];

  // Energie zahlen
  s.energy -= 1;

  const res = sacrifice(sac.uid, target.uid);

  if (res?.ok) {
    s.hand = s.hand.filter((c) => c.uid !== sac.uid);

    const viewSac = instView(sac);
    const viewTarget = instView(target);

    window.__log?.(
      `<span class="soul">Opferung</span>: <b>${viewSac.name}</b> wurde geopfert. ` +
        `<b>${viewTarget.name}</b> steigt auf L${target.level}. ` +
        `(Energie jetzt ${s.energy})`
    );

    s.targeting = null;
    window.__render?.();
  } else {
    window.__log?.("Opferung fehlgeschlagen.");
  }
}

// ============================================================================
// Haupt-Renderfunktion: Stats + Hand
// ============================================================================

export function render() {
  const s = GameState;
  const stats = document.querySelector("#stats");
  if (!stats) return;

    const h = s.hero;
  let heroStatus = "kein Held";

  if (h) {
    const rev = h.revealed || {};
    const showStrong = !!rev.strongElement;
    const showWeak   = !!rev.weakElement;
    const showAbil   = !!rev.ability;
    const showMaxHp  = !!rev.maxHp;

    const hpNow = Number.isFinite(h.hp) ? h.hp : 0;
    const hpMax = Number.isFinite(h.maxHp) ? h.maxHp : 1;

    const hpTxt = showMaxHp ? `HP ${hpNow}/${hpMax}` : `HP ?/?`;

    const tags = [
      showStrong && h.strongElement ? `🔺${h.strongElement}` : "",
      showWeak   && h.weakElement   ? `🔻${h.weakElement}`   : "",
    ].filter(Boolean).join(" ");

    const abilTxt = showAbil && h.abilityName ? ` • Fähigkeit: ${h.abilityName}` : ` • Fähigkeit: ?`;

    heroStatus =
      `<b id="hero-name" style="cursor:pointer">${h.name}</b> – ${hpTxt}` +
      `${tags ? " • " + tags : ""}` +
      ` • 🎒 <span id="hero-inv" style="cursor:pointer">Inventar</span>` +
      ` • ✨ <span id="hero-eff" style="cursor:pointer">Effekte</span>` +
      abilTxt;
  }


  // ---- Click: Held umbenennen ----
  const heroNameEl = document.querySelector("#hero-name");
  if (heroNameEl && GameState.hero) {
    heroNameEl.onclick = () => {
      openOverlay();
      const inner = document.querySelector("#overlay-inner");
      const current = GameState.hero?.name || "";

      inner.innerHTML = `
        <h2>Held umbenennen</h2>
        <div class="panel">
          <div class="small muted">Neuer Name:</div>
          <input id="hero-rename" value="${current}"
            style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:#141322;color:#e7e4f2" />
          <div style="display:flex;gap:8px;margin-top:10px">
            <button id="hero-rename-save" class="primary">Speichern</button>
            <button id="hero-rename-cancel" class="warn">Abbrechen</button>
          </div>
        </div>
      `;

      inner.querySelector("#hero-rename-save").onclick = () => {
        const v = inner.querySelector("#hero-rename").value.trim();
        if (v) GameState.hero.name = v;
        closeOverlay();
        window.__render?.();
      };
      inner.querySelector("#hero-rename-cancel").onclick = () => closeOverlay();
    };
  }

  // ---- Click: Inventar ----
  const invEl = document.querySelector("#hero-inv");
  if (invEl && GameState.hero) {
    invEl.onclick = () => {
      openOverlay();
      const inner = document.querySelector("#overlay-inner");

      const ids = Array.isArray(GameState.hero.items) ? GameState.hero.items : [];
      const all = window.__ITEMS || [];
      const named = ids.map(id => all.find(x => x.id === id)?.name || id);

      inner.innerHTML = `
        <h2>Inventar</h2>
        <div class="panel">
          ${named.length ? `<ul>${named.map(n => `<li>${n}</li>`).join("")}</ul>` : `<div class="small muted">Keine Items.</div>`}
          <button id="close" class="warn" style="margin-top:10px">Schließen</button>
        </div>
      `;
      inner.querySelector("#close").onclick = () => closeOverlay();
    };
  }

  // ---- Click: Effekte ----
  const effEl = document.querySelector("#hero-eff");
  if (effEl && GameState.hero) {
    effEl.onclick = () => {
      openOverlay();
      const inner = document.querySelector("#overlay-inner");

      const effs = Array.isArray(GameState.hero.effects) ? GameState.hero.effects : [];
      const defs = window.__EFFECTS || [];

      const lines = effs.map(e => {
        const def = defs.find(d => d.id === e.id);
        const name = def?.name || e.id;
        const stacks = e.stacks ?? 1;
        const days = e.daysLeft == null ? "∞" : e.daysLeft;
        return `<li><b>${name}</b> ×${stacks} <span class="small muted">(Tage: ${days})</span></li>`;
      });

      inner.innerHTML = `
        <h2>Aktive Effekte</h2>
        <div class="panel">
          ${lines.length ? `<ul>${lines.join("")}</ul>` : `<div class="small muted">Keine aktiven Effekte.</div>`}
          <button id="close" class="warn" style="margin-top:10px">Schließen</button>
        </div>
      `;
      inner.querySelector("#close").onclick = () => closeOverlay();
    };
  }


  stats.innerHTML = `
    <b>Tag ${s.day}</b> |
    <b>Runde ${s.round ?? 1}</b> |
    Energie: ${s.energy}/${BASE_ENERGY} |
    Seelen: ${s.souls} |
    Hand: ${s.hand.length} |
    <span id="stat-deck" class="k" style="cursor:pointer">Deck: ${
      s.deck.length
    }</span> |
    ${heroStatus}
  `;

  const deckEl = document.querySelector("#stat-deck");
  if (deckEl) deckEl.onclick = () => openDeckBrowser();


  // Hand
  const hand = document.querySelector("#hand");
  hand.innerHTML = "";
  s.hand.forEach((inst) => {
    const c = instView(inst);

    const preview = effectPreviewFromInst(inst);

    const div = document.createElement("div");
    div.className = "card";
    div.draggable = true;
    div.innerHTML = `
      <div class="cost">${c.type === "passiv" ? "" : `L${inst.level || 1}`}</div>
      <div class="badge">${c.type}</div>
      <div class="name">${c.name}</div>
      <div class="desc small">${formatCardDesc(inst)}</div>
      ${
        preview
          ? `<div class="mini small muted">${preview}</div>`
          : ""
      }
      ${elementsHtml(c.elements || [])}
    `;
    div.onclick = () => {
      if (s.targeting === inst) {
        s.targeting = null;
        log(`Auswahl aufgehoben.`);
      } else {
        s.targeting = inst;
        log(`Karte gewählt: ${c.name} (L${inst.level || 1})`);
      }
      renderMap?.();
    };

    hand.appendChild(div);
  });
}

// ============================================================================
// Overlay-Helfer
// ============================================================================

export function openOverlay() {
  const ov = document.querySelector("#overlay");
  if (!ov) return;
  ov.style.display = "flex";
  ov.classList.add("open");
}

export function closeOverlay() {
  const ov = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  if (ov) {
    ov.style.display = "none";
    ov.classList.remove("open");
  }
  if (inner) inner.innerHTML = "";
}

// ============================================================================
// PORTAL
// ============================================================================

export function showPortalOffer(cards, drawCount = BASE_DRAW) {
  const overlay = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  if (!overlay || !inner) return;

  openOverlay();

  const round = GameState.round ?? 1;
  const level = round;

  const picks = shuffleArray(cards).slice(0, 3);
  inner.innerHTML = `
    <h2>Portal öffnet sich</h2>
    <p>Wähle 1 Karte. Danach wird deine Tageshand gezogen.</p>
    <div id="portal-grid" class="grid"></div>
  `;

  const grid = inner.querySelector("#portal-grid");

  picks.forEach((tpl) => {
    const preview = effectPreviewFromTemplate(tpl, level);
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="cost">L${level}</div>
      <div class="badge">${tpl.type}</div>
      <div class="name">${tpl.name}</div>
      <div class="desc small">${tpl.desc}</div>
      ${
        preview
          ? `<div class="mini small muted">${preview}</div>`
          : ""
      }
      ${elementsHtml(tpl.elements || [])}
    `;

    div.onclick = () => {
      try {
        const inst = newInstance(tpl.id, level);
        GameState.deck.push(inst);
        shuffleInPlace(GameState.deck);
        closeOverlay();

        drawCards(drawCount);

        window.__log?.(
          `<span class="small">Portal: ${tpl.name} (L${level}) ins Deck gelegt, Tageshand gezogen.</span>`
        );
        window.__render?.();
        renderMap?.();
      } catch (e) {
        console.error("Portal-Klick-Fehler:", e);
        window.__log?.(
          `<span class="small soul">Portal-Fehler: ${e.message}</span>`
        );
      }
    };

    grid.appendChild(div);
  });
}

// ============================================================================
// LOBBY / DECK-EDITOR
// ============================================================================

export function showLobby(allCards) {
  const ov = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  openOverlay();

  const selected = new Set();
  let q = "";
  let filterType = "alle";

  const TYPES = [
    "alle",
    "kontrolle",
    "daemon",
    "ritual",
    "eroberung",
    "spezial",
  ];

  const draw = () => {
    inner.innerHTML = `
      <div class="lobby-wrap">
        <div class="lobby-head">
          <h2>Lobby – Deck auswählen (10 Karten)</h2>
          <div class="lobby-tools">
            <input id="lobby-search" placeholder="Suche..." style="padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:#1b1626;color:var(--text)" />
            <div id="lobby-types" class="types" style="display:flex;gap:6px"></div>
            <span class="lobby-counter">${selected.size}/10</span>
            <button id="btn-random10">Zufällige 10</button>
            <button id="btn-clear">Leeren</button>
            <button id="btn-start" class="primary" ${
              selected.size !== 10 ? "disabled" : ""
            }>Run starten</button>
            <button id="btn-close" class="warn">Schließen</button>
          </div>
        </div>
        <div class="lobby-grid" id="lobby-grid"></div>
      </div>
    `;

    const typesEl = inner.querySelector("#lobby-types");
    TYPES.forEach((t) => {
      const b = document.createElement("button");
      b.className = "pill" + (filterType === t ? " active" : "");
      b.textContent = t;
      b.onclick = () => {
        filterType = t;
        draw();
      };
      typesEl.appendChild(b);
    });

    const search = inner.querySelector("#lobby-search");
    search.value = q;
    search.oninput = (e) => {
      q = e.target.value.toLowerCase();
      renderGrid();
    };

    inner.querySelector("#btn-random10").onclick = () => {
      selected.clear();
      const shuffled = shuffleArray(allCards);
      for (
        let i = 0;
        i < shuffled.length && selected.size < 10;
        i++
      ) {
        selected.add(shuffled[i].id);
      }
      draw();
    };

    inner.querySelector("#btn-clear").onclick = () => {
      selected.clear();
      draw();
    };

    inner.querySelector("#btn-start").onclick = () => {
      if (selected.size !== 10) return;
      closeOverlay();
      window.__startRun?.(Array.from(selected));
    };

    inner.querySelector("#btn-close").onclick = closeOverlay;

    renderGrid();
  };

  const renderGrid = () => {
    const grid = inner.querySelector("#lobby-grid");
    grid.innerHTML = "";

    const filtered = allCards.filter((c) => {
      const tOk = filterType === "alle" || c.type === filterType;
      const qOk =
        !q ||
        c.name?.toLowerCase().includes(q) ||
        c.desc?.toLowerCase().includes(q) ||
        c.id?.toLowerCase().includes(q);
      return tOk && qOk;
    });

    filtered.forEach((c) => {
      const sel = selected.has(c.id);
      const preview = effectPreviewFromTemplate(c, 1);
      const div = document.createElement("div");
      div.className = "card pick" + (sel ? " selected" : "");
      div.innerHTML = `
        <div class="cost">${c.cost ?? 1}</div>
        <div class="badge">${c.type}</div>
        <div class="name">${c.name}</div>
        <div class="mini">${c.id}</div>
        <div class="desc small">${formatDescFromTemplate(c, 1)}</div>
        ${
          preview
            ? `<div class="mini small muted">${preview}</div>`
            : ""
        }
        ${elementsHtml(c.elements || [])}
      `;
      div.onclick = () => {
        if (sel) {
          selected.delete(c.id);
        } else if (selected.size < 10) {
          selected.add(c.id);
        }
        draw();
      };
      grid.appendChild(div);
    });
  };

  draw();
}

// ============================================================================
// Shop
// ============================================================================



export function showShop(allCards) {
  const ov    = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  if (!ov || !inner) return;

  openOverlay();

  // --- Passiv-Boni ---
  const pass = computePassiveBonuses();
  const extraSlots = pass.shopSlotsBonus || 0;
  const slots = 3 + extraSlots;

  // Pool: nur Passiv-Karten
  const passives = (allCards || []).filter(c => c.type === "passiv");

  // State init
  GameState.mods = GameState.mods || {};
  if (GameState.mods.freeRerollsLeft == null) GameState.mods.freeRerollsLeft = 0;

  // Hilfsfunktion: Picks neu würfeln
  const rollOffers = () => shuffleArray(passives).slice(0, Math.min(slots, passives.length));

  // ✅ Auto-Refresh pro Runde (Held gestorben => round changed => neue offers)
  if (GameState.mods.shopOffersRound !== (GameState.round ?? 1)) {
    GameState.mods.shopOffersRound = (GameState.round ?? 1);
    GameState.mods.shopOffers = rollOffers();
  }

  // offers aus State lesen (damit es beim Schließen/Öffnen gleich bleibt)
  let offers = Array.isArray(GameState.mods.shopOffers) ? [...GameState.mods.shopOffers] : rollOffers();

  const renderShop = () => {
    const souls = GameState.souls ?? 0;
    const penalty = GameState.mods?.shopPenalty || 0;

    inner.innerHTML = `
      <div class="lobby-wrap">
        <div class="lobby-head">
          <h2>Shop</h2>
          <div class="lobby-tools">
            <span class="lobby-counter">Seelen: ${souls}</span>
            <button id="btn-reroll">Reroll</button>
            <button id="btn-close-shop" class="warn">Schließen</button>
          </div>
        </div>
        <div class="small muted" style="margin-bottom:8px">
          Slots: ${slots} • Gratis-Rerolls: ${GameState.mods.freeRerollsLeft || 0}${penalty ? ` • Nächster Einkauf +${penalty}` : ""}
        </div>
        <div class="lobby-grid" id="shop-grid"></div>
      </div>
    `;

    const grid = inner.querySelector("#shop-grid");

    // falls alle weggekauft: kleine Info
    if (!offers.length) {
      grid.innerHTML = `<div class="panel small muted">Ausverkauft. Nutze Reroll oder warte auf die nächste Runde.</div>`;
    }

    offers.forEach((tpl) => {
      const shopCost  = Math.max(0, Math.round(tpl.shopCost ?? 6));
      const finalCost = shopCost + (GameState.mods?.shopPenalty || 0);

      const preview = (() => {
        // Passive skalieren bei dir eh nicht wirklich (growth 0),
        // aber wir lassen es drin, falls du später bases ändern willst.
        const fakeInst = { tplId: tpl.id, level: 1 };
        const val = Math.max(1, Math.floor(scaledValue(fakeInst)));
        const kind = tpl.effect?.kind;

        if (kind === "passive_elem_pct") return `+${tpl.effect?.base ?? val}% ${tpl.effect?.element}-Schaden`;
        if (kind === "passive_per_element_pct") return `+${tpl.effect?.base ?? val}% pro Element`;
        if (kind === "passive_dot_pct") return `+${tpl.effect?.base ?? val}% DoT`;
        if (kind === "passive_dot_days") return `DoT +${tpl.effect?.base ?? val} Tag(e)`;
        if (kind === "passive_lowhp_taken_pct") return `+${tpl.effect?.base ?? val}% unter ${(tpl.effect?.threshold ?? 0.3) * 100}% HP`;
        if (kind === "passive_draw") return `+${tpl.effect?.base ?? val} Handkarte`;
        if (kind === "passive_energy") return `+${tpl.effect?.base ?? val} Energie`;
        if (kind === "passive_souls_pct") return `+${tpl.effect?.base ?? val}% Seelen`;
        if (kind === "passive_sacrifice_level") return `Opferung +${tpl.effect?.base ?? val} Level`;
        if (kind === "passive_shop_slots") return `Shop +${tpl.effect?.base ?? val} Slot`;
        if (kind === "passive_free_reroll") return `+${tpl.effect?.base ?? val} Gratis-Reroll`;
        if (kind === "passive_reveal") return `Deckt ${tpl.effect?.base ?? val} Trait auf`;
        return "";
      })();

      const affordable = (GameState.souls ?? 0) >= finalCost;

      const div = document.createElement("div");
      div.className = "card shop-card";
      div.innerHTML = `
        <div class="badge">passiv</div>
        <div class="name">${tpl.name}</div>
        <div class="desc small">${tpl.desc || ""}</div>
        ${preview ? `<div class="mini small muted">${preview}</div>` : ""}
        <div class="desc small">Kosten: ${shopCost}${(GameState.mods?.shopPenalty || 0) ? ` (+${GameState.mods.shopPenalty})` : ""} = <b>${finalCost}</b></div>
        <button class="primary" ${affordable ? "" : "disabled"}>Kaufen</button>
      `;

      div.querySelector("button").onclick = () => {
        if (!affordable) return;

        GameState.souls -= finalCost;
        if (GameState.mods?.shopPenalty) GameState.mods.shopPenalty = 0; // “nächster Einkauf”

        // ✅ Passive Karten ohne Level -> immer level 1
        const inst = newInstance(tpl.id, 1);
        GameState.deck.push(inst);

        // ✅ Gekaufte Karte aus Shop entfernen
        offers = offers.filter(x => x.id !== tpl.id);

        // ✅ In State zurückschreiben, damit es auch nach schließen so bleibt
        GameState.mods.shopOffers = [...offers];

        window.__log?.(`<span class="k">Gekauft</span>: <b>${tpl.name}</b> ins Deck.`);
        window.__render?.();
        renderShop(); // refresh (zeigt dann nur noch die restlichen)
      };

      grid.appendChild(div);
    });

    inner.querySelector("#btn-close-shop").onclick = () => closeOverlay();

    inner.querySelector("#btn-reroll").onclick = () => {
      // 1) gratis rerolls zuerst verbrauchen
      if ((GameState.mods.freeRerollsLeft || 0) > 0) {
        GameState.mods.freeRerollsLeft--;
        offers = rollOffers();
        GameState.mods.shopOffers = [...offers];
        renderShop();
        return;
      }

      // 2) sonst kostet reroll z.B. 2 seelen
      const rerollCost = 2;
      if ((GameState.souls ?? 0) < rerollCost) {
        window.__log?.("Nicht genug Seelen für Reroll.");
        return;
      }
      GameState.souls -= rerollCost;
      offers = rollOffers();
      GameState.mods.shopOffers = [...offers];
      renderShop();
    };
  };

  renderShop();
}



// ============================================================================
// Cheat
// ============================================================================

function openCheatPanel() {
  const ov = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  if (!ov || !inner) {
    window.__log?.("Overlay fehlt – Cheatpanel kann nicht geöffnet werden.");
    return;
  }

  openOverlay();

  inner.innerHTML = `
    <div class="lobby-wrap">
      <div class="lobby-head">
        <h2>Dev-Cheats</h2>
        <button id="cheat-close" class="warn">Schließen</button>
      </div>

      <div class="small muted" style="margin-bottom:10px">
        Nur zum Testen. Du kannst Runs absichtlich kaputt machen – dafür ist es da.
      </div>

      <div class="lobby-grid" style="grid-template-columns:1fr;">
        <div class="panel">
          <h3>Held</h3>
          <button id="cheat-reveal-one">👁 Reveal 1 zufällig</button>
          <button id="cheat-toggle-revealall">👁 Toggle: Alles sichtbar</button>
          <button id="cheat-kill-hero" class="warn">Held sofort töten (endDay)</button>
          <button id="cheat-freeze-hero">Held einfrieren (+1 Tag)</button>
          <button id="cheat-heal-hero">Held voll heilen</button>
        </div>

        <div class="panel">
          <h3>Fähigkeit wählen (Held neu spawnen)</h3>
          <div id="cheat-abilities" class="grid"></div>
        </div>


        <div class="panel">
          <h3>Run / Werte</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <label class="small muted">Seelen</label>
            <input id="cheat-souls" type="number" min="0" value="10"
              style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:#141322;color:#e7e4f2;width:90px" />
            <button id="cheat-add-souls">+ geben</button>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
            <label class="small muted">Energie</label>
            <input id="cheat-energy" type="number" min="0" value="3"
              style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:#141322;color:#e7e4f2;width:90px" />
            <button id="cheat-set-energy">setzen</button>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
            <label class="small muted">Runde</label>
            <input id="cheat-round" type="number" min="1" value="${GameState.round ?? 1}"
              style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:#141322;color:#e7e4f2;width:90px" />
            <button id="cheat-set-round">setzen</button>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
            <label class="small muted">Tag</label>
            <input id="cheat-day" type="number" min="1" value="${GameState.day ?? 1}"
              style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:#141322;color:#e7e4f2;width:90px" />
            <button id="cheat-set-day">setzen</button>
          </div>
        </div>

        <div class="panel">
          <h3>Karte spawnen (in Hand)</h3>
          <div class="small muted">Template-ID + Level</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">
            <input id="cheat-card-id" placeholder='z.B. "blutstacheln"'
              style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:#141322;color:#e7e4f2;width:220px" />
            <input id="cheat-card-lvl" type="number" min="1" value="1"
              style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:#141322;color:#e7e4f2;width:80px" />
            <button id="cheat-spawn-card">Spawnen</button>
          </div>
        </div>

        <div class="panel">
          <h3>Debug</h3>
          <button id="cheat-print-state">State in Console loggen</button>
          <button id="cheat-clear-hand">Hand leeren</button>
          <button id="cheat-clear-placed">Placed leeren</button>
        </div>
      </div>
    </div>
  `;

  // Close
  inner.querySelector("#cheat-close").onclick = () => closeOverlay();

  // Held töten
  inner.querySelector("#cheat-kill-hero").onclick = () => {
    if (!GameState.hero) {
      window.__log?.("Kein Held aktiv.");
      return;
    }
    GameState.hero.hp = 0;
    window.__log?.("<b>Cheat</b>: Held auf 0 HP gesetzt → endDay()");
    try { endDay(); } catch (e) { console.error("endDay crash (cheat)", e); }
    window.__render?.();
  };

  // Helde fähikeit 
  const abilGrid = inner.querySelector("#cheat-abilities");
  const abilities = window.__HERO_ABILITIES || [];

  abilities.forEach(a => {
    const btn = document.createElement("button");
    btn.textContent = a.name;
    btn.onclick = () => {
      // aktuellen Held töten
      if (GameState.hero) GameState.hero.hp = 0;

      // neue Runde erzwingen
      GameState.round = Math.max(1, (GameState.round || 1));

      // neuen Held mit gewählter Fähigkeit spawnen
      window.__spawnHeroWithAbility?.(a);

      closeOverlay();
      window.__log?.(`<b>Cheat</b>: Neuer Held mit Fähigkeit <b>${a.name}</b>`);
    };
    abilGrid.appendChild(btn);
  });

  // SIchbar machen
  inner.querySelector("#cheat-reveal-one").onclick = () => {
    window.__cheatRevealOne?.();
    window.__render?.();
    };

    inner.querySelector("#cheat-toggle-revealall").onclick = () => {
    window.__cheatToggleRevealAll?.();
    };


  // Freeze +1 Tag
  inner.querySelector("#cheat-freeze-hero").onclick = () => {
    if (!GameState.hero) return window.__log?.("Kein Held aktiv.");
    GameState.hero.status = GameState.hero.status || {};
    GameState.hero.status.frozenDays = (GameState.hero.status.frozenDays || 0) + 1;
    window.__log?.("<b>Cheat</b>: Held eingefroren (+1 Tag).");
    window.__render?.();
  };

  // Heal full
  inner.querySelector("#cheat-heal-hero").onclick = () => {
    if (!GameState.hero) return window.__log?.("Kein Held aktiv.");
    GameState.hero.hp = GameState.hero.maxHp;
    window.__log?.("<b>Cheat</b>: Held voll geheilt.");
    window.__render?.();
  };

  // Souls geben
  inner.querySelector("#cheat-add-souls").onclick = () => {
    const n = Number(inner.querySelector("#cheat-souls").value || "0");
    if (!Number.isFinite(n) || n < 0) return window.__log?.("Ungültige Seelenzahl.");
    GameState.souls = (GameState.souls || 0) + Math.floor(n);
    window.__log?.(`<b>Cheat</b>: +${Math.floor(n)} Seelen.`);
    window.__render?.();
  };

  // Energy setzen
  inner.querySelector("#cheat-set-energy").onclick = () => {
    const n = Number(inner.querySelector("#cheat-energy").value || "0");
    if (!Number.isFinite(n) || n < 0) return window.__log?.("Ungültige Energie.");
    GameState.energy = Math.floor(n);
    window.__log?.(`<b>Cheat</b>: Energie = ${GameState.energy}.`);
    window.__render?.();
  };

  // Round setzen
  inner.querySelector("#cheat-set-round").onclick = () => {
    const n = Number(inner.querySelector("#cheat-round").value || "1");
    if (!Number.isFinite(n) || n < 1) return window.__log?.("Ungültige Runde.");
    GameState.round = Math.floor(n);
    // Held-Level optional anpassen, damit Chance-System passt
    if (GameState.hero) GameState.hero.level = GameState.round;
    window.__log?.(`<b>Cheat</b>: Runde = ${GameState.round}.`);
    window.__render?.();
  };

  // Day setzen
  inner.querySelector("#cheat-set-day").onclick = () => {
    const n = Number(inner.querySelector("#cheat-day").value || "1");
    if (!Number.isFinite(n) || n < 1) return window.__log?.("Ungültiger Tag.");
    GameState.day = Math.floor(n);
    window.__log?.(`<b>Cheat</b>: Tag = ${GameState.day}.`);
    window.__render?.();
  };

  // Karte spawnen
  inner.querySelector("#cheat-spawn-card").onclick = () => {
    const tplId = (inner.querySelector("#cheat-card-id").value || "").trim();
    const lvl = Math.max(1, Number(inner.querySelector("#cheat-card-lvl").value || "1"));

    if (!tplId) return window.__log?.("Bitte Template-ID eingeben.");

    try {
      // templateView wirft Error, wenn es nicht existiert
      const tpl = templateView(tplId);
      const inst = newInstance(tplId, lvl);
      GameState.hand.push(inst);

      window.__log?.(
        `<b>Cheat</b>: Karte <b>${tpl.name}</b> (L${lvl}) in die Hand gelegt.`
      );
      window.__render?.();
    } catch (e) {
      console.error("Cheat spawn error", e);
      window.__log?.(`Template "${tplId}" nicht gefunden.`);
    }
  };

  // Debug State
  inner.querySelector("#cheat-print-state").onclick = () => {
    console.log("GameState", GameState);
    window.__log?.("<b>Cheat</b>: GameState in Console geloggt.");
  };

  // Hand leeren
  inner.querySelector("#cheat-clear-hand").onclick = () => {
    GameState.hand = [];
    window.__log?.("<b>Cheat</b>: Hand geleert.");
    window.__render?.();
  };

  // placed leeren
  inner.querySelector("#cheat-clear-placed").onclick = () => {
    GameState.placed = new Map();
    window.__log?.("<b>Cheat</b>: Alle Platzierungen entfernt.");
    window.__render?.();
  };
}


// ============================================================================
// Deck-Übersicht
// ============================================================================

function openDeckBrowser() {
  const ov = document.querySelector("#overlay");
  const inner = document.querySelector("#overlay-inner");
  if (!ov || !inner) return;

  openOverlay();

  const deckViews = GameState.deck.map((inst) => instView(inst));

  const byId = new Map();
  for (const v of deckViews) {
    const key = v.tplId || v.id;
    if (!byId.has(key)) {
      byId.set(key, { ...v, count: 1 });
    } else {
      byId.get(key).count++;
    }
  }

  inner.innerHTML = `
    <div class="lobby-wrap">
      <div class="lobby-head">
        <h2>Deck-Übersicht (${GameState.deck.length} Karten)</h2>
        <button id="deck-close" class="warn">Schließen</button>
      </div>
      <div class="lobby-grid" id="deck-grid"></div>
    </div>
  `;

  const grid = inner.querySelector("#deck-grid");
  byId.forEach((v) => {
    const preview = effectPreviewFromTemplate(v, v.level || 1);
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="cost">L${v.level || 1}</div>
      <div class="badge">${v.type}</div>
      <div class="name">${v.name}</div>
      <div class="mini">${v.id || v.tplId}</div>
      <div class="desc small">${v.desc || ""}</div>
      ${v.count > 1 ? `<div class="badge">×${v.count}</div>` : ""}
      ${
        preview
          ? `<div class="mini small muted">${preview}</div>`
          : ""
      }
      ${elementsHtml(v.elements || [])}
    `;
    grid.appendChild(div);
  });

  const btnClose = inner.querySelector("#deck-close");
  if (btnClose) btnClose.onclick = () => closeOverlay();
}

// ============================================================================
// Utilities
// ============================================================================

function shuffleArray(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================================
// Karten schade mitgehen zum Level
// ============================================================================

function formatCardDesc(inst) {
  const v = instView(inst);
  const e = v.effect || {};
  const kind = e.kind;

  // skaliertes "Haupt"-Value (dmg/dot/pct/etc.)
  const val = Math.max(1, Math.floor(scaledValue(inst)));

  // Token-Map: alles was im Text vorkommen könnte
  const tokens = {
    value: val,
    val: val,
    dmg: val,
    dot: val,
    pct: val,

    days: e.days ?? "",
    hits: e.hits ?? "",
    delay: e.delayDays ?? "",
    element: e.element ?? "",
    threshold: e.threshold != null ? Math.round(e.threshold * 100) : "",
    souls: ""
  };

  // Sonderfälle pro Effekt
  if (kind === "damage_plus_souls") {
    const soulsBase = Math.max(0, Math.round(e.soulsBase ?? 0));
    const soulsGrowth = Math.max(0, Number(e.soulsGrowth ?? 0));
    const lvl = inst.level || 1;
    const souls = Math.max(0, Math.round(soulsBase + (lvl - 1) * soulsGrowth));
    tokens.souls = souls;
  }

  if (kind === "kill_bonus_souls") {
    // bei dir ist effect.base die souls-zahl
    tokens.souls = Math.max(0, Math.round(e.base ?? val));
  }

  // Default: original desc wenn leer
  let desc = v.desc || "";

  // Alle {xyz} ersetzen:
  desc = desc.replace(/\{(\w+)\}/g, (_, key) => {
    if (tokens[key] == null) return `{${key}}`;
    return String(tokens[key]);
  });

  return desc;
}


