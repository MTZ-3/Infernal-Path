import { initI18n } from './i18n.js';
import { loadCardDefs } from './game/cards/cards.js';
import { render } from './ui/render.js';
import {
  state, initPools, enterSelection, toggleSelectCard, canStartRun, newRunFromSelection,
  tryAttack, nextDay, playCard, openDailyDraft, chooseDraftCard
} from './game/core/gameState.js';


// Bootstrap
await initI18n();
await loadCardDefs();
initPools();
enterSelection();
render();

// Für Debug in der Console
window.InfernalPath = { state, tryAttack, nextDay, playCard, placeCardOnTile };


// Events
window.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const a = el.dataset.action;

  if (a === 'toggle-select') { toggleSelectCard(el.dataset.id); render(); }
  if (a === 'start-run') { if (canStartRun()) { newRunFromSelection(); render(); } }

  if (a === 'attack') { tryAttack(); render(); }
  if (a === 'next-day') { nextDay(); render(); }
  if (a === 'play-card') { playCard(el.dataset.id); render(); }

  if (a === 'pick-draft') { chooseDraftCard(el.dataset.id); render(); }

  // Platzieren
  if (a === 'place-here') { placeCardOnTile(parseInt(el.dataset.idx,10)); render(); }
  if (a === 'cancel-place') { cancelPlaceIntent(); render(); }
});
