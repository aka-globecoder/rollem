import { describe, expect, it } from 'vitest';
import { applyAction, legalActions, type HandState } from './hand';
import {
  beginHand,
  blindsAt,
  createMatch,
  DEFAULT_MATCH_CONFIG,
  settleHand,
} from './match';
import { mulberry32 } from './rng';

describe('match setup', () => {
  it('starts both players at the configured stack and blinds', () => {
    const m = createMatch();
    expect(m.stacks).toEqual([100, 100]);
    expect(m.smallBlind).toBe(1);
    expect(m.bigBlind).toBe(2);
    expect(m.over).toBe(false);
  });
});

describe('blind escalation (DESIGN.md §2 step 4 / §9)', () => {
  it('doubles the big blind every 6 hands', () => {
    const c = DEFAULT_MATCH_CONFIG;
    expect(blindsAt(c, 0)).toEqual({ smallBlind: 1, bigBlind: 2 });
    expect(blindsAt(c, 5)).toEqual({ smallBlind: 1, bigBlind: 2 });
    expect(blindsAt(c, 6)).toEqual({ smallBlind: 2, bigBlind: 4 });
    expect(blindsAt(c, 12)).toEqual({ smallBlind: 4, bigBlind: 8 });
    expect(blindsAt(c, 18)).toEqual({ smallBlind: 8, bigBlind: 16 });
  });
});

describe('button rotation', () => {
  it('moves the button to the other seat after each hand', () => {
    const m = createMatch();
    expect(m.button).toBe(0);
    const hand = foldOutHand(m);
    const m2 = settleHand(m, hand);
    expect(m2.button).toBe(1);
    expect(m2.handsPlayed).toBe(1);
  });
});

describe('settleHand', () => {
  it('adopts the post-hand stacks and rejects an unfinished hand', () => {
    const m = createMatch();
    const live = beginHand(m, mulberry32(1));
    expect(() => settleHand(m, live)).toThrow();
  });

  it('escalates the blinds once six hands have been played', () => {
    let m = createMatch();
    for (let i = 0; i < 6; i++) m = settleHand(m, foldOutHand(m));
    expect(m.handsPlayed).toBe(6);
    expect(m.bigBlind).toBe(4);
    expect(m.smallBlind).toBe(2);
  });
});

describe('elimination / match termination', () => {
  it('ends the match and names the winner when a stack reaches 0', () => {
    // Tiny stacks so one hand busts a player. Deal p0 the winner.
    const m = createMatch({
      startingStack: 2,
      smallBlind: 1,
      bigBlind: 2,
      escalateEveryHands: 100,
    });
    // Both post their entire stack as blinds (SB 1 leaves 1, BB 2 leaves 0).
    let hand = beginHand(m, mulberry32(1), {
      holes: [
        [6, 6],
        [1, 1],
      ],
      board: [6, 6, 2, 3, 4],
    });
    // p1 posted its whole stack (all-in on the big blind); p0 still owes.
    let guard = 0;
    while (hand.street !== 'complete' && guard++ < 20) {
      const legal = legalActions(hand);
      hand = applyAction(hand, {
        type: legal.includes('call') ? 'call' : legal.includes('check') ? 'check' : legal[0],
      });
    }
    const m2 = settleHand(m, hand);
    expect(hand.result?.winners).toEqual([0]); // p0 four-of-a-kind wins
    expect(m2.over).toBe(true);
    expect(m2.winner).toBe(0);
    expect(m2.stacks[1]).toBe(0);
    expect(m2.stacks[0] + m2.stacks[1]).toBe(4);
  });

  it('drives a whole match to a single winner holding all the chips', () => {
    // Play a full match with a deterministic always-call/check strategy and a
    // fixed deal where p0 always wins, so the match must terminate with p0 up.
    let m = createMatch({
      startingStack: 20,
      smallBlind: 1,
      bigBlind: 2,
      escalateEveryHands: 3,
    });
    const rng = mulberry32(99);
    let hands = 0;
    while (!m.over && hands++ < 500) {
      let hand = beginHand(m, rng, {
        holes: [
          [6, 6],
          [1, 1],
        ],
        board: [6, 6, 2, 3, 4],
      });
      let guard = 0;
      while (hand.street !== 'complete' && guard++ < 30) {
        const legal = legalActions(hand);
        const pick = legal.includes('check')
          ? 'check'
          : legal.includes('call')
            ? 'call'
            : legal[0];
        hand = applyAction(hand, { type: pick });
      }
      m = settleHand(m, hand);
    }
    expect(m.over).toBe(true);
    expect(m.winner).toBe(0);
    expect(m.stacks[0]).toBe(40); // all chips (2 × 20)
    expect(m.stacks[1]).toBe(0);
  });
});

/** Play a hand where the button (SB) immediately folds; returns the final hand. */
function foldOutHand(m: ReturnType<typeof createMatch>): HandState {
  const hand = beginHand(m, mulberry32(m.handsPlayed + 1));
  return applyAction(hand, { type: 'fold' });
}
