// src/game/map/map.js
import { GameState, uid } from "../core/gameState.js";
import { playCard } from "../cards/cards.js";

let _svg, _nodesG, _linksG, _heroDot;

export function mountStaticMap(container){
  container.innerHTML = `
    <div class="panel" style="position:relative">
      <svg id="map-svg" viewBox="0 0 800 260" style="width:100%;height:240px"></svg>
    </div>
  `;
  _svg = container.querySelector("#map-svg");
  _linksG = svgElem("g"); _nodesG = svgElem("g");
  _svg.appendChild(_linksG); _svg.appendChild(_nodesG);

  // Beispielkarte erzeugen, falls leer
  if(!GameState.map.nodes.length){
    const n=(x,y,kind="road",label="")=>({ id:uid(), x, y, kind, label });
    const nodes=[
      n(60,120,"start","Start"),
      n(160,80,"road"),  n(160,160,"village","Dorf"),
      n(300,80,"road"),  n(300,160,"dungeon","Dungeon"),
      n(460,120,"road"), n(620,120,"road"),
      n(740,120,"castle","Schloss"),
    ];
    const links=[[0,1],[0,2],[1,3],[2,4],[3,5],[4,5],[5,6],[6,7]];
    GameState.map.nodes = nodes.map((n,i)=>({ ...n, idx:i }));
    GameState.map.links = links.map(([a,b])=>({ a: nodes[a].id, b: nodes[b].id }));
    GameState.map.castleId = nodes[7].id;
    GameState.heroPos = nodes[0].id;
  }

  renderMap();
}

export function renderMap(){
  if(!_svg) return;

  // Kanten
  _linksG.innerHTML = "";
  GameState.map.links.forEach(l=>{
    const A = nodeById(l.a), B=nodeById(l.b);
    const e = svgElem("line",{ x1:A.x, y1:A.y, x2:B.x, y2:B.y, class:"link" });
    _linksG.appendChild(e);
  });

  // Knoten
  _nodesG.innerHTML = "";
  GameState.map.nodes.forEach(n=>{
    const g = svgElem("g");
    const base = svgElem("circle",{ cx:n.x, cy:n.y, r:14, class:"node" });
    base.setAttribute("fill", kindFill(n.kind));
    base.addEventListener("click", ()=>onNodeClick(n));
    g.appendChild(base);

    if(n.kind==="village") g.appendChild(svgText(n.x, n.y-20, "🏚"));
    if(n.kind==="dungeon") g.appendChild(svgText(n.x, n.y-20, "⌖"));
    if(n.kind==="castle")  g.appendChild(svgText(n.x, n.y-22, "🏰"));

    const count = (GameState.placed.get(n.id)||[]).length;
    if(count>0) g.appendChild(svgText(n.x, n.y+28, `×${count}`));

    _nodesG.appendChild(g);
  });

  // Held-Marker
  if(!_heroDot){
    _heroDot = svgElem("circle",{ r:6, fill:"#f87171", stroke:"#fff", "stroke-width":2 });
    _svg.appendChild(_heroDot);
  }
  const H = nodeById(GameState.heroPos);
  _heroDot.setAttribute("cx", H.x);
  _heroDot.setAttribute("cy", H.y);
}

function onNodeClick(n){
  const c = GameState.targeting;
  if(!c) return;                           // keine Karte ausgewählt
  const res = playCard(c, n.id);           // Karte aufs Feld legen
  if(res?.ok){ pulse(n.x, n.y); window.__render?.(); }
  else { window.__log?.(res?.log || "Konnte hier nicht platzieren."); }
}

function pulse(x,y){
  const p = svgElem("circle",{ cx:x, cy:y, r:4, fill:"none", stroke:"#eab308", "stroke-width":2, opacity:1 });
  _svg.appendChild(p);
  const t0 = performance.now();
  const tick = (t)=>{
    const k = Math.min(1, (t-t0)/400);
    p.setAttribute("r", String(4 + 20*k));
    p.setAttribute("opacity", String(1-k));
    if(k<1) requestAnimationFrame(tick); else p.remove();
  };
  requestAnimationFrame(tick);
}

function nodeById(id){ return GameState.map.nodes.find(n=>n.id===id); }
function svgElem(tag, attrs={}){
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for(const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function svgText(x,y,txt){
  const t=svgElem("text",{ x, y, "text-anchor":"middle", "dominant-baseline":"middle", fill:"#cbd5e1", "font-size":"14px" });
  t.textContent = txt; return t;
}
function kindFill(kind){
  if(kind==="village") return "#25321a";
  if(kind==="dungeon") return "#2b1f33";
  if(kind==="castle")  return "#2a243a";
  return "#0b0b12";
}
