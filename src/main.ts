/**
 * DOM view for Roll'Em dice poker. All game flow lives in ui/table.ts; this
 * file only renders `game.state` and forwards clicks via data-action attributes
 * (DESIGN.md §3 table layout, §8 AI pacing).
 */
import './style.css';
import { pot, type HandState } from './engine/hand';
import { CATEGORY_LABEL, HandCategory } from './engine/handEval';
import { describeCurrentHand } from './ui/currentHand';
import { AI, HUMAN, TableGame } from './ui/table';

const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const ACTION_LABEL: Record<string, string> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  bet: 'Bet',
  raise: 'Raise',
};

// Weakest → strongest (inverted from standard poker — rarer beats common)
const RANKING: HandCategory[] = [
  HandCategory.FullHouse,
  HandCategory.TwoPairs,
  HandCategory.ThreePairs,
  HandCategory.FiveStraight,
  HandCategory.Trips,
  HandCategory.SixStraight,
  HandCategory.BigFull,
  HandCategory.FourOfAKind,
  HandCategory.FourPlusPair,
  HandCategory.DoubleTrips,
  HandCategory.FiveOfAKind,
  HandCategory.FourPlusTrips,
  HandCategory.FivePlusPair,
  HandCategory.SixOfAKind,
  HandCategory.SevenOfAKind,
];

const game = new TableGame();
const root = document.querySelector<HTMLDivElement>('#app')!;

// Track previously revealed count so we can animate only newly revealed dice.
let lastRevealed = 0;
let lastRevealAi = false;

/** Fixed-limit bet/raise increment for the street (DESIGN.md §3), for labels. */
function increment(hand: HandState): number {
  return hand.street === 'turn' || hand.street === 'river' ? 2 * hand.bigBlind : hand.bigBlind;
}

function die(
  face: number | null,
  opts: { hidden?: boolean; isNew?: boolean; newIdx?: number } = {},
): string {
  if (opts.hidden) return `<span class="die back" aria-label="hidden die">?</span>`;
  if (face === null) return `<span class="die empty" aria-hidden="true"></span>`;
  const cls = opts.isNew ? 'die new' : 'die';
  const delay =
    opts.isNew && opts.newIdx !== undefined ? ` style="animation-delay:${opts.newIdx * 90}ms"` : '';
  return `<span class="${cls}"${delay} aria-label="die showing ${face}">${DIE_FACES[face - 1]}</span>`;
}

function holeDice(seat: number): string {
  const { hand, revealAi } = game.state;
  const hidden = seat === AI && !revealAi;
  const isNewReveal = seat === AI && revealAi && !lastRevealAi;
  const dice = hand.players[seat].hole
    .map((f, idx) => die(hidden ? null : f, { hidden, isNew: isNewReveal, newIdx: idx }))
    .join('');
  const label = seat === HUMAN ? 'Your dice' : 'AI dice';
  return `<div class="dice hole"><span class="hole-label">${label}</span>${dice}</div>`;
}

/**
 * "What you currently have" readout (Winamax-style): the best shape made from a
 * seat's visible dice — its 2 hole dice plus the revealed board — updated every
 * street. Shown for the human always; for the AI only once its dice are face-up.
 */
