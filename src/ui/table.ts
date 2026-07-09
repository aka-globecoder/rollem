/**
 * Headless controller for the heads-up dice-poker table UI (DESIGN.md §3, §8).
 *
 * Sits on top of the pure engine (`match.ts` / `hand.ts`) and the AI
 * (`pokerAi.ts`), owning only presentation concerns: whose turn it is, paced AI
 * play, a running narration log, and when the AI's hidden dice become visible
 * (a showdown reveals them; a fold never does — DESIGN.md §3). Randomness and
 * turn pacing are injected (`rng`, `delay`) so a whole match is unit-testable
 * without a DOM, exactly like the retired push-your-luck `ui/app.ts`.
 *
 * `main.ts` renders `game.state` and forwards clicks; it holds no game logic.
 */
import type { Rng } from '../engine/dice';
import { CATEGORY_LABEL } from '../engine/handEval';
import {
  applyAction,
  board,
  legalActions,
  pot,
  type ActionType,
  type HandState,
} from '../engine/hand';
import {
  DEFAULT_MATCH_CONFIG,
  beginHand,
  createMatch,
  settleHand,
  type MatchConfig,
  type MatchState,
} from '../engine/match';
import { BALANCED, chooseAction, type AiProfile } from '../engine/pokerAi';

/** Fixed seats: the human is seat 0, the AI seat 1 (the button still rotates). */
export const HUMAN = 0;
export const AI = 1;

export type Delay = (ms: number) => Promise<void>;

export interface TableState {
  match: MatchState;
  hand: HandState;
  /** One-line summary of the latest event, for the headline. */
  message: string;
  /** Narration of the hand so far, newest last. */
  log: string[];
  /** True once the AI's private dice may be shown (set at a showdown). */
  revealAi: boolean;
  /** True while the AI is "thinking"; the board ignores human clicks. */
  aiThinking: boolean;
}

const realDelay: Delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface TableOptions {
  rng?: Rng;
  delay?: Delay;
  profile?: AiProfile;
  matchConfig?: MatchConfig;
  /** Pacing between AI actions / street reveals (ms). */
  aiPauseMs?: number;
}

const seatName = (seat: number): string => (seat === HUMAN ? 'You' : 'AI');
const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

export class TableGame {
  state: TableState;
  private readonly rng: Rng;
  private readonly delay: Delay;
  private readonly profile: AiProfile;
  private readonly pause: number;
  private readonly listeners: Array<() => void> = [];
  /** Guards against reentrant human clicks while the AI is acting. */
  private busy = false;

