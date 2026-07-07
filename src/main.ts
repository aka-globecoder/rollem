/**
 * DOM view for Roll'Em. All game flow lives in ui/app.ts; this file only
 * renders `app.state` and forwards clicks via data-action attributes.
 */
import './style.css';
import { isHotDice } from './engine/game';
import { AI, App, HUMAN } from './ui/app';
import { isDieSelectable, selectionPoints } from './ui/selection';

const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const fmt = (n: number): string => n.toLocaleString('en-US');

const app = new App();
const root = document.querySelector<HTMLDivElement>('#app')!;

function die(face: number, opts: { index?: number; selected?: boolean; disabled?: boolean; bust?: boolean } = {}): string {
  const classes = ['die'];
  if (opts.selected) classes.push('selected');
  if (opts.bust) classes.push('bust');
  const action = opts.index !== undefined && !opts.disabled ? `data-action="die" data-index="${opts.index}"` : '';
  return `<button class="${classes.join(' ')}" ${action} ${opts.index === undefined || opts.disabled ? 'disabled' : ''} aria-label="die showing ${face}">${DIE_FACES[face - 1]}</button>`;
}

function scoreboard(): string {
  const { game } = app.state;
  const card = (player: number, name: string): string => {
    const active = game.current === player && game.phase !== 'gameOver';
    return `
      <div class="player ${active ? 'active' : ''}">
        <div class="player-name">${name}</div>
        <div class="player-score">${fmt(game.banked[player])}</div>
        <div class="turn-total">${active && game.turnTotal > 0 ? `+${fmt(game.turnTotal)} this turn` : '&nbsp;'}</div>
      </div>`;
  };
  return `<div class="scoreboard">${card(HUMAN, 'You')}<div class="vs">first to ${fmt(game.target)}</div>${card(AI, 'AI')}</div>`;
}

function endgameBanner(): string {
  const { game } = app.state;
  if (game.endgameTriggeredBy === null || game.phase === 'gameOver') return '';
  const text =
    game.current === HUMAN
      ? `Final turn! Beat the AI's ${fmt(game.banked[AI])} to win.`
      : `AI's last chance — it must beat your ${fmt(game.banked[HUMAN])}.`;
  return `<div class="banner">${text}</div>`;
}

function diceArea(): string {
  const { game, selected, flashDice, aiTurnRunning } = app.state;

  if (game.phase === 'gameOver') {
    const dice = flashDice ? `<div class="dice">${flashDice.map((f) => die(f, { bust: true })).join('')}</div>` : '';
    return `
      ${dice}
      <div class="game-over">
        <h2>${game.winner === HUMAN ? 'You win! 🎉' : 'The AI wins this one.'}</h2>
        <p>Final score — You: <strong>${fmt(game.banked[HUMAN])}</strong> · AI: <strong>${fmt(game.banked[AI])}</strong></p>
        <button class="button primary" data-action="restart">Play again</button>
      </div>`;
  }

  if (aiTurnRunning) {
    const dice =
      game.phase === 'select'
        ? game.rolled.map((f, i) => die(f, { selected: selected.has(i), disabled: true })).join('')
        : (flashDice ?? []).map((f) => die(f, { bust: true })).join('');
    return `
      <div class="dice">${dice}</div>
      <p class="hint">AI is playing… (${game.diceInHand} dice in hand)</p>`;
  }

  if (game.phase === 'select') {
    const points = selectionPoints(game.rolled, selected);
    const dice = game.rolled
      .map((f, i) =>
        die(f, { index: i, selected: selected.has(i), disabled: !isDieSelectable(game.rolled, i) }),
      )
      .join('');
    const keepLabel =
      points !== null ? `Keep ${selected.size} ${selected.size === 1 ? 'die' : 'dice'} (+${fmt(points)})` : 'Keep selected dice';
    const hint =
      points !== null
        ? 'Locked-in dice score now; fewer dice left means a bigger bust risk next roll.'
        : selected.size === 0
          ? 'Bright dice score — click at least one to keep it. Dim dice never score.'
          : 'That combination doesn’t score — 1s, 5s, or exactly three of a kind.';
    return `
      <div class="dice">${dice}</div>
      <div class="actions"><button class="button primary" data-action="keep" ${points === null ? 'disabled' : ''}>${keepLabel}</button></div>
      <p class="hint">${hint}</p>`;
  }

  // phase 'roll' or 'decide' on the human's turn
  const bustDice = (flashDice ?? []).map((f) => die(f, { bust: true })).join('');
  const canBank = game.phase === 'decide';
  const hot = isHotDice(game);
  return `
    ${bustDice ? `<div class="dice">${bustDice}</div>` : ''}
    ${hot ? '<div class="banner hot">🔥 Hot dice — every die scored, all 6 are back!</div>' : ''}
    <div class="actions">
      <button class="button primary" data-action="roll">Roll ${game.diceInHand} dice</button>
      ${canBank ? `<button class="button" data-action="bank">Bank ${fmt(game.turnTotal)} points</button>` : ''}
    </div>
    <p class="hint">${
      canBank
        ? `Banking keeps your ${fmt(game.turnTotal)} points safe. Rolling risks them all on ${game.diceInHand} dice.`
        : 'Roll all six dice to start your turn.'
    }</p>`;
}

function rules(): string {
  return `
    <details class="rules" open>
      <summary>How to play</summary>
      <p>Roll, keep scoring dice, then <strong>bank</strong> your points or <strong>roll again</strong> with the
      dice you didn't keep. A roll with no scoring dice is a <strong>bust</strong>: your unbanked turn points are
      gone. First to bank ${fmt(app.state.game.target)} triggers the opponent's one final turn — highest score wins.</p>
      <table>
        <tr><td>Single ⚀</td><td>100</td><td>Single ⚄</td><td>50</td></tr>
        <tr><td>Three ⚀⚀⚀</td><td>1,000</td><td>Three of a kind</td><td>face × 100</td></tr>
      </table>
      <p>Keep all six as scorers and they all come back — <strong>hot dice</strong>, same turn, keep going.</p>
    </details>`;
}

function render(): void {
  root.innerHTML = `
    <main class="game">
      <h1>Roll'Em</h1>
      ${scoreboard()}
      ${endgameBanner()}
      <p class="message">${app.state.message}</p>
      <section class="table">${diceArea()}</section>
      ${rules()}
    </main>`;
}

root.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  switch (target.dataset.action) {
    case 'roll':
      void app.roll();
      break;
    case 'keep':
      app.keep();
      break;
    case 'bank':
      void app.bank();
      break;
    case 'restart':
      app.restart();
      break;
    case 'die':
      app.toggleDie(Number(target.dataset.index));
      break;
  }
});

app.onChange(render);
render();
