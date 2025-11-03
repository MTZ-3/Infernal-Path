import { state } from '../game/core/gameState.js';
import { CARD_DEFS, scaledValue } from '../game/cards/cards.js';
export function render(){
const L = document.getElementById('left');
const R = document.getElementById('right');


if (state.mode === 'select') {
L.innerHTML = renderSelectionLeft();
R.innerHTML = renderSelectionRight();
return;
}


// RUN UI
L.innerHTML = renderRunLeft();
R.innerHTML = renderRunRight();


// Draft-Overlay
const overlay = document.getElementById('overlay');
if (overlay) overlay.innerHTML = state.draftOpen ? renderDraftOverlay() : '';
}

function renderSelectionLeft(){
const picked = state.selection.length;
return `
<div class="card">
<strong>Kartenwahl</strong>
<div class="muted">Wähle ${state.selectionTarget} Startkarten (gewählt: ${picked}/${state.selectionTarget}).</div>
<div class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap;">
${Object.values(CARD_DEFS).map(def => renderSelectCard(def)).join('')}
</div>
<div class="row" style="margin-top:12px;">
<button class="primary" data-action="start-run" ${picked===state.selectionTarget?'':'disabled'}>Run starten</button>
</div>
</div>
`;
}

function renderSelectCard(def){
return `
<button class="tile" data-action="play-card" data-id="${id}" ${disabled}>
<div>
<div><strong>${c.name}</strong> <span class="muted">Cost ${c.cost}</span></div>
<div class="muted">Lvl ${L} → Wert ${Math.round(val)} · ${c.desc}</div>
</div>
<span class="pill">${c.cost}E</span>
</button>
`;
}


function renderRunRight(){
return `
<div class="list">
${state.map.map((tile,i)=>{
const here = i===state.heroPos ? '🧍' : '';
return `<div class="tile"><span>${here} ${tile.label}</span><span class="muted">${tile.type}</span></div>`;
}).join('')}
</div>
<div id="overlay"></div>
`;
}


function renderDraftOverlay(){
const L = currentLevelForUI();
return `
<div class="modal">
<div class="card">
<strong>Tages-Draft</strong>
<div class="muted">Wähle 1 von 3 Karten (Level ${L}).</div>
<div class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap;">
${state.draftOptions.map(id=>renderDraftOption(id, L)).join('')}
</div>
</div>
</div>
`;
}


function renderDraftOption(id, L){
const c = CARD_DEFS[id];
const val = scaledValue(c.effect||{}, L);
return `
<button class="tile" data-action="pick-draft" data-id="${id}">
<div>
<div><strong>${c.name}</strong> <span class="muted">[${c.type}]</span></div>
<div class="muted">Lvl ${L} → Wert ${Math.round(val)}</div>
<div class="muted">${c.desc}</div>
</div>
<span class="pill">${c.cost}E</span>
</button>
`;
}


function currentLevelForUI(){
return state.powerLevel || state.day || 1;
}