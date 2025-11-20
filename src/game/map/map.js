// src/game/map/map.js
// ============================================================================
// Layered-Map (Start -> ... -> Castle) mit harten Constraints:
// - Nur Vorwärtskanten (layer k -> layer k+1) => gleiche Pfadlänge
// - KEINE SACKGASSEN: jedes Feld (k+1) hat >=1 Eingang, jedes (k) hat >=1 Ausgang
// - Start max. 2 Pfade
// - Max. 3 Kreuzungen gesamt (Knoten mit Outdeg >= 2, inkl. Start)
// - Punkte in derselben Spalte überlappen nicht (Y-Mindestabstand + Fallback)
// - Validator-Schleife: rollt neu, bis alles gültig ist
// - SVG-Render, Heldmarker, Klick: Karte platzieren (GameState.targeting)
// ============================================================================

import { GameState, rand, uid } from "../core/gameState.js";
import { playCard, instView } from "../cards/cards.js";

let _svg, _nodesG, _linksG, _heroDot;

// ---------------------------------------------------------------------------
// Public: SVG mounten & initial rendern
// ---------------------------------------------------------------------------
export function mountStaticMap(container) {
  container.innerHTML = `
    <div class="panel" style="position:relative">
      <svg id="map-svg" viewBox="0 0 800 260" style="width:100%;height:240px"></svg>
    </div>
  `;
  _svg = container.querySelector("#map-svg");
  _linksG = svgElem("g");
  _nodesG = svgElem("g");
  _svg.appendChild(_linksG);
  _svg.appendChild(_nodesG);

  if (!GameState.map.nodes.length) {
    regenerateMap(1);
  }
  renderMap();
}

