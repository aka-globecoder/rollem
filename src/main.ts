/**
 * DOM view for Roll'Em dice poker. All game flow lives in ui/table.ts; this
 * file only renders `game.state` and forwards clicks via data-action attributes
 * (DESIGN.md §3 table layout, §8 AI pacing).
 */
import './style.css';
import { pot, type HandState } from './engine/hand';
import { AI, HUMAN, TableGame } from './ui/table';

const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const ACTION_LABEL: Record<string, string> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  bet: 'Bet',
  raise: 'Raise',
};

const game = new TableGame();
const root = document.querySelector<HTMLDivElement>('#app')!;

/** Fixed-limit bet/raise increment for the street (DESIGN.md §3), for labels. */
function increment(hand: HandState): number {
  return hand.street === 'turn' || hand.street === 'river' ? 2 * hand.bigBlind : hand.bigBlind;
}

function die(face: number | null, opts: { hidden?: boolean } = {}): string {
  if (opts.hidden) return `<span class="die back" aria-label="hidden die">?</span>`;
  if (face === null) return `<span class="die empty" aria-hidden="true"></span>`;
  return `<span class="die" aria-label="die showing ${face}">${DIE_FACES[face - 1]}</span>`;
}

function holeDice(seat: number): string {
  const { hand, revealAi } = game.state;
  const hidden = seat === AI && !revealAi;
  const dice = hand.players[seat].hole.map((f) => die(hidden ? null : f, { hidden })).join('');
  return `<div class="dice hole">${dice}</div>`;
}

function playerPanel(seat: number): string {
  const { hand } = game.state;
  const p = hand.players[seat];
  const active = hand.toAct === seat && hand.street !== 'complete';
  const isButton = hand.button === seat;
  const name = seat === HUMAN ? 'You' : 'AI';
  const committed = p.committed > 0 ? `<span class="committed">bet ${p.committed}</span>` : '';
  const flags = [
    isButton ? '<span class="tag button-tag" title="Dealer button / small blind">BTN</span>' : '',
    p.folded ? '<span class="tag folded">folded</span>' : '',
    p.allIn ? '<span class="tag allin">all-in</span>' : '',
  ].join('');
  return `
    <div class="seat ${active ? 'active' : ''} ${seat === AI ? 'ai' : 'human'}">
      <div class="seat-head">
        <span class="seat-name">${name} ${flags}</span>
        <span class="stack">${p.stack} <small>chips</small></span>
      </div>
      ${holeDice(seat)}
      ${committed}
    </div>`;
}

function boardRow(): string {
  const { hand } = game.state;
  const slots: string[] = [];
  for (let i = 0; i < 5; i++) {
    if (i < hand.revealed) slots.push(die(hand.boardFull[i]));
    else slots.push(die(null, { hidden: true }));
  }
  const label = hand.street === 'complete' ? 'Board' : streetLabel(hand);
  return `
    <div class="board">
      <div class="board-label">${label}</div>
      <div class="dice board-dice">${slots.join('')}</div>
      <div class="pot">Pot <strong>${pot(hand)}</strong></div>
    </div>`;
}

function streetLabel(hand: HandState): string {
  switch (hand.street) {
    case 'preflop':
      return 'Pre-flop';
    case 'flop':
      return 'Flop';
    case 'turn':
      return 'Turn';
    case 'river':
      return 'River';
    default:
      return 'Board';
  }
}

function controls(): string {
  const { hand, match, aiThinking } = game.state;

  if (match.over) {
    return `
      <div class="actions end">
        <button class="btn primary" data-action="restart">Play again</button>
      </div>`;
  }
  if (hand.street === 'complete') {
    return `
      <div class="actions end">
        <button class="btn primary" data-action="next">Next hand</button>
      </div>`;
  }
  if (aiThinking || hand.toAct !== HUMAN) {
    return `<div class="actions"><p class="waiting">${aiThinking ? 'AI is thinking…' : 'Waiting…'}</p></div>`;
  }

  const toCall = game.toCall();
  const inc = increment(hand);
  const buttons = game
    .humanActions()
    .map((a) => {
      let label = ACTION_LABEL[a];
      if (a === 'call') label = `Call ${toCall}`;
      else if (a === 'bet') label = `Bet ${inc}`;
      else if (a === 'raise') label = `Raise to ${hand.betToMatch + inc}`;
      const cls = a === 'fold' ? 'btn danger' : a === 'check' || a === 'call' ? 'btn' : 'btn primary';
      return `<button class="${cls}" data-action="act" data-type="${a}">${label}</button>`;
    })
    .join('');
  return `<div class="actions">${buttons}</div>`;
}

function render(): void {
  const { message, log, match } = game.state;
  root.innerHTML = `
    <main class="game">
      <h1>Roll'Em</h1>
      <p class="subtitle">Heads-up dice poker · blinds ${match.smallBlind}/${match.bigBlind} · hand ${match.handsPlayed + 1}</p>
      ${playerPanel(AI)}
      ${boardRow()}
      ${playerPanel(HUMAN)}
      <p class="message">${message}</p>
      ${controls()}
      <details class="log"><summary>Hand log</summary><ul>${log.map((l) => `<li>${l}</li>`).join('')}</ul></details>
      <details class="rules">
        <summary>How to play</summary>
        <p>Texas hold'em with dice. You hold <strong>2 hidden dice</strong>; five shared
        <strong>board dice</strong> come out across the flop, turn and river. Bet across four rounds
        on who makes the best seven-dice combination.</p>
        <p><strong>The twist — rankings invert:</strong> rarer shapes win. A Full House is the
        <em>weakest</em> payable hand; Two Pairs beats it, Trips beat a straight, and so on up to
        Seven of a Kind.</p>
        <p>Win the AI's whole stack to take the match.</p>
      </details>
    </main>`;
}

root.addEventListener('click', (event) => {
  const el = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'act':
      void game.act(el.dataset.type as never);
      break;
    case 'next':
      void game.nextHand();
      break;
    case 'restart':
      game.restart();
      break;
  }
});

game.onChange(render);
render();
void game.start();
