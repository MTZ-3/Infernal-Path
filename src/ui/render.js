// ============================================================================
// UI: Layout, Logs, Hand-Rendering, Draft & Portal
// Dieses UI arbeitet mit dem INSTANZ-Modell (Deck/Hand enthalten Instanzen).
// Templates (Name, Kosten, Elemente, Effekt) kommen aus der Card-Library.
// ============================================================================

import { GameState, BASE_ENERGY } from "../game/core/gameState.js";
import { playCard, instView, newInstance } from "../game/cards/cards.js";

// Kleine Helper: Element-Badges
function elementsHtml(arr){
  if(!arr || !arr.length) return "";
  return `<div class="elems">${arr.map(e=>`<span class="elem ${e}">${e}</span>`).join("")}</div>`;
}

let logBox;

// ----------------------------------------------------
// ========== UI Setup ==========
// ----------------------------------------------------
// Baut die Grundstruktur (Topbar, zweispaltiges Layout, Overlay).
export function mountUI(app) {
  app.innerHTML = `
    <div id="top-bar">
      <div id="stats"></div>
      <button id="btn-new-run">Neuer Run</button>
      <button id="btn-end-day">Tag beenden</button>
      <button id="btn-demon">👁 Dämon</button>
    </div>

    <div id="main-layout">
      <div id="left-side">
        <div id="map"></div>
        <div id="runes"></div>
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
}

// ----------------------------------------------------
// ========== Log- & Renderfunktionen ==========
// ----------------------------------------------------
// Bindet globale Log/Render-Funktionen an window (für andere Module).
export function bindLogs() {
  window.__log = (msg) => log(msg);
  window.__render = () => render();
  // Nicht-blockierende Kurzmeldung (~1s)
  window.__toast = (html, ms = 1000) => {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = html;
    document.body.appendChild(t);
    // kleines Fade-in
    requestAnimationFrame(() => t.classList.add("show"));
    // Auto-hide
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
  logBox.appendChild(div);
  logBox.scrollTop = logBox.scrollHeight;
}

// Zeichnet Stats + Hand.
// WICHTIG: Hand enthält INSTANZEN → für Anzeige nutzen wir instView(inst)
export function render() {
  const s = GameState;
  const stats = document.querySelector("#stats");
  if (!stats) return;

  const h = s.hero;
  const heroStatus = h
    ? `<b>${h.name}</b> – HP ${h.hp}/${h.maxHp} – ${h.alive !== false ? "Lebt" : "Tot"}`
    : "kein Held";

  stats.innerHTML = `
    <b>Tag ${s.day}</b> |
    <b>Runde ${s.round}</b> |
    Energie: ${s.energy}/${BASE_ENERGY} |
    Seelen: ${s.souls} |
    Hand: ${s.hand.length} |
    Deck: ${s.deck.length} |
    ${heroStatus}
  `;

  // Hand neu zeichnen (Instanzen!)
  const hand = document.querySelector("#hand");
  hand.innerHTML = "";
  s.hand.forEach((inst) => {
    const c = instView(inst); // {name, type, desc, elements, cost, level, ...}
    const div = document.createElement("div");
    div.className = "card";
    div.draggable = true;
    div.innerHTML = `
      <div class="cost">${c.cost ?? 1}</div>
      <div class="badge">${c.type}</div>
      <div class="name">${c.name} <span class="small muted">· L${inst.level||1}</span></div>
      <div class="desc small">${c.desc}</div>
      ${elementsHtml(c.elements || [])}
    `;
    // Beim Klicken: diese INSTANZ als Target setzen
    div.onclick = () => {
      s.targeting = inst;
      log(`Karte gewählt: ${c.name} (L${inst.level||1})`);
    };
    hand.appendChild(div);
  });
}

// ----------------------------------------------------
// ========== Overlays (Draft / Portal) ==========
// ----------------------------------------------------
// Draft: Zeigt Vorlagen (Templates). Beim Bestätigen ruft main.js -> __startRun(chosenTplIds)




// Overlay sauber schließen
function closeOverlayFullscreen() {
  const overlay = document.querySelector("#overlay");
  const inner   = document.querySelector("#overlay-inner");
  overlay.style.display = "none";
  overlay.classList.remove("fullscreen");
  inner.classList.remove("fullscreen");
  document.documentElement.style.overflow = "";
}
// Overlay öffnen/schließen — global verfügbar für Lobby, Draft, Portal etc.
export function openOverlay(){
  const ov = document.querySelector('#overlay');
  ov?.classList.add('open');
  ov && (ov.style.display = 'flex'); // optional doppelt-robust
}
export function closeOverlay(){
  const ov = document.querySelector('#overlay');
  const inner = document.querySelector('#overlay-inner');
  ov?.classList.remove('open');
  ov && (ov.style.display = 'none'); // optional
  if(inner) inner.innerHTML = '';
}


// Portal: 3 Vorlagen zur Wahl; Auswahl wird als INSTANZ ins DECK gelegt
// Level = aktuelle Runde (ab Runde 2 → Level 2, etc.)
export function showPortalOffer(cards) {
  const overlay = document.querySelector("#overlay");
  const inner   = document.querySelector("#overlay-inner");

  // UI vorbereiten
  inner.classList.remove("fullscreen");
  overlay.classList.remove("fullscreen");
  overlay.style.display = "flex";

  const picks = shuffle(cards).slice(0, 3); // 3 zufällige TEMPLATES
  inner.innerHTML = `
    <h2>Portal öffnet sich</h2>
    <p>Wähle 1 Karte (Level ${Math.max(1, GameState.round || 1)}).</p>
    <div id="portal-grid" class="grid"></div>
    <div style="margin-top:10px; display:flex; justify-content:flex-end">
      <button id="portal-cancel">Schließen</button>
    </div>
  `;

  const grid = inner.querySelector("#portal-grid");
  const lvl  = Math.max(1, GameState.round || 1); // ← Regel: Level = Runde

  picks.forEach((tpl) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="cost">${tpl.cost ?? 1}</div>
      <div class="badge">${tpl.type}</div>
      <div class="name">${tpl.name} <span class="small muted">· L${lvl}</span></div>
      <div class="desc small">${tpl.desc}</div>
      ${elementsHtml(tpl.elements || [])}
    `;
    div.onclick = () => {
      // Instanz bauen mit gewünschtem Level
      const inst = newInstance(tpl.id, lvl);

      // Design-Entscheidung: INS DECK legen, leicht mischen, und 1 Karte nachziehen
      GameState.deck.push(inst);
      // leichtes Shuffle (lokal, ohne extra Import)
      for (let i = GameState.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [GameState.deck[i], GameState.deck[j]] = [GameState.deck[j], GameState.deck[i]];
      }

      // optional: sofort eine Karte ziehen (fühlt sich „rewarding“ an)
      // Achtung: drawCards ist in cards.js – falls du hier ziehen willst, importiere es oben.
      // import { drawCards } from "../game/cards/cards.js";
      // drawCards(1);

      overlay.style.display = "none";
      window.__log?.(`Portal: ${tpl.name} (L${lvl}) erhalten.`);
      window.__render?.();
    };
    grid.appendChild(div);
  });

  // Schließen-Button & Klick auf Overlay-Hintergrund
  inner.querySelector("#portal-cancel").onclick = () => (overlay.style.display = "none");
  overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = "none"; };
}