// ---------------------------------------------------------------------------
// Public: Pro Runde neue Map erzeugen (rollt neu bis gültig)
// ---------------------------------------------------------------------------
export function regenerateMap(round = 1) {
  const LAYERS  = 6 + Math.min(4, round); // 6..10 Spalten → 5..9 Schritte
  const COL_MIN = 1, COL_MAX = 3;         // 1..3 Nodes pro Spalte
  const MIN_Y   = 50, MAX_Y = 210;        // Y-Spielraum
  const MIN_GAP = 26;                     // min. vertikaler Abstand
  const MAX_JUNCTIONS = 3;                // global (inkl. Start)
  const ATTEMPTS = 40;                    // max. Versuche pro Regeneration

  // Spalten-X fix (über Versuche konstant)
  const marginX = 60, usableW = 800 - 2 * marginX;
  const colX = Array.from({ length: LAYERS }, (_, i) =>
    Math.round(marginX + (usableW * (i / (LAYERS - 1))))
  );

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // ---- Nodes bauen (Layered, ohne Überlappungen pro Spalte) ----
    const nodes = [];
    const links = [];

    const startId = uid();
    nodes.push({ id: startId, layer: 0, x: colX[0], y: 130, kind: "start", label: "Start" });

    for (let k = 1; k < LAYERS - 1; k++) {
      const count = rand(COL_MIN, COL_MAX);
      const ys = placeNonOverlappingYs(count, MIN_Y, MAX_Y, MIN_GAP);
      for (let i = 0; i < count; i++) {
        nodes.push({ id: uid(), layer: k, x: colX[k], y: ys[i], kind: null, label: "" });
      }
    }

    const castleId = uid();
    nodes.push({
      id: castleId,
      layer: LAYERS - 1,
      x: colX[LAYERS - 1],
      y: rand(90, 170),
      kind: "castle",
      label: "Schloss"
    });

    const byLayer = (l) => nodes.filter(n => n.layer === l);

    // ---- Kanten bauen (vorwärts), mit Start≤2 & Junction-Budget≤3 ----
    let junctionBudget = MAX_JUNCTIONS;
    for (let k = 0; k < LAYERS - 1; k++) {
      const A = byLayer(k), B = byLayer(k + 1);
      links.push(...buildLayerEdges(A, B, {
        isStartLayer: k === 0,
        canTakeSecondEdge(aId) { return junctionBudget > 0; },   // zweite Kante erlaubt?
        onTookSecondEdge(aId)  { junctionBudget = Math.max(0, junctionBudget - 1); } // Budget verbrauchen
      }));
    }

    // ---- VALIDIEREN (keine Sackgassen / nur vorwärts / Budgets / Pfade ok) ----
    if (validateGraph(nodes, links, LAYERS, startId, castleId, MAX_JUNCTIONS)) {
      // Specials (max. 3) nach erfolgreicher Validierung verteilen (optional)
      let specials = 0;
      for (let k = 1; k < LAYERS - 1 && specials < 3; k++) {
        const L = byLayer(k);
        if (!L.length) continue;
        if (Math.random() < 0.65) {
          const n = L[rand(0, L.length - 1)];
          if (!n.kind) {
            n.kind = (Math.random() < 0.5) ? "village" : "dungeon";
            specials++;
          }
        }
      }

      // State übernehmen
      GameState.map.nodes    = nodes;
      GameState.map.links    = links;
      GameState.map.castleId = castleId;
      GameState.heroPos      = startId;
      GameState.placed       = new Map();
      return; // fertig
    }
  }

  // --- Fallback (extrem selten) ---
  console.warn("[map] Fallback verwendet: zu viele ungültige Versuche.");
  const nodes = [];
  const links = [];
  const startId = uid();
  nodes.push({ id: startId, layer: 0, x: colX[0], y: 130, kind: "start", label: "Start" });
  let lastId = startId;
  for (let k = 1; k < LAYERS - 1; k++) {
    const mid = { id: uid(), layer: k, x: colX[k], y: 130, kind: null, label: "" };
    nodes.push(mid);
    links.push({ a: lastId, b: mid.id });
    lastId = mid.id;
  }
  const castleId = uid();
  nodes.push({ id: castleId, layer: LAYERS - 1, x: colX[LAYERS - 1], y: 130, kind: "castle", label: "Schloss" });
  links.push({ a: lastId, b: castleId });

  GameState.map.nodes    = nodes;
  GameState.map.links    = links;
  GameState.map.castleId = castleId;
  GameState.heroPos      = startId;
  GameState.placed       = new Map();
}

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------
export function renderMap() {
  if (!_svg) return;

  // Kanten
  _linksG.innerHTML = "";
  GameState.map.links.forEach(l => {
    const A = nodeById(l.a), B = nodeById(l.b);
    if (!A || !B) return;
    _linksG.appendChild(
      svgElem("line", {
        x1: A.x, y1: A.y,
        x2: B.x, y2: B.y,
        class: "link"
      })
    );
  });

  // Knoten
  _nodesG.innerHTML = "";
  const selectedInst  = GameState.targeting || null;
  const selectedPlace = selectedInst ? placementForInst(selectedInst) : null;

  GameState.map.nodes.forEach(n => {
    const g = svgElem("g");

    let cls = "node";

    // Nur für Map-Karten (special/road) highlighten; Heldenkarten lassen Map normal.
    if (selectedInst && selectedPlace !== "hero") {
      if (isNodeValidForInst(n, selectedInst)) {
        cls += " node-ok";
      } else {
        cls += " node-blocked";
      }
    }

    const base = svgElem("circle", {
      cx: n.x,
      cy: n.y,
      r: 14,
      class: cls
    });

    base.setAttribute("fill", kindFill(n.kind));
    base.addEventListener("click", () => onNodeClick(n));
    g.appendChild(base);

    if (n.kind === "village") g.appendChild(svgText(n.x, n.y - 20, "🏚"));
    if (n.kind === "dungeon") g.appendChild(svgText(n.x, n.y - 20, "⌖"));
    if (n.kind === "castle")  g.appendChild(svgText(n.x, n.y - 22, "🏰"));

    const count = (GameState.placed.get(n.id) || []).length;
    if (count > 0) g.appendChild(svgText(n.x, n.y + 28, `×${count}`));

    _nodesG.appendChild(g);
  });

  // Heldmarker
  if (!_heroDot) {
    _heroDot = svgElem("circle", {
      r: 6,
      fill: "#f87171",
      stroke: "#fff",
      "stroke-width": 2
    });
    _svg.appendChild(_heroDot);
  }
  const H = nodeById(GameState.heroPos);
  if (H) {
    _heroDot.setAttribute("cx", H.x);
    _heroDot.setAttribute("cy", H.y);
  }
}

