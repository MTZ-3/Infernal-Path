import { GameState, BASE_ENERGY, BASE_DRAW } from "../core/gameState.js";
import { drawCards, sacrifice } from "../game/cards/cards.js";


export function mountUI(root){
root.innerHTML = `
<div class="app">
<div class="top">
<div class="panel stat">
<h2>Run-Status</h2>
<div class="row"><span>Tag</span><strong id="ui-day">1 / 10</strong></div>
<div class="row"><span>Energie</span><strong id="ui-energy">0</strong></div>
<div class="row"><span>Seelenfragmente</span><strong id="ui-souls" class="soul">0</strong></div>
<div class="row"><span>Ziehkarten / Handlimit</span><strong id="ui-draw">5 / 7</strong></div>
</div>
<div class="panel stat">
<h2>Held</h2>
<div class="bar"><div id="ui-hero-hpbar" style="width:100%"></div></div>
<div class="row"><span>HP</span><strong id="ui-hero-hp">—</strong></div>
<div class="row"><span>Effekte</span><strong id="ui-hero-effects" class="small muted">–</strong></div>
<div class="row"><span>Distanz zum Schloss</span><strong id="ui-hero-dist">—</strong></div>
</div>
<div class="panel stat">
<h2>Aktive Runen</h2>
<div class="row small"><label><input type="checkbox" id="rune-draw" /> +1 Karte pro Tag</label></div>
<div class="row small"><label><input type="checkbox" id="rune-energy" /> +1 Energie Start</label></div>
<div class="row small"><label><input type="checkbox" id="rune-soul" /> +1 Fragment pro Held</label></div>
<div class="small muted">(Temporär für diesen Prototyp)</div>
</div>
</div>


<div class="board">
<div class="leftcol">
<div class="panel"><h3>Opferaltar</h3><div class="altar small" id="altar">Karte hier ablegen oder ausgewählte Karte anklicken.</div></div>
<div class="panel"><h3>Runen-Shop</h3><div id="shop"></div><button id="btn-reroll-shop">Angebote neu würfeln (2 ■)</button></div>
</div>
<div class="centercol">
<div class="panel hero"><div class="demon" id="btn-demon" title="Runen-Shop öffnen"></div><div class="big" id="map"></div>
<div>
<div class="small muted">Bewegungsleiste</div>
<div class="track" id="track"><div class="puck" id="puck" style="left:0"></div></div>
<div class="small muted" id="track-label">Start → Schloss</div>
</div>
<div><div class="small muted">Notizen</div><div class="small">Raserei: Bei 50% HP doppelte Bewegung.</div></div>
</div>
<div class="panel"><h3>Hand</h3><div id="hand" class="hand"></div></div>
</div>
<div class="rightcol">
<div class="panel"><h3>Deck</h3><div class="small">Draw: <span id="ui-deck-count">0</span> | Ablage: <span id="ui-discard-count">0</span></div><div class="small muted" id="ui-log" style="margin-top:8px; max-height:180px; overflow:auto"></div></div>
<div class="panel"><h3>Aktionen</h3><button id="btn-end-day" class="primary">Tag beenden</button><button id="btn-new-run" class="warn">Neuer Run</button></div>
</div>
</div>
<div class="overlay" id="overlay"><div class="inner" id="overlay-inner"></div></div>
<div class="footer"><div class="small muted">Infernal Path – Modular Proto</div><div class="small">Karte anklicken ⇒ Map-Knoten oder Altar.</div></div>
</div>`;
}


export function render(){
document.querySelector('#ui-day').textContent = `${GameState.day} / ${GameState.maxDays}`;
document.querySelector('#ui-draw').textContent = `${BASE_DRAW+(GameState.runes.draw?1:0)} / 7`;
document.querySelector('#ui-energy').textContent = GameState.energy;
document.querySelector('#ui-souls').textContent = GameState.souls;
if(GameState.hero){
const h=GameState.hero; const hpPerc = Math.max(0,Math.min(100,(h.hp/h.maxHp)*100));
}}