// src/ui/render.js
import { state, RUNE_DEFS } from '../game/core/gameState.js';
import { t } from '../i18n.js';

export function render(){
  const L = document.getElementById('left');
  const R = document.getElementById('right');

  // Left: Status & Aktionen
  L.innerHTML = `
    <div class="row">
      <span class="pill">${t('day')}: ${state.day}/${state.maxDay}</span>
      <span class="pill">${t('energy')}: ${state.energy}</span>
      <span class="pill">${t('souls')}: ${state.souls}</span>
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <strong>${t('hero')}</strong>
        <span class="muted">${state.hero?.name || '-'}</span>
      </div>
      <div class="row">
        <span class="pill">HP: ${state.hero.hp}/${state.hero.maxHp}</span>
        <span class="pill">${t('spec')}: ${state.hero.spec.label}</span>
      </div>
      <div class="row" style="margin-top:8px;">
        <button data-action="attack">${t('btn.attack')}</button>
        <button class="primary" data-action="next-day">${t('btn.nextDay')}</button>
      </div>
    </div>

    <div class="card">
      <strong>${t('shop.title')}</strong>
      <div class="shop">
        ${Object.values(RUNE_DEFS).map(r => `
          <div class="tile">
            <div>
              <div><strong>${r.name}</strong></div>
              <div class="muted">${r.desc}</div>
            </div>
            <div class="row">
              <span class="pill">${t('cost')}: ${r.cost}</span>
              <button data-action="buy-rune" data-key="${r.key}">${t('buy')}</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Right: Karte
  R.innerHTML = `
    <div class="list">
      ${state.map.map((tile, i) => {
        const here = i === state.heroPos ? '🧍' : '';
        return `<div class="tile"><span>${here} ${tile.label}</span><span class="muted">${tile.type}</span></div>`;
      }).join('')}
    </div>
  `;
}
