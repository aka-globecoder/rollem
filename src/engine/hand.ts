/**
 * Dice-poker hand state machine + fixed-limit betting engine (DESIGN.md §3–§7).
 *
 * Drives a single heads-up hand from the deal through four betting streets
 * (pre-flop / flop / turn / river) to showdown and pot award. Pure and
 * UI-independent: all randomness enters through an injectable `Rng`, and every
 * transition is a pure function of the prior state plus one player action.
 *
 * Heads-up specifics (DESIGN.md §2 step 3): the button posts the small blind
 * and acts first pre-flop; the other player posts the big blind and acts first
 * on every later street. Side pots are not needed heads-up — an uncalled
 * all-in excess is simply refunded (DESIGN.md §3, §6).
 *
 * Fixed-limit sizing (DESIGN.md §3): a bet/raise is one big blind pre-flop and
 * on the flop, two big blinds on the turn and river; at most one bet + three
 * raises per street.
 */

import { rollDice, type Rng } from './dice';
import { compareHands, evaluateHand, type HandValue } from './handEval';

/** Streets, in order; `showdown`/`complete` are terminal (no more actions). */
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'complete';

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface Action {
  type: ActionType;
}

/** Per-player mutable state within a hand. */
export interface PlayerState {
  /** The 2 private dice ("the hand"), kept hidden until showdown. */
  hole: number[];
  /** Chips still behind the player (not yet in the pot). */
  stack: number;
  /** Chips committed on the current street (reset each street). */
  committed: number;
  /** Chips committed across the whole hand (blinds + all streets). */
  totalCommitted: number;
  /** Whether the player has acted at least once on the current street. */
  hasActed: boolean;
  folded: boolean;
  allIn: boolean;
}

export interface HandResult {
  /** How the hand ended: everyone-but-one folded, or a showdown. */
  reason: 'fold' | 'showdown';
  /** Player indices splitting the matched pot (one winner, or two on a tie). */
  winners: number[];
  /** Matched chips distributed to the winner(s). */
  potAwarded: number;
  /** Uncalled excess returned to a player before awarding, if any. */
  refund?: { player: number; amount: number };
  /** Evaluated hands, present only at a showdown. */
  handValues?: [HandValue, HandValue];
}

export interface HandState {
  street: Street;
  /** All 5 community dice; only `revealed` of them are public (see `board`). */
  boardFull: number[];
  /** Number of community dice revealed so far (0 / 3 / 4 / 5). */
  revealed: number;
  players: [PlayerState, PlayerState];
  /** Seat that holds the button (posts the small blind, acts first pre-flop). */
  button: 0 | 1;
  smallBlind: number;
  bigBlind: number;
  /** Whose turn it is to act (undefined once the hand is complete). */
  toAct?: 0 | 1;
  /** Highest chips committed by any player on the current street. */
  betToMatch: number;
  /** Aggressive actions this street (the pre-flop big blind counts as one). */
  raiseCount: number;
  result?: HandResult;
}

/** Optional pre-set dice so tests can drive fixed deals (DESIGN.md §11). */
export interface Deal {
  holes: [number[], number[]];
  /** All 5 community dice, revealed flop(3)/turn(1)/river(1) as streets pass. */
  board: number[];
}

/** Max aggressive actions per street: one bet + three raises (DESIGN.md §3). */
export const RAISE_CAP = 4;

export interface HandConfig {
  button: 0 | 1;
  smallBlind: number;
  bigBlind: number;
  /** Chips behind each player before blinds are posted. */
  stacks: [number, number];
}

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

/** Community dice revealed once a street has been reached. */
const REVEALED_AT: Record<Street, number> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
  complete: 5,
};

/** Fixed-limit bet/raise increment for a street (DESIGN.md §3). */
function betIncrement(street: Street, bigBlind: number): number {
  return street === 'turn' || street === 'river' ? 2 * bigBlind : bigBlind;
}

const other = (p: 0 | 1): 0 | 1 => (p === 0 ? 1 : 0);

/**
 * Deal a fresh hand and post the blinds. Deterministic given `rng`; pass `deal`
 * to force specific dice (tests). The returned state is ready for the first
 * pre-flop action by the button (small blind).
 */