function currentHandRow(seat: number): string {
  const { hand, revealAi } = game.state;
  const p = hand.players[seat];
  if (p.folded) return '';
  if (seat === AI && !revealAi) return '';
  const visible = [...p.hole, ...hand.boardFull.slice(0, hand.revealed)];
  const { label, final } = describeCurrentHand(visible);
  const lead = final ? 'Hand' : 'So far';
  return `<div class="current-hand ${final ? 'final' : ''}"><span class="ch-lead">${lead}</span><span class="ch-label">${label}</span></div>`;
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
    active && seat === HUMAN
      ? '<span class="tag turn-badge">Your turn</span>'
      : active
        ? '<span class="tag turn-ai">AI thinking</span>'
        : '',
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
      ${currentHandRow(seat)}
      ${committed}
    </div>`;
}

function boardRow(): string {
  const { hand } = game.state;
  // Detect hand reset: revealed count going backward means a new hand was dealt.
  const isNewHand = hand.revealed < lastRevealed;
  const slots: string[] = [];
  for (let i = 0; i < 5; i++) {
    if (i < hand.revealed) {
      const isNew = !isNewHand && i >= lastRevealed;
      const newIdx = isNew ? i - lastRevealed : 0;
      slots.push(die(hand.boardFull[i], { isNew, newIdx }));
    } else {
      slots.push(die(null, { hidden: true }));
    }
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

function showdownPanel(): string {
  const { hand } = game.state;
  if (hand.street !== 'complete' || !hand.result || hand.result.reason !== 'showdown') return '';
  const [va, vb] = hand.result.handValues!;
  const winners = hand.result.winners;
  const isSplit = winners.length === 2;
  const humanWins = !isSplit && winners[0] === HUMAN;
  const verdict = isSplit ? 'Split pot' : humanWins ? 'You win!' : 'AI wins';
  const cls = isSplit ? 'split' : humanWins ? 'win' : 'loss';
  return `
    <div class="showdown-panel ${cls}">
      <div class="showdown-verdict">${verdict} &middot; ${hand.result.potAwarded} chips</div>
      <div class="showdown-hands">
        <div class="showdown-hand${humanWins ? ' winner' : ''}">
          <span class="sh-label">You</span>
          <span class="sh-cat">${CATEGORY_LABEL[va.category]}</span>
        </div>
        <span class="showdown-vs">vs</span>
        <div class="showdown-hand${!humanWins && !isSplit ? ' winner' : ''}">
          <span class="sh-label">AI</span>
          <span class="sh-cat">${CATEGORY_LABEL[vb.category]}</span>
        </div>
      </div>
    </div>`;
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

function rankingRows(): string {
  return RANKING.map((cat, i) => {
    const isWeak = i === 0;
    const isStrong = i === RANKING.length - 1;
    const badge = isWeak
      ? '<span class="rank-badge weak">weakest</span>'
      : isStrong
        ? '<span class="rank-badge strong">strongest</span>'
        : '';
    return `<tr><td class="rank-n">${i + 1}</td><td>${CATEGORY_LABEL[cat]}</td><td>${badge}</td></tr>`;
  }).join('');
}

function render(): void {
  const { message, log, match } = game.state;
  root.innerHTML = `
    <main class="game">
      <h1>Roll'Em</h1>
      <p class="subtitle">Heads-up dice poker &middot; blinds ${match.smallBlind}/${match.bigBlind} &middot; hand ${match.handsPlayed + 1}</p>
      <p class="invert-hint">Rarer combos win &mdash; <em>Full House is weakest</em>, Seven of a Kind is best</p>
      ${playerPanel(AI)}
      ${boardRow()}
      ${playerPanel(HUMAN)}
      ${showdownPanel()}
      <p class="message">${message}</p>
      ${controls()}
      <details class="log"><summary>Hand log</summary><ul>${log.map((l) => `<li>${l}</li>`).join('')}</ul></details>
      <details class="rules">
        <summary>How to play &amp; rankings</summary>
        <p>Texas hold'em with dice. You hold <strong>2 private dice</strong>; five shared
        <strong>board dice</strong> come out flop&rarr;turn&rarr;river. Four rounds of fixed-limit betting.</p>
        <p><strong>Rankings are inverted</strong> &mdash; rarer shapes beat common ones:</p>
        <table class="rank-table">
          <thead><tr><th>#</th><th>Hand</th><th></th></tr></thead>
          <tbody>${rankingRows()}</tbody>
        </table>
      </details>
    </main>`;

  // Update tracking state AFTER DOM is written so boardRow() used the previous values.
  lastRevealed = game.state.hand.revealed;
  lastRevealAi = game.state.revealAi;
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
