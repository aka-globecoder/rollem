/**
 * Headless game-flow controller for the browser UI (DESIGN.md §7).
 * Owns the UI state (selection, messages, AI pacing) on top of the pure
 * engine, with rng and delays injected so a full game is unit-testable
 * without a DOM. `main.ts` only renders this state and forwards clicks.
 */
import { aiChooseSetAside, aiDecide } from '../engine/ai';
import type { Rng } from '../engine/dice';
import { bank, isHotDice, newGame, roll, setAside, type GameState } from '../engine/game';
import { isDieSelectable, selectionPoints } from './selection';

export const HUMAN = 0;
export const AI = 1;

export type Delay = (ms: number) => Promise<void>;

export interface AppState {
  game: GameState;
  /** Human's (or, during AI turns, the AI's) currently highlighted dice. */
  selected: ReadonlySet<number>;
  /** One-line narration of the last thing that happened. */
  message: string;
  /** A turn-ending bust roll to keep on screen until the next action. */
  flashDice: readonly number[] | null;
  /** True while the AI turn is animating; human actions are ignored. */
  aiTurnRunning: boolean;
}

const realDelay: Delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fmt = (n: number): string => n.toLocaleString('en-US');

export class App {
  state: AppState;
  private readonly rng: Rng;
  private readonly delay: Delay;
  private readonly listeners: Array<() => void> = [];

  constructor(opts: { rng?: Rng; delay?: Delay } = {}) {
    this.rng = opts.rng ?? Math.random;
    this.delay = opts.delay ?? realDelay;
    this.state = App.initialState();
  }

  private static initialState(): AppState {
    return {
      game: newGame(),
      selected: new Set(),
      message: 'Your turn — roll the dice!',
      flashDice: null,
      aiTurnRunning: false,
    };
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  private update(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private humanCanAct(): boolean {
    const { game, aiTurnRunning } = this.state;
    return !aiTurnRunning && game.current === HUMAN && game.phase !== 'gameOver';
  }

  /** Human rolls (turn start or roll-again). Drives the AI turn on a bust. */
  async roll(): Promise<void> {
    const { game } = this.state;
    if (!this.humanCanAct() || (game.phase !== 'roll' && game.phase !== 'decide')) return;
    const atRisk = game.turnTotal;
    const next = roll(game, this.rng);
    if (next.phase === 'select') {
      this.update({
        game: next,
        selected: new Set(),
        flashDice: null,
        message: 'Click the dice you want to keep, then press Keep.',
      });
      return;
    }
    // The roll busted: the engine already ended the turn.
    this.update({
      game: next,
      selected: new Set(),
      flashDice: next.bustRoll,
      message: atRisk > 0 ? `Bust! No scoring dice — ${fmt(atRisk)} points lost.` : 'Bust! No scoring dice.',
    });
    await this.runAiTurnIfNeeded();
  }

  /** Toggle a die in/out of the human's selection. */
  toggleDie(index: number): void {
    const { game, selected } = this.state;
    if (!this.humanCanAct() || game.phase !== 'select') return;
    if (!Number.isInteger(index) || !isDieSelectable(game.rolled, index)) return;
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this.update({ selected: next });
  }

  /** Set aside the selected dice. No-op unless the selection is legal. */
  keep(): void {
    const { game, selected } = this.state;
    if (!this.humanCanAct() || game.phase !== 'select') return;
    const points = selectionPoints(game.rolled, selected);
    if (points === null) return;
    const next = setAside(game, [...selected]);
    this.update({
      game: next,
      selected: new Set(),
      message: isHotDice(next)
        ? `Hot dice! +${fmt(points)} and all 6 dice back — bank or roll again.`
        : `+${fmt(points)} points. Bank ${fmt(next.turnTotal)}, or roll the ${next.diceInHand} remaining dice?`,
    });
  }

  /** Bank the turn total, then run the AI's turn. */
  async bank(): Promise<void> {
    const { game } = this.state;
    if (!this.humanCanAct() || game.phase !== 'decide') return;
    const banked = game.turnTotal;
    const next = bank(game);
    this.update({
      game: next,
      selected: new Set(),
      flashDice: null,
      message: `You banked ${fmt(banked)} points (total ${fmt(next.banked[HUMAN])}).`,
    });
    await this.runAiTurnIfNeeded();
  }

  restart(): void {
    if (this.state.game.phase !== 'gameOver') return;
    this.update(App.initialState());
  }

  private async runAiTurnIfNeeded(): Promise<void> {
    let game = this.state.game;
    if (game.phase === 'gameOver' || game.current !== AI) return;
    this.update({ aiTurnRunning: true });
    while (game.current === AI && game.phase !== 'gameOver') {
      await this.aiStep();
      game = this.state.game;
    }
    const over = game.phase === 'gameOver';
    this.update({
      aiTurnRunning: false,
      message: over ? this.state.message : `${this.state.message} Your turn!`,
    });
  }

  private async aiStep(): Promise<void> {
    const game = this.state.game;
    switch (game.phase) {
      case 'roll':
        await this.aiRoll(game);
        return;
      case 'select': {
        await this.delay(650);
        const indices = aiChooseSetAside(game.rolled);
        this.update({ selected: new Set(indices), message: 'AI keeps the highlighted dice…' });
        await this.delay(900);
        const points = selectionPoints(game.rolled, new Set(indices)) ?? 0;
        const next = setAside(game, indices);
        this.update({
          game: next,
          selected: new Set(),
          message: isHotDice(next)
            ? `AI scored ${fmt(points)} — hot dice, all 6 back!`
            : `AI keeps ${fmt(points)} points (turn total ${fmt(next.turnTotal)}).`,
        });
        return;
      }
      case 'decide': {
        await this.delay(700);
        if (aiDecide(game) === 'bank') {
          const banked = game.turnTotal;
          const next = bank(game);
          this.update({
            game: next,
            selected: new Set(),
            flashDice: null,
            message: `AI banked ${fmt(banked)} points (total ${fmt(next.banked[AI])}).`,
          });
          await this.delay(900);
        } else {
          await this.aiRoll(game);
        }
        return;
      }
      case 'gameOver':
        return;
    }
  }

  private async aiRoll(game: GameState): Promise<void> {
    await this.delay(650);
    const atRisk = game.turnTotal;
    const next = roll(game, this.rng);
    if (next.phase === 'select') {
      this.update({
        game: next,
        selected: new Set(),
        flashDice: null,
        message: `AI rolls ${next.rolled.length} dice…`,
      });
      return;
    }
    this.update({
      game: next,
      selected: new Set(),
      flashDice: next.bustRoll,
      message: atRisk > 0 ? `AI busted — ${fmt(atRisk)} points lost!` : 'AI busted with nothing to lose.',
    });
    await this.delay(1200);
  }
}