// ===========================================================================
// Interaktion: Karte auf Node platzieren
// =========================================================================== */
function onNodeClick(n){
  const inst = GameState.targeting;
  if (!inst) return; // keine Karte ausgewählt

  const place = placementForInst(inst);

  // 1) Helden-Karte auf Map? → verboten
  if (place === "hero") {
    window.__log?.("Diese Karte kannst du nur direkt auf den Helden wirken.");
    return;
  }

  // 2) Dorf/Dungeon-Karten nur auf Dörfer/Dungeons
  if (place === "special") {
    if (n.kind !== "village" && n.kind !== "dungeon") {
      window.__log?.("Diese Karte kannst du nur auf Dörfer oder Dungeons legen.");
      return;
    }
  }

  // 3) Fallen/Zonen nur auf Straßen / Start
  if (place === "road") {
    if (n.kind !== "road" && n.kind !== "start") {
      window.__log?.("Diese Karte kannst du nur auf freie Wegfelder legen.");
      return;
    }
  }

  // 4) Wenn wir hier sind: Platzierung erlaubt
  const res = playCard(inst, n.id);
  if (res?.ok) {
    GameState.targeting = null;  // Auswahl löschen
    pulse(n.x, n.y);
    window.__render?.();
    renderMap?.();
  } else {
    window.__log?.(res?.log || "Konnte hier nicht platzieren.");
  }
}

// ===========================================================================
// Export: Vorwärts-Nachbarn (für 50/50 Bewegung in turns.js)
// =========================================================================== */
export function forwardNeighbors(id) {
  const here = nodeById(id);
  if (!here) return [];
  const out = [];
  GameState.map.links.forEach(L => {
    if (L.a === id) {
      const b = nodeById(L.b);
      if (b && b.layer === here.layer + 1) out.push(b);
    }
  });
  return out;
}

// ===========================================================================
// Helpers: Platzierung, Graph, SVG, Layout
// ===========================================================================

// Platzierungs-Typ für eine Karten-INSTANZ
// Rückgabe: "hero" | "special" | "road"
function placementForInst(inst) {
  const v    = instView(inst);           // Template-View
  const type = v.type;
  const kind = v.effect?.kind || "";

  // Eroberung = Karten für die Map
  if (type === "eroberung") {
    // Speziell: Dorf-/Dungeon-Karten
    if (kind.includes("village") || kind.startsWith("dungeon_")) {
      return "special";                  // nur Dorf/Dungeon
    }
    return "road";                       // sonst: Wege / Kreuzungen
  }

  // alles andere = direkt auf den Helden
  return "hero";
}

// Prüft, ob ein Node zur ausgewählten Karte passt
function isNodeValidForInst(node, inst) {
  const place = placementForInst(inst);

  if (place === "hero") {
    // Heldenkarten gehören NICHT auf die Map
    return false;
  }
  if (place === "special") {
    return node.kind === "village" || node.kind === "dungeon";
  }
  if (place === "road") {
    return node.kind === "road" || node.kind === "start";
  }
  return false;
}

function nodeById(id){ return GameState.map.nodes.find(n=>n.id===id); }