export function startHand(cfg: HandConfig, rng: Rng = Math.random, deal?: Deal): HandState {
  const holes: [number[], number[]] = deal
    ? [deal.holes[0].slice(), deal.holes[1].slice()]
    : [rollDice(2, rng), rollDice(2, rng)];
  const boardFull = deal ? deal.board.slice() : rollDice(5, rng);

  const players: [PlayerState, PlayerState] = [0, 1].map((i) => ({
    hole: holes[i],
    stack: cfg.stacks[i],
    committed: 0,
    totalCommitted: 0,
    hasActed: false,
    folded: false,
    allIn: false,
  })) as [PlayerState, PlayerState];

  const state: HandState = {
    street: 'preflop',
    boardFull,
    revealed: 0,
    players,
    button: cfg.button,
    smallBlind: cfg.smallBlind,
    bigBlind: cfg.bigBlind,
    toAct: cfg.button, // button (small blind) acts first pre-flop
    betToMatch: 0,
    raiseCount: 1, // the big blind is the opening "bet" pre-flop
  };

  // Post blinds: button = small blind, opponent = big blind (heads-up, §2).
  postChips(state.players[cfg.button], cfg.smallBlind);
  postChips(state.players[other(cfg.button)], cfg.bigBlind);
  state.betToMatch = Math.max(
    state.players[0].committed,
    state.players[1].committed,
  );

  // A player too short to cover the blind is all-in; resolve immediately if
  // that leaves no live betting to do.
  settleIfBettingClosed(state);
  return state;
}

/** Public view of the revealed community dice. */
export function board(state: HandState): number[] {
  return state.boardFull.slice(0, state.revealed);
}

/** The legal action types for the player to act right now (empty if none). */
export function legalActions(state: HandState): ActionType[] {
  if (state.toAct === undefined || state.street === 'complete') return [];
  const p = state.toAct;
  const player = state.players[p];
  const toCall = state.betToMatch - player.committed;
  const canAggress = state.raiseCount < RAISE_CAP && player.stack > 0;
  const actions: ActionType[] = [];
  if (toCall > 0) {
    actions.push('fold', 'call');
    if (canAggress) actions.push('raise');
  } else {
    actions.push('check');
    if (canAggress) actions.push(state.betToMatch === 0 ? 'bet' : 'raise');
  }
  return actions;
}

/**
 * Apply one player action, returning the next state. Throws
 * `IllegalActionError` for any action not permitted in the current state; the
 * input is never mutated.
 */
export function applyAction(state: HandState, action: Action): HandState {
  if (state.toAct === undefined || state.street === 'complete') {
    throw new IllegalActionError('the hand is not awaiting an action');
  }
  const next: HandState = structuredClone(state);
  const p = next.toAct as 0 | 1;
  const player = next.players[p];
  const toCall = next.betToMatch - player.committed;
  const legal = legalActions(next);
  if (!legal.includes(action.type)) {
    throw new IllegalActionError(
      `${action.type} is illegal here (legal: ${legal.join(', ') || 'none'})`,
    );
  }

  switch (action.type) {
    case 'fold':
      player.folded = true;
      player.hasActed = true;
      resolveByFold(next);
      return next;
    case 'check':
      player.hasActed = true;
      break;
    case 'call':
      postChips(player, toCall);
      player.hasActed = true;
      break;
    case 'bet':
    case 'raise': {
      const inc = betIncrement(next.street, next.bigBlind);
      const target = next.betToMatch + inc; // raise-to / bet-to amount
      postChips(player, target - player.committed);
      next.betToMatch = Math.max(next.betToMatch, player.committed);
      next.raiseCount++;
      player.hasActed = true;
      break;
    }
  }

  next.toAct = other(p);
  if (bettingRoundComplete(next)) advanceStreet(next);
  else settleIfBettingClosed(next);
  return next;
}

/** Move `amount` chips (capped at the stack) from behind into the pot. */
function postChips(player: PlayerState, amount: number): void {
  const paid = Math.min(Math.max(amount, 0), player.stack);
  player.stack -= paid;
  player.committed += paid;
  player.totalCommitted += paid;
  if (player.stack === 0) player.allIn = true;
}

/** True once both live players have acted and matched the street's top bet. */
function bettingRoundComplete(state: HandState): boolean {
  for (const player of state.players) {
    if (player.folded || player.allIn) continue;
    if (!player.hasActed) return false;
    if (player.committed !== state.betToMatch) return false;
  }
  return true;
}

