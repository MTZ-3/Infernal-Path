// src/ui/render.js
import { state } from '../game/core/gameState.js';
import { CARD_DEFS, scaledValue } from '../game/cards/cards.js';

export function render(){
  const L = document.getElementById('left');
  const R = document.getElementById('right');

  if (state.mode === 'select') {
    L.innerHTML = renderSelectionLeft();
    R.innerHTML = renderSelectionRight();
    const overlay = document.getElementById('overlay');
    if (state.mode === 'select') {
    // …
    if (overlay) overlay.innerHTML = '';
    return;
   }
  }
  // RUN
  L.innerHTML = renderRunLeft();
  R.innerHTML = renderRunRight();
  if (overlay) overlay.innerHTML = state.draftOpen ? renderDraftOverlay() : '';

  const overlay = document.getElementById('overlay');
  if (overlay) overlay.innerHTML = state.draftOpen ? renderDraftOverlay() : '';
}

function renderSelectionLeft(){
  const defs = Object.values(CARD_DEFS);
  if (defs.length === 0) {
    return `
      <div class="card">
        <strong>Kartenwahl</strong>
        <div class="muted">Keine Karten geladen. Prüfe <code>/data/cards.de.json</code> und die Browser-Konsole (F12).</div>
      </div>
    `;
  }
  const picked = state.selection.length;
  return `
    <div class="card">
      <strong>Kartenwahl</strong>
      <div class="muted">Wähle ${state.selectionTarget} Startkarten (gewählt: ${picked}/${state.selectionTarget}).</div>
      <div class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap;">
        ${defs.map(def => renderSelectCard(def)).join('')}
      </div>
      <div class="row" style="margin-top:12px;">
        <button class="primary" data-action="start-run" ${picked===state.selectionTarget?'':'disabled'}>Run starten</button>
      </div>
    </div>
  `;
}

function renderSelectCard(def){
  const isPicked = state.selection.includes(def.id);
  const L = 1; // Anzeige-Level in der Auswahl
  const val = scaledValue(def.effect || {}, L);
  return `
    <div class="tile" style="align-items:flex-start;">
      <div>
        <div><strong>${def.name}</strong> <span class="muted">[${def.type}]</span></div>
        <div class="muted">Cost: ${def.cost} · L1-Wert: ${Math.round(val)}</div>
        <div class="muted">${def.desc}</div>
      </div>
      <button data-action="toggle-select" data-id="${def.id}">${isPicked?'Entfernen':'Hinzufügen'}</button>
    </div>
  `;
}

function renderSelectionRight(){
  return `
    <div class="card">
      <strong>Ausgewählt</strong>
      <div class="list">
        ${state.selection.map(cid => {
          const c = CARD_DEFS[cid];
          return `<div class="tile"><span>${c?.name || cid}</span><span class="muted">${c?.type || ''}</span></div>`;
        }).join('') || '<div class="muted">(noch leer)</div>'}
      </div>
    </div>
  `;
}

function renderRunLeft(){
  return `
    <div class="row">
      <span class="pill">Tag: ${state.day}/${state.maxDay}</span>
      <span class="pill">Energie: ${state.energy}</span>
      <span class="pill">Seelen: ${state.souls}</span>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <strong>Held</strong>
        <span class="muted">${state.hero?.name || '-'}</span>
      </div>
      <div class="row">
        <span class="pill">HP: ${state.hero.hp}/${state.hero.maxHp}</span>
        <span class="pill">Verwundb.: ${state.effects.vulnStacks}×</span>
        <span class="pill">Blutung: ${state.effects.bleed}</span>
      </div>
      <div class="row" style="margin-top:8px;">
        <button data-action="attack">Angreifen (-1E)</button>
        <button class="primary" data-action="next-day">Nächster Tag</button>
      </div>
    </div>
    <div class="card">
      <strong>Hand</strong>
      <div class="row" style="flex-wrap:wrap; gap:10px; margin-top:6px;">
        ${state.hand.map(cid => renderHandCard(cid)).join('') || '<span class="muted">(leer)</span>'}
      </div>
    </div>
  `;
}

function renderHandCard(cid){
  const c = CARD_DEFS[cid];
  const L = currentLevelForUI();
  const val = scaledValue(c.effect || {}, L);
  const disabled = (c.cost || 0) > state.energy ? 'disabled' : '';
  return `
    <button class="tile" data-action="play-card" data-id="${c.id}" ${disabled}>
      <div>
        <div><strong>${c.name}</strong> <span class="muted">Cost ${c.cost}</span></div>
        <div class="muted">Lvl ${L} → Wert ${Math.round(val)} · ${c.desc}</div>
      </div>
      <span class="pill">${c.cost}E</span>
    </button>
  `;
}

function renderRunRight(){
  const placing = !!state.placeIntent;
  return `
    <div class="list">
      ${state.map.map((tile,i)=>{
        const here = i===state.heroPos ? '🧍' : '';
        const effects = (tile.effects||[]).map(e=>`<span class="pill">${e.name}</span>`).join(' ');
        const btn = placing ? `<button data-action="place-here" data-idx="${i}">Hier platzieren</button>` : '';
        return `<div class="tile"><div><span>${here} ${tile.label}</span> <span class="muted">${tile.type}</span> ${effects?('<div>'+effects+'</div>'):''}</div>${btn}</div>`;
      }).join('')}
    </div>
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
          ${state.draftOptions.map(cid => renderDraftOption(cid, L)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderDraftOption(cid, L){
  const c = CARD_DEFS[cid];
  const val = scaledValue(c.effect || {}, L);
  return `
    <button class="tile" data-action="pick-draft" data-id="${c.id}">
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
