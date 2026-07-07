/**
 * Roll'Em game state machine, implementing DESIGN.md §2 (turn loop),
 * §3 (scoring, via scoring.ts) and §4 (winning). Pure and UI-independent:
 * every action takes a state and returns a new state; randomness is injected.
 *
 * Phases:
 *   'roll'     — current player must roll (turn start, or chose to roll again)
 *   'select'   — a roll is on the table; player must set aside ≥1 scorer
 *   'decide'   — player chooses bank or roll again
 *   'gameOver' — winner decided
 */
import { rollDice, type Rng } from './dice';
import { isBust, scoreSelection } from './scoring';

export type Phase = 'roll' | 'select' | 'decide' | 'gameOver';

export interface GameState {
  /** Banked score needed to trigger the endgame (DESIGN.md: 2,000). */
  target: number;
  /** Banked score per player; index is the player id. Player 0 goes first. */
  banked: number[];
  /** Player whose turn it is. */
  current: number;
  phase: Phase;
  /** Faces showing from the latest roll; only meaningful in 'select'. */
  rolled: number[];
  /** Dice available for the current player's next roll. */
  diceInHand: number;
  /** Unbanked points accumulated this turn. */
  turnTotal: number;
  /** True when the previous turn ended in a bust (informative, for the UI). */
  lastTurnBusted: boolean;
  /** The bust roll that ended the previous turn, if it busted. */
  bustRoll: number[] | null;
  /** Player who first banked >= target, or null before the endgame. */
  endgameTriggeredBy: number | null;
  /** Players still owed a turn before scores are compared (endgame/tie-break). */
  finalTurnQueue: number[];
  winner: number | null;
}

export const DEFAULT_TARGET = 2000;
export const DICE_PER_TURN = 6;

export function newGame(opts: { players?: number; target?: number } = {}): GameState {
  const players = opts.players ?? 2;
  const target = opts.target ?? DEFAULT_TARGET;
  if (!Number.isInteger(players) || players < 2) {
    throw new RangeError(`players must be an integer >= 2, got ${players}`);
  }
  if (!Number.isInteger(target) || target <= 0) {
    throw new RangeError(`target must be a positive integer, got ${target}`);
  }
  return {
    target,
    banked: new Array(players).fill(0),
    current: 0,
    phase: 'roll',
    rolled: [],
    diceInHand: DICE_PER_TURN,
    turnTotal: 0,
    lastTurnBusted: false,
    bustRoll: null,
    endgameTriggeredBy: null,
    finalTurnQueue: [],
    winner: null,
  };
}

function expectPhase(state: GameState, ...allowed: Phase[]): void {
  if (!allowed.includes(state.phase)) {
    throw new Error(`action not allowed in phase '${state.phase}' (need ${allowed.join(' or ')})`);
  }
}

/** Roll the dice in hand. Allowed at turn start ('roll') or as "roll again" ('decide'). */
export function roll(state: GameState, rng: Rng = Math.random): GameState {
  expectPhase(state, 'roll', 'decide');
  const rolled = rollDice(state.diceInHand, rng);
  if (isBust(rolled)) {
    // §2 step 2: turn total is lost, nothing banked, turn ends immediately.
    return endTurn({ ...state, rolled }, { banked: false });
  }
  return { ...state, rolled, phase: 'select' };
}

/**
 * Set aside the dice at `indices` (into `state.rolled`). The selection must be
 * a legal scorer per DESIGN.md §3. Setting aside all dice is hot dice (§2
 * step 5): the turn total is kept and all 6 dice come back.
 */
export function setAside(state: GameState, indices: readonly number[]): GameState {
  expectPhase(state, 'select');
  const unique = new Set(indices);
  if (unique.size !== indices.length) {
    throw new Error('duplicate die index in set-aside');
  }
  for (const i of indices) {
    if (!Number.isInteger(i) || i < 0 || i >= state.rolled.length) {
      throw new RangeError(`die index ${i} out of range for a roll of ${state.rolled.length}`);
    }
  }
  const faces = indices.map((i) => state.rolled[i]);
  const points = scoreSelection(faces);
  if (points === null) {
    throw new Error(`illegal set-aside [${faces.join(', ')}]: must be at least one scoring die/combination`);
  }
  const remaining = state.rolled.length - indices.length;
  return {
    ...state,
    turnTotal: state.turnTotal + points,
    diceInHand: remaining === 0 ? DICE_PER_TURN : remaining,
    rolled: [],
    phase: 'decide',
  };
}

/** True in 'decide' phase when the player just earned all 6 dice back (§2 step 5). */
export function isHotDice(state: GameState): boolean {
  return state.phase === 'decide' && state.diceInHand === DICE_PER_TURN;
}

/** Bank the turn total (§2 step 4). May trigger the endgame or end the game (§4). */
export function bank(state: GameState): GameState {
  expectPhase(state, 'decide');
  return endTurn(state, { banked: true });
}

function endTurn(state: GameState, { banked: didBank }: { banked: boolean }): GameState {
  const next: GameState = {
    ...state,
    banked: [...state.banked],
    finalTurnQueue: [...state.finalTurnQueue],
    lastTurnBusted: !didBank,
    bustRoll: didBank ? null : state.rolled,
  };
  if (didBank) {
    next.banked[next.current] += next.turnTotal;
  }
  // §4: reaching the target by banking gives every other player one final turn.
  if (next.endgameTriggeredBy === null && next.banked[next.current] >= next.target) {
    next.endgameTriggeredBy = next.current;
    const n = next.banked.length;
    next.finalTurnQueue = Array.from({ length: n - 1 }, (_, i) => (next.current + 1 + i) % n);
  }

  if (next.endgameTriggeredBy !== null) {
    const upNext = next.finalTurnQueue.shift();
    if (upNext === undefined) {
      return resolveEndgame(next);
    }
    return startTurn(next, upNext);
  }
  return startTurn(next, (next.current + 1) % next.banked.length);
}

function startTurn(state: GameState, player: number): GameState {
  return {
    ...state,
    current: player,
    phase: 'roll',
    rolled: [],
    diceInHand: DICE_PER_TURN,
    turnTotal: 0,
  };
}

function resolveEndgame(state: GameState): GameState {
  const best = Math.max(...state.banked);
  const leaders = state.banked.flatMap((score, i) => (score === best ? [i] : []));
  if (leaders.length === 1) {
    return { ...state, winner: leaders[0], phase: 'gameOver', rolled: [], turnTotal: 0 };
  }
  // §4 tie-break: everyone plays one more full turn, in normal seat order,
  // until the tie breaks.
  const [first, ...rest] = state.banked.map((_, i) => i);
  return startTurn({ ...state, finalTurnQueue: rest }, first);
}
