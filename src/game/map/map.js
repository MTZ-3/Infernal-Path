import { GameState } from "../core/gameState.js";
import { playCard } from "../cards/cards.js";


export function mountStaticMap(root){
root.innerHTML = `
<svg viewBox="0 0 600 120">
<line class="link" x1="40" y1="60" x2="120" y2="60" />
<line class="link" x1="120" y1="60" x2="220" y2="35" />
<line class="link" x1="120" y1="60" x2="220" y2="85" />
<line class="link" x1="220" y1="35" x2="320" y2="60" />
<line class="link" x1="220" y1="85" x2="320" y2="60" />
<line class="link" x1="320" y1="60" x2="420" y2="60" />
<line class="link" x1="420" y1="60" x2="560" y2="60" />
<circle class="node" data-node="0" cx="40" cy="60" r="12" />
<circle class="node" data-node="1" cx="120" cy="60" r="12" />
<circle class="node" data-node="2" cx="220" cy="35" r="12" />
<circle class="node" data-node="3" cx="220" cy="85" r="12" />
<circle class="node" data-node="4" cx="320" cy="60" r="12" />
<circle class="node" data-node="5" cx="420" cy="60" r="12" />
<circle class="node" data-node="6" cx="560" cy="60" r="12" />
</svg>`;
root.querySelectorAll('.node').forEach(n=>{
n.addEventListener('click',()=>{
if(!GameState.targeting) return;
const card=GameState.targeting; GameState.targeting=null;
const nodeId=parseInt(n.getAttribute('data-node'));
const res=playCard(card, nodeId); if(window.__log) window.__log(res.log);
if(window.__render) window.__render();
});
});
}