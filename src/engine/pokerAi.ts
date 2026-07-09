/**
 * Equity-based heads-up AI opponent for dice poker (DESIGN.md §8).
 *
 * The AI never sees the human's private dice. For the seat to act it:
 *   1. estimates its equity `p` — the probability its final 7-dice hand beats a
 *      uniformly-random opponent hand — by enumerating every unseen die
 *      (opponent's 2 hole + the remaining board), reusing `handEval`, and
 *   2. maps `p` and the pot odds `c = toCall / (pot + toCall)` to a fixed-limit
 *      action (fold / check / call / bet / raise) via the §8 policy.
 *
 * The dice space is tiny — at most 6⁷ = 279,936 completions pre-flop, far fewer
 * post-flop — so the equity is computed *exactly* by enumeration; DESIGN.md §8
 * confirms Monte Carlo is unnecessary, which also makes equity deterministic.
 * The only RNG use is the bluff coin-flip, so games are fully reproducible under
 * a seeded `Rng`.
 *
 * Difficulty profiles (tight / balanced / loose) expose the §8 tuning knobs for
 * Milestone 2; the default is the balanced profile with §8's baseline constants.
 *
 * Integrates directly with the committed betting engine (`hand.ts`): it reads a
 * live `HandState` and always returns an action that `legalActions` permits.
 */
import type { Rng } from './dice';
import { compareHands, evaluateHand } from './handEval';
import {
  board,
  legalActions,
  pot,
  type Action,
  type ActionType,
  type HandState,
} from './hand';

const FACES = [1, 2, 3, 4, 5, 6] as const;
const FULL_BOARD = 5;
const HOLE = 2;

export interface AiProfile {
  name: string;
  /** No bet faces us: value-bet once `p ≥ valueBet`. */
  valueBet: number;
  /** Facing a bet: raise (if the cap allows) once `p ≥ raise`. */
  raise: number;
  /** No bet, `p < bluffCeiling`: bluff-bet with probability `bluffFreq`. */
  bluffCeiling: number;
  /** Probability of a bluff-bet in the weak zone (0 disables bluffing). */
  bluffFreq: number;
  /**
   * Extra fold leniency added to the base 0.05 margin. Positive folds *less*
   * (calls wider); negative folds *more*. A "loose" profile is positive.
   */
  foldMargin: number;
}

/** DESIGN.md §8 baseline: the balanced default profile. */
export const BALANCED: AiProfile = {
  name: 'balanced',
  valueBet: 0.6,
  raise: 0.65,
  bluffCeiling: 0.35,
  bluffFreq: 0.15,
  foldMargin: 0,
};

/** Tight: never bluffs, raises only with a strong edge, folds a touch more. */
export const TIGHT: AiProfile = {
  ...BALANCED,
  name: 'tight',
  valueBet: 0.65,
  raise: 0.75,
  bluffFreq: 0,
  foldMargin: -0.05,
};

/** Loose: value-bets thinner, bluffs more, defends wider. */
export const LOOSE: AiProfile = {
  ...BALANCED,
  name: 'loose',
  valueBet: 0.5,
  bluffFreq: 0.3,
  foldMargin: 0.05,
};

export const PROFILES = { balanced: BALANCED, tight: TIGHT, loose: LOOSE } as const;
export type ProfileName = keyof typeof PROFILES;

/**
 * Exact win-probability for `hole` given the revealed `board`, versus a random
 * opponent hand. Ties count as half a win (a split pot). Enumerates all unseen
 * dice: the (5 − board.length) remaining shared board dice, then the opponent's
 * 2 hidden hole dice.
 */
export function handEquity(hole: readonly number[], board: readonly number[]): number {
  if (hole.length !== HOLE) {
    throw new RangeError(`a hole is ${HOLE} dice, got ${hole.length}`);
  }
  if (board.length > FULL_BOARD) {
    throw new RangeError(`the board holds at most ${FULL_BOARD} dice, got ${board.length}`);
  }

  const boardRemaining = FULL_BOARD - board.length;
  let wins = 0;
  let total = 0;

  const fill = new Array<number>(boardRemaining);
  const enumerateBoard = (depth: number): void => {
    if (depth === boardRemaining) {
      const fullBoard = [...board, ...fill];
      const mine = evaluateHand([...hole, ...fullBoard]);
      for (const a of FACES) {
        for (const b of FACES) {
          const cmp = compareHands(mine, evaluateHand([a, b, ...fullBoard]));
          if (cmp > 0) wins += 1;
          else if (cmp === 0) wins += 0.5;
          total += 1;
        }
      }
      return;
    }
    for (const f of FACES) {
      fill[depth] = f;
      enumerateBoard(depth + 1);
    }
  };
  enumerateBoard(0);

  return total === 0 ? 0.5 : wins / total;
}

export interface AiDecision {
  action: Action;
  /** The equity estimate `p` that drove the decision. */
  equity: number;
  /** Pot odds `c` (0 when no bet faces the AI). */
  potOdds: number;
}

/**
 * Choose the AI's action for the seat currently to act in `state`. `rng` is only
 * consumed for the bluff coin-flip, so decisions are reproducible under a seed.
 * The returned action is always one that `legalActions(state)` permits: the §8
 * preference is coerced to the nearest legal action (e.g. raise → call when the
 * fixed-limit raise cap is reached).
 */
export function chooseAction(
  state: HandState,
  rng: Rng = Math.random,
  profile: AiProfile = BALANCED,
): AiDecision {
  const seat = state.toAct;
  if (seat === undefined) {
    throw new Error('chooseAction called on a hand with no player to act');
  }
  const legal = legalActions(state);
  const player = state.players[seat];
  const equity = handEquity(player.hole, board(state));
  const toCall = state.betToMatch - player.committed;
  const facingBet = toCall > 0;
  const potOdds = facingBet ? toCall / (pot(state) + toCall) : 0;

  const preferred = preferAction(state, seat, equity, potOdds, facingBet, profile, rng);
  return { action: { type: coerceLegal(preferred, legal) }, equity, potOdds };
}

/** The §8 policy: the AI's *preferred* action before legality is enforced. */
function preferAction(
  state: HandState,
  seat: 0 | 1,
  equity: number,
  potOdds: number,
  facingBet: boolean,
  profile: AiProfile,
  rng: Rng,
): ActionType {
  if (facingBet) {
    // Base 0.05 margin, widened by the profile and by position (DESIGN.md §8.4):
    // the button folds a touch more (position lets it act last), the big blind
    // folds less (chips already invested).
    const onButton = state.button === seat;
    const positionMargin = onButton ? -0.05 : 0.05;
    const margin = 0.05 + profile.foldMargin + positionMargin;
    if (equity < potOdds - margin) return 'fold';
    if (equity >= profile.raise) return 'raise';
    return 'call';
  }
  if (equity >= profile.valueBet) return 'bet';
  if (equity < profile.bluffCeiling && profile.bluffFreq > 0 && rng() < profile.bluffFreq) {
    return 'bet';
  }
  return 'check';
}

/** Coerce a preferred action to a legal one for the current spot. */
function coerceLegal(preferred: ActionType, legal: readonly ActionType[]): ActionType {
  if (legal.includes(preferred)) return preferred;
  const fallback: Record<ActionType, ActionType[]> = {
    raise: ['call', 'check'],
    bet: ['check', 'call'],
    call: ['check'],
    check: ['call'],
    fold: ['check', 'call'],
  };
  for (const alt of fallback[preferred]) if (legal.includes(alt)) return alt;
  return legal[0];
}
