// src/main.js
import { newRun, nextDay, tryAttack, state, killHero, buyRune } from './game/core/gameState.js';
import { render } from './ui/render.js';
import { initI18n } from './i18n.js';

// Bootstrap
await initI18n();   // <— wichtig: erst Texte laden
newRun();
render();

// Debug-Helpers
window.InfernalPath = { state, nextDay, tryAttack, killHero, buyRune };

// Click-Events
window.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'next-day') nextDay();
  if (a === 'attack') tryAttack();
  if (a === 'buy-rune') buyRune(el.dataset.key);
  render();
});