function svgElem(tag, attrs={}) {
  const e = document.createElementNS("http://www.w3.org/2000/svg",tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function svgText(x,y,txt){
  const t = svgElem("text",{
    x,y,
    "text-anchor":"middle",
    "dominant-baseline":"middle",
    fill:"#cbd5e1",
    "font-size":"14px"
  });
  t.textContent = txt;
  return t;
}
function svgSmall(x,y,txt){
  const t = svgElem("text",{
    x,y,
    "text-anchor":"middle",
    "dominant-baseline":"middle",
    fill:"#a7a3be",
    "font-size":"10px"
  });
  t.textContent = txt;
  return t;
}
function kindFill(kind){
  if(kind==="village") return "#25321a";
  if(kind==="dungeon") return "#2b1f33";
  if(kind==="castle")  return "#2a243a";
  if(kind==="start")   return "#1a1e2a";
  return "#0b0b12";
}
function pulse(x,y){
  const p = svgElem("circle",{
    cx:x, cy:y,
    r:4,
    fill:"none",
    stroke:"#eab308",
    "stroke-width":2,
    opacity:1
  });
  _svg.appendChild(p);
  const t0 = performance.now();
  const tick = (t)=>{
    const k = Math.min(1,(t-t0)/400);
    p.setAttribute("r", String(4+20*k));
    p.setAttribute("opacity", String(1-k));
    if(k<1) requestAnimationFrame(tick); else p.remove();
  };
  requestAnimationFrame(tick);
}
function shuffle(a){
  a=[...a];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function placeNonOverlappingYs(count,minY,maxY,gap){
  const ys=[]; let tries=0;
  while(ys.length<count && tries<200){
    tries++;
    const y=rand(minY,maxY);
    if(ys.every(v=>Math.abs(v-y)>=gap)) ys.push(y);
  }
  if(ys.length<count){
    const step=(maxY-minY)/(count+1);
    return Array.from({length:count},(_,i)=>Math.round(minY+step*(i+1)));
  }
  return ys.sort((a,b)=>a-b);
}

/**
 * Bau pro Layerpaar Vorwärtskanten (A->B) mit:
 * - jedes B hat >=1 Eingang
 * - jedes A hat >=1 Ausgang
 * - Outdeg(A) <= 2
 * - globales Kreuzungsbudget: nur wenn Outdeg von 1->2 wächst, Budget–- (Start zählt)
 * - Start-Layer: Start darf max. 2 Pfade
 */
function buildLayerEdges(A, B, opts){
  const edges = [];
  if(!A.length || !B.length) return edges;

  const outdeg = new Map(A.map(a=>[a.id,0]));
  const indeg  = new Map(B.map(b=>[b.id,0]));
  const startId = A[0]?.id;

  // 1) jedem A mind. 1 Ausgang – gleichmäßig über B verteilen
  const Bshuf = shuffle([...B]);
  A.forEach((a,i)=>{
    const target = Bshuf[i % Bshuf.length];
    edges.push({ a:a.id, b:target.id });
    outdeg.set(a.id, (outdeg.get(a.id)||0)+1);
    indeg.set(target.id, (indeg.get(target.id)||0)+1);
  });

  // 2) jedem B mind. 1 Eingang (falls B noch 0 hat)
  B.forEach(b=>{
    if((indeg.get(b.id)||0)>0) return;

    // A mit Outdeg<2 bevorzugen; zweite Kante nur mit Budget
    let a = A.find(x => (outdeg.get(x.id)||0) < 2);
    if (a && (outdeg.get(a.id)||0) === 1) {
      if (!opts?.canTakeSecondEdge(a.id)) a = null;
    }

    // Rewiring, wenn keiner Kapazität / Budget hat:
    if(!a){
      const heavy = A.find(x => (outdeg.get(x.id)||0) === 2);
      if(heavy){
        // suche heavy->oldB mit indeg(oldB)>1 und hänge um zu b
        let pick = -1;
        for(let i=0;i<edges.length;i++){
          const E=edges[i];
          if(E.a!==heavy.id) continue;
          if((indeg.get(E.b)||0)>1){ pick=i; break; }
        }
        if(pick!==-1){
          const old=edges[pick];
          edges[pick]={ a:heavy.id, b:b.id };
          indeg.set(old.b,(indeg.get(old.b)||0)-1);
          indeg.set(b.id,(indeg.get(b.id)||0)+1);
          return;
        }
      }
    }

    // Falls jetzt a vorhanden: zweite Kante hinzufügen (Budget evtl. ziehen)
    if(a){
      if((outdeg.get(a.id)||0)===1){ opts?.onTookSecondEdge?.(a.id); }
      edges.push({ a:a.id, b:b.id });
      outdeg.set(a.id, (outdeg.get(a.id)||0)+1);
      indeg.set(b.id, (indeg.get(b.id)||0)+1);
      return;
    }

    // Notfall: irgendein A (auch Start), solange Start nicht >2 wird
    const fallback = A[0];
    if(fallback){
      if(!(opts?.isStartLayer && fallback.id===startId && (outdeg.get(fallback.id)||0)>=2)){
        if((outdeg.get(fallback.id)||0)===1){ opts?.onTookSecondEdge?.(fallback.id); }
        edges.push({ a:fallback.id, b:b.id });
        outdeg.set(fallback.id, (outdeg.get(fallback.id)||0)+1);
        indeg.set(b.id, (indeg.get(b.id)||0)+1);
      }
    }
  });

  // 3) Start-Layer-Hardcap: notfalls überschüssige Start-Kanten löschen
  if(opts?.isStartLayer && startId){
    while((outdeg.get(startId)||0)>2){
      let removed=false;
      for(let i=edges.length-1;i>=0;i--){
        const E=edges[i];
        if(E.a!==startId) continue;
        if((indeg.get(E.b)||0)>1){
          edges.splice(i,1);
          outdeg.set(startId,(outdeg.get(startId)||0)-1);
          indeg.set(E.b,(indeg.get(E.b)||0)-1);
          removed=true; break;
        }
      }
      if(!removed) break;
    }
  }

  // 4) Sicherheit: A ohne Ausgang reparieren (sollte kaum auftreten)
  A.forEach(a=>{
    if((outdeg.get(a.id)||0)===0){
      const target = B[Math.floor(Math.random()*B.length)];
      edges.push({ a:a.id, b:target.id });
      outdeg.set(a.id,1);
      indeg.set(target.id,(indeg.get(target.id)||0)+1);
    }
  });

  return edges;
}

// ---------------------------------------------------------------------------
// VALIDATOR: prüft strikte Regeln & Pfad-Existenz (Start→Castle)
// ---------------------------------------------------------------------------
function validateGraph(nodes, links, LAYERS, startId, castleId, maxJunctions) {
  const byId   = new Map(nodes.map(n => [n.id, n]));
  const indeg  = new Map(nodes.map(n => [n.id, 0]));
  const outdeg = new Map(nodes.map(n => [n.id, 0]));

  // nur vorwärts & Degree zählen
  for (const L of links) {
    const a = byId.get(L.a), b = byId.get(L.b);
    if (!a || !b) return false;
    if (b.layer !== a.layer + 1) return false;           // nicht vorwärts → invalid
    indeg.set(b.id,  (indeg.get(b.id)  || 0) + 1);
    outdeg.set(a.id, (outdeg.get(a.id) || 0) + 1);
  }

  // Start ≤ 2
  if ((outdeg.get(startId) || 0) > 2) return false;

  // max. Junctions (Outdeg ≥ 2)
  const junctions = nodes.filter(n => (outdeg.get(n.id) || 0) >= 2).length;
  if (junctions > maxJunctions) return false;

  // Eingänge/Ausgänge vorhanden (keine Sackgassen)
  for (const n of nodes) {
    if (n.id !== startId  && (indeg.get(n.id)  || 0) <= 0) return false; // außer Start: Eingang nötig
    if (n.id !== castleId && (outdeg.get(n.id) || 0) <= 0) return false; // außer Castle: Ausgang nötig
    if ((outdeg.get(n.id) || 0) > 2) return false;                        // Outdeg Cap
  }

  // Erreichbarkeit vom Start (forward BFS)
  const forwardAdj = new Map(nodes.map(n => [n.id, []]));
  links.forEach(L => forwardAdj.get(L.a).push(L.b));
  const reachFromStart = new Set([startId]);
  const q = [startId];
  while (q.length) {
    const v = q.shift();
    for (const w of forwardAdj.get(v)) {
      if (!reachFromStart.has(w)) {
        reachFromStart.add(w);
        q.push(w);
      }
    }
  }
  if (!reachFromStart.has(castleId)) return false;

  // Castle-Erreichbarkeit (reverse BFS)
  const reverseAdj = new Map(nodes.map(n => [n.id, []]));
  links.forEach(L => reverseAdj.get(L.b).push(L.a));
  const canReachCastle = new Set([castleId]);
  const q2 = [castleId];
  while (q2.length) {
    const v = q2.shift();
    for (const w of reverseAdj.get(v)) {
      if (!canReachCastle.has(w)) {
        canReachCastle.add(w);
        q2.push(w);
      }
    }
  }

  // Jeder Node muss auf einem Start→Castle-Pfad liegen
  for (const n of nodes) {
    if (!reachFromStart.has(n.id)) return false;
    if (!canReachCastle.has(n.id)) return false;
  }
  return true;
}