// ----------------------------------------------------
// Hilfsfunktionen (nur für UI)
// ----------------------------------------------------
function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}


/**
 * LOBBY / DECK-EDITOR
 * - Spieler wählt exakt 10 Karten
 * - Zufall / Leeren / Filter / Suche
 * - Starten → __startRun(selectedIds)
 */
export function showLobby(allCards){
  const ov = document.querySelector('#overlay');
  const inner = document.querySelector('#overlay-inner');
  openOverlay();

  // Lokaler State
  const selected = new Set();          // genau 10 ids
  let q = "";                          // Suchstring
  let filterType = "alle";             // Kartentyp-Filter

  const TYPES = ["alle","fluch","kontrolle","daemon","ritual","eroberung","spezial"];

  const draw = ()=>{
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
            <button id="btn-start" class="primary" ${selected.size!==10?"disabled":""}>Run starten</button>
            <button id="btn-close" class="warn">Schließen</button>
          </div>
        </div>
        <div class="lobby-grid" id="lobby-grid"></div>
      </div>
    `;

    // Filter-Pills
    const typesEl = inner.querySelector('#lobby-types');
    TYPES.forEach(t=>{
      const b = document.createElement('button');
      b.className = 'pill' + (filterType===t?' active':'');
      b.textContent = t;
      b.onclick = ()=>{ filterType=t; draw(); };
      typesEl.appendChild(b);
    });

    // Suche
    const search = inner.querySelector('#lobby-search');
    search.value = q;
    search.oninput = (e)=>{ q = e.target.value.toLowerCase(); renderGrid(); };

    // Buttons
    inner.querySelector('#btn-random10').onclick = ()=>{
      selected.clear();
      const shuffled = shuffle(allCards);
      for(let i=0;i<shuffled.length && selected.size<10;i++){
        selected.add(shuffled[i].id);
      }
      draw();
    };
    inner.querySelector('#btn-clear').onclick = ()=>{ selected.clear(); draw(); };
    inner.querySelector('#btn-start').onclick = ()=>{
      if(selected.size!==10) return;
      closeOverlay();
      window.__startRun?.(Array.from(selected));
    };
    inner.querySelector('#btn-close').onclick = closeOverlay;

    // Grid rendern
    renderGrid();
  };

  const renderGrid = ()=>{
    const grid = inner.querySelector('#lobby-grid');
    grid.innerHTML = "";

    // Filter anwenden
    const filtered = allCards.filter(c=>{
      const tOk = (filterType==="alle") || (c.type===filterType);
      const qOk = !q || (c.name?.toLowerCase().includes(q)) || (c.desc?.toLowerCase().includes(q)) || (c.id?.toLowerCase().includes(q));
      return tOk && qOk;
    });

    filtered.forEach(c=>{
      const div = document.createElement('div');
      const sel = selected.has(c.id);
      div.className = "card pick" + (sel?" selected":"");
      div.innerHTML = `
        <div class="cost">${c.cost ?? 1}</div>
        <div class="badge">${c.type}</div>
        <div class="name">${c.name}</div>
        <div class="mini">${c.id}</div>
        <div class="desc small">${c.desc}</div>
        ${elementsHtml(c.elements || [])}
      `;
      div.onclick = ()=>{
        if(sel){ selected.delete(c.id); }
        else if(selected.size<10){ selected.add(c.id); }
        // wenn schon 10: keine weiteren hinzufügen
        draw();
      };
      grid.appendChild(div);
    });
  };

  draw();
}
