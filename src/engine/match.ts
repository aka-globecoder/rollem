/**
 * Heads-up match layer (DESIGN.md §2, §7, §9): chip stacks, button rotation,
 * escalating blinds, and elimination. Wraps the per-hand state machine
 * (`hand.ts`) with the bookkeeping that spans a whole match — the button moves
 * each hand, blinds double on a fixed schedule to guarantee the match ends
 * inside the 3–5 minute target, and a player who reaches 0 chips is eliminated.
 *
 * Pure: `beginHand` deals from an injectable `Rng`, `settleHand` folds a
 * finished hand's stacks back into the match. Neither mutates its input.
 */

import type { Rng } from './dice';
import { startHand, type Deal, type HandConfig, type HandState } from './hand';

export interface MatchConfig {
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  /** Hands between blind doublings (DESIGN.md §2 step 4 / §9: default 6). */
  escalateEveryHands: number;
  /** Seat that starts with the button; it rotates each hand. */
  firstButton?: 0 | 1;
}

export interface MatchState {
  config: MatchConfig;
  stacks: [number, number];
  button: 0 | 1;
  /** Hands completed so far (drives blind escalation). */
  handsPlayed: number;
  smallBlind: number;
  bigBlind: number;
  over: boolean;
  /** Winner seat once the match is over (holds all the chips). */
  winner?: 0 | 1;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  startingStack: 100,
  smallBlind: 1,
  bigBlind: 2,
  escalateEveryHands: 6,
};

export function createMatch(config: MatchConfig = DEFAULT_MATCH_CONFIG): MatchState {
  return {
    config,
    stacks: [config.startingStack, config.startingStack],
    button: config.firstButton ?? 0,
    handsPlayed: 0,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    over: false,
  };
}

/** Big/small blind for a given number of completed hands (doubles on schedule). */
export function blindsAt(config: MatchConfig, handsPlayed: number): {
  smallBlind: number;
  bigBlind: number;
} {
  const level = Math.floor(handsPlayed / config.escalateEveryHands);
  const factor = 2 ** level;
  return {
    smallBlind: config.smallBlind * factor,
    bigBlind: config.bigBlind * factor,
  };
}

/**
 * Deal the next hand from the current stacks, posting the current blinds.
 * Throws if the match is already over.
 */
export function beginHand(match: MatchState, rng: Rng = Math.random, deal?: Deal): HandState {
  if (match.over) throw new Error('the match is over');
  const cfg: HandConfig = {
    button: match.button,
    smallBlind: match.smallBlind,
    bigBlind: match.bigBlind,
    stacks: [match.stacks[0], match.stacks[1]],
  };
  return startHand(cfg, rng, deal);
}

/**
 * Fold a finished hand back into the match: adopt the post-hand stacks, rotate
 * the button, escalate the blinds, and check for elimination. Returns a new
 * match state; does not mutate its inputs.
 */
export function settleHand(match: MatchState, hand: HandState): MatchState {
  if (hand.street !== 'complete') {
    throw new Error('cannot settle a hand that is still in progress');
  }
  const stacks: [number, number] = [hand.players[0].stack, hand.players[1].stack];
  const handsPlayed = match.handsPlayed + 1;
  const button = match.button === 0 ? 1 : 0;
  const { smallBlind, bigBlind } = blindsAt(match.config, handsPlayed);

  const next: MatchState = {
    ...match,
    stacks,
    button,
    handsPlayed,
    smallBlind,
    bigBlind,
    over: false,
  };

  if (stacks[0] <= 0 || stacks[1] <= 0) {
    next.over = true;
    next.winner = stacks[0] <= 0 ? 1 : 0;
  }
  return next;
}