  constructor(opts: TableOptions = {}) {
    this.rng = opts.rng ?? Math.random;
    this.delay = opts.delay ?? realDelay;
    this.profile = opts.profile ?? BALANCED;
    this.pause = opts.aiPauseMs ?? 800;
    const match = createMatch(opts.matchConfig ?? DEFAULT_MATCH_CONFIG);
    const hand = beginHand(match, this.rng);
    this.state = {
      match,
      hand,
      message: this.openingMessage(hand),
      log: [`Hand 1 — blinds ${hand.smallBlind}/${hand.bigBlind}.`],
      revealAi: false,
      aiThinking: false,
    };
    if (hand.street === 'complete') this.narrateResult();
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** Chips the human must add to call (0 if nothing to call). */
  toCall(): number {
    const { hand } = this.state;
    if (hand.toAct !== HUMAN) return 0;
    return Math.max(0, hand.betToMatch - hand.players[HUMAN].committed);
  }

  /** The human's currently legal actions (empty unless it's the human's turn). */
  humanActions(): ActionType[] {
    return this.state.hand.toAct === HUMAN ? legalActions(this.state.hand) : [];
  }

  pot(): number {
    return pot(this.state.hand);
  }

  board(): number[] {
    return board(this.state.hand);
  }

  /**
   * Drive any initial AI action (relevant when the AI holds the button and acts
   * first pre-flop). Safe to call once after wiring up the view.
   */
  async start(): Promise<void> {
    await this.driveAi();
  }

  /** Apply the human's chosen action, then let the AI respond. */
  async act(type: ActionType): Promise<void> {
    if (this.busy) return;
    const { hand } = this.state;
    if (hand.toAct !== HUMAN || hand.street === 'complete') return;
    if (!legalActions(hand).includes(type)) return; // ignore illegal clicks
    this.applyAndNarrate(HUMAN, type);
    this.emit();
    await this.driveAi();
  }

  /** Deal the next hand after one completes (or finish if the match is over). */
  async nextHand(): Promise<void> {
    if (this.busy || this.state.hand.street !== 'complete') return;
    const settled = settleHand(this.state.match, this.state.hand);
    this.state.match = settled;
    if (settled.over) {
      this.state.message = `Match over — ${seatName(settled.winner!)} take${settled.winner === HUMAN ? '' : 's'} every chip.`;
      this.emit();
      return;
    }
    const hand = beginHand(settled, this.rng);
    this.state.hand = hand;
    this.state.revealAi = false;
    this.state.log = [`Hand ${settled.handsPlayed + 1} — blinds ${hand.smallBlind}/${hand.bigBlind}.`];
    this.state.message = this.openingMessage(hand);
    if (hand.street === 'complete') this.narrateResult();
    this.emit();
    await this.driveAi();
  }

  /** Abandon the current match and start a fresh one. */
  restart(): void {
    const match = createMatch(this.state.match.config);
    const hand = beginHand(match, this.rng);
    this.state = {
      match,
      hand,
      message: this.openingMessage(hand),
      log: [`Hand 1 — blinds ${hand.smallBlind}/${hand.bigBlind}.`],
      revealAi: false,
      aiThinking: false,
    };
    this.emit();
    void this.driveAi();
  }

  /** Run the AI while it is its turn, pausing between actions for readability. */
  /** True while the hand is live and it is the AI's turn to act. */
  private isAiTurn(): boolean {
    const { hand } = this.state;
    return hand.street !== 'complete' && hand.toAct === AI;
  }

  private async driveAi(): Promise<void> {
    this.busy = true;
    try {
      while (this.isAiTurn()) {
        this.state.aiThinking = true;
        this.emit();
        await this.delay(this.pause);
        const { action } = chooseAction(this.state.hand, this.rng, this.profile);
        this.state.aiThinking = false;
        this.applyAndNarrate(AI, action.type);
        this.emit();
        if (this.isAiTurn()) await this.delay(this.pause);
      }
    } finally {
      this.state.aiThinking = false;
      this.busy = false;
      this.emit();
    }
  }

  /** Apply one action to the hand and append the human-readable narration. */
  private applyAndNarrate(actor: number, type: ActionType): void {
    const before = this.state.hand;
    const potBefore = pot(before);
    const next = applyAction(before, { type });
    this.state.hand = next;

    const added = pot(next) - potBefore;
    this.state.message = this.actionText(actor, type, added, next.betToMatch);
    this.pushLog(this.state.message);

    if (next.revealed > before.revealed && next.street !== 'complete') {
      this.pushLog(`${cap(next.street)}: ${this.board().join('-')}.`);
    }
    if (next.street === 'complete') this.narrateResult();
  }

  private actionText(actor: number, type: ActionType, added: number, betTo: number): string {
    const who = seatName(actor);
    switch (type) {
      case 'fold':
        return `${who} fold${actor === HUMAN ? '' : 's'}.`;
      case 'check':
        return `${who} check${actor === HUMAN ? '' : 's'}.`;
      case 'call':
        return `${who} call${actor === HUMAN ? '' : 's'} ${added}.`;
      case 'bet':
        return `${who} bet${actor === HUMAN ? '' : 's'} ${added}.`;
      case 'raise':
        return `${who} raise${actor === HUMAN ? '' : 's'} to ${betTo}.`;
    }
  }

  /** Summarise a finished hand: reveal on showdown, award the pot. */
  private narrateResult(): void {
    const { hand } = this.state;
    const result = hand.result;
    if (!result) return;

    if (result.reason === 'fold') {
      const winner = result.winners[0];
      const folder = winner === HUMAN ? AI : HUMAN;
      this.state.message = `${seatName(winner)} win${winner === HUMAN ? '' : 's'} ${result.potAwarded} — ${seatName(folder)} folded.`;
    } else {
      this.state.revealAi = true;
      const [va, vb] = result.handValues!;
      const yours = CATEGORY_LABEL[va.category];
      const theirs = CATEGORY_LABEL[vb.category];
      let verdict: string;
      if (result.winners.length === 2) {
        verdict = `Split pot (${result.potAwarded}).`;
      } else {
        const w = result.winners[0];
        verdict = `${seatName(w)} win${w === HUMAN ? '' : 's'} ${result.potAwarded}.`;
      }
      this.state.message = `Showdown — You: ${yours} vs AI: ${theirs}. ${verdict}`;
      this.pushLog(`Board: ${hand.boardFull.join('-')}.`);
    }
    this.pushLog(this.state.message);
  }

  private openingMessage(hand: HandState): string {
    if (hand.street === 'complete') return 'Hand over before the action — blinds settled.';
    const humanIsButton = hand.button === HUMAN;
    return humanIsButton
      ? 'You are on the button (small blind) — your action.'
      : 'AI is on the button; you posted the big blind.';
  }

  private pushLog(line: string): void {
    this.state.log = [...this.state.log, line].slice(-12);
  }
}