/**
 * Handle the case where betting can no longer proceed even though the current
 * street's round isn't "complete" in the normal sense: a player is all-in and
 * the other has nothing left to call, so the remaining board is dealt and the
 * hand goes straight to showdown (DESIGN.md §3, all-in runs out).
 */
function settleIfBettingClosed(state: HandState): void {
  const live = state.players.filter((pl) => !pl.folded);
  if (live.length <= 1) return; // fold path handled elsewhere
  const active = live.filter((pl) => !pl.allIn);
  if (active.length === 0) {
    runOutAndShowdown(state); // both all-in
    return;
  }
  if (active.length === 1) {
    // The lone player still betting only continues if they owe chips.
    const p = state.players.indexOf(active[0]) as 0 | 1;
    if (active[0].committed >= state.betToMatch) {
      runOutAndShowdown(state);
    } else {
      state.toAct = p; // must call the all-in or fold
    }
  }
}

/** Advance to the next street, or to showdown after the river. */
function advanceStreet(state: HandState): void {
  for (const player of state.players) {
    player.committed = 0;
    player.hasActed = false;
  }
  state.betToMatch = 0;
  state.raiseCount = 0;

  const nextStreet: Record<Street, Street> = {
    preflop: 'flop',
    flop: 'turn',
    turn: 'river',
    river: 'complete',
    complete: 'complete',
  };
  const ns = nextStreet[state.street];
  if (ns === 'complete') {
    showdown(state);
    return;
  }
  state.street = ns;
  state.revealed = REVEALED_AT[ns];
  // Post-flop the big blind (non-button) acts first (DESIGN.md §2 step 3).
  state.toAct = other(state.button);
  // If nobody can still bet (someone was all-in), run the rest out.
  settleIfBettingClosed(state);
}

/** Reveal all community dice and jump to showdown (used after an all-in). */
function runOutAndShowdown(state: HandState): void {
  state.revealed = 5;
  showdown(state);
}

/** A player folded: the other wins the whole pot with no reveal. */
function resolveByFold(state: HandState): void {
  const winner = state.players.findIndex((pl) => !pl.folded) as 0 | 1;
  const pot = state.players[0].totalCommitted + state.players[1].totalCommitted;
  state.players[winner].stack += pot;
  state.street = 'complete';
  state.toAct = undefined;
  state.result = { reason: 'fold', winners: [winner], potAwarded: pot };
}

/** Reveal both hands, refund any uncalled excess, and award the matched pot. */
function showdown(state: HandState): void {
  const [a, b] = state.players;

  // Heads-up: refund the uncalled part of the larger contribution (no side pot).
  let refund: HandResult['refund'];
  const diff = a.totalCommitted - b.totalCommitted;
  if (diff > 0) {
    a.stack += diff;
    refund = { player: 0, amount: diff };
  } else if (diff < 0) {
    b.stack += -diff;
    refund = { player: 1, amount: -diff };
  }

  const matched = a.totalCommitted + b.totalCommitted - Math.abs(diff);
  const va = evaluateHand([...a.hole, ...state.boardFull]);
  const vb = evaluateHand([...b.hole, ...state.boardFull]);
  const cmp = compareHands(va, vb);

  let winners: number[];
  if (cmp > 0) {
    a.stack += matched;
    winners = [0];
  } else if (cmp < 0) {
    b.stack += matched;
    winners = [1];
  } else {
    // Split; the odd chip goes to the first seat left of the button, which
    // heads-up is the big blind = the non-button player (DESIGN.md §6 step 3).
    const half = Math.floor(matched / 2);
    const oddSeat = other(state.button);
    a.stack += half;
    b.stack += half;
    state.players[oddSeat].stack += matched - 2 * half;
    winners = [0, 1];
  }

  state.street = 'complete';
  state.toAct = undefined;
  state.result = {
    reason: 'showdown',
    winners,
    potAwarded: matched,
    refund,
    handValues: [va, vb],
  };
}

/** Total chips currently in the pot (sum of both players' contributions). */
export function pot(state: HandState): number {
  return state.players[0].totalCommitted + state.players[1].totalCommitted;
}
