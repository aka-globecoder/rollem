/**
 * AI opponent from DESIGN.md §5: fixed deterministic heuristics, no lookahead,
 * rolling the same fair dice as the human.
 */
import { DICE_PER_TURN, type GameState } from './game';
import { scoringDiceIndices } from './scoring';

/** Greedy set-aside policy: keep every scoring die/combination in the roll. */
export function aiChooseSetAside(rolled: readonly number[]): number[] {
  return scoringDiceIndices(rolled);
}

export type Decision = 'bank' | 'roll';

/**
 * Bank-or-roll decision, evaluated in DESIGN.md §5 order. The final-turn rule
 * comes first: once an opponent has already reached the target, merely
 * reaching the target is not enough — the AI must beat the best opponent
 * score or keep rolling.
 */
export function aiDecide(state: GameState): Decision {
  const { banked, current, turnTotal, target, diceInHand } = state;
  const total = banked[current] + turnTotal;

  const onFinalTurn = state.endgameTriggeredBy !== null && state.endgameTriggeredBy !== current;
  if (onFinalTurn) {
    const bestOpponent = Math.max(...banked.filter((_, i) => i !== current));
    return total > bestOpponent ? 'bank' : 'roll';
  }
  if (total >= target) return 'bank';
  if (diceInHand === DICE_PER_TURN && turnTotal > 0) return 'roll'; // hot dice
  if (turnTotal >= 300) return 'bank';
  if (diceInHand < 3 && turnTotal >= 150) return 'bank';
  return 'roll';
}
