import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../engine/rng';
import { AI, HUMAN, TableGame, type Delay } from './table';

/** No real waiting in tests: AI pauses resolve immediately. */
const instant: Delay = () => Promise.resolve();

function newGame(seed: number): TableGame {
  return new TableGame({ rng: mulberry32(seed), delay: instant, aiPauseMs: 0 });
}

/**
 * Total chips in play. Mid-hand the blinds/bets sit in the pot (not in stacks),
 * so add the pot; once the hand completes the pot has been paid back into the
 * stacks. Either way this must always equal the starting 200.
 */
const chips = (g: TableGame): number => {
  const { hand } = g.state;
  const stacks = hand.players[0].stack + hand.players[1].stack;
  return hand.street === 'complete' ? stacks : stacks + g.pot();
};

describe('TableGame setup', () => {
  it('deals a first hand with the human on the button and to act', () => {
    const g = newGame(1);
    expect(g.state.match.handsPlayed).toBe(0);
    expect(g.state.hand.button).toBe(HUMAN);
    expect(g.state.hand.toAct).toBe(HUMAN);
    expect(g.state.hand.players[HUMAN].hole).toHaveLength(2);
    // Blinds are already posted: SB(1) + BB(2) = 3 in the pot.
    expect(g.pot()).toBe(3);
  });

  it('hides the AI hole dice until a showdown', () => {
    const g = newGame(1);
    expect(g.state.revealAi).toBe(false);
  });

  it('exposes only legal actions for the human, and none on the AI turn', async () => {
    const g = newGame(1);
    // Pre-flop the human (SB) faces the big blind: can fold/call/raise, not check.
    const actions = g.humanActions();
    expect(actions).toContain('call');
    expect(actions).not.toContain('check');
    // Folding hands the turn to nobody (hand completes).
    await g.act('fold');
    expect(g.humanActions()).toEqual([]);
  });
});

describe('action wiring', () => {
  it('ignores an illegal action click', async () => {
    const g = newGame(1);
    const before = g.pot();
    await g.act('check'); // illegal pre-flop for the SB facing a bet
    expect(g.pot()).toBe(before);
    expect(g.state.hand.toAct).toBe(HUMAN); // still the human's turn
  });

  it('fold awards the pot to the AI and completes the hand', async () => {
    const g = newGame(1);
    await g.act('fold');
    expect(g.state.hand.street).toBe('complete');
    expect(g.state.hand.result?.reason).toBe('fold');
    expect(g.state.hand.result?.winners).toEqual([AI]);
    expect(chips(g)).toBe(200); // chips conserved
    expect(g.state.revealAi).toBe(false); // no reveal on a fold
  });

  it('drives the AI to respond after a human action', async () => {
    const g = newGame(4);
    await g.act('call'); // SB completes; AI (BB) now acts or the street advances
    // After a human action, control never stays parked on the AI: the AI has
    // already responded, so it is the human's turn again or the hand is done.
    const h = g.state.hand;
    const stuckOnAi = h.street !== 'complete' && h.toAct === AI;
    expect(stuckOnAi).toBe(false);
    expect(chips(g)).toBe(200);
  });
});

describe('a full hand and match', () => {
  it('plays a hand to completion and awards the pot (reveals on showdown)', async () => {
    // Try seeds until we hit a showdown (some seeds fold early); assert wiring.
    for (let seed = 1; seed <= 40; seed++) {
      const g = newGame(seed);
      let guard = 0;
      while (g.state.hand.street !== 'complete' && guard < 40) {
        guard++;
        const legal = g.humanActions();
        if (legal.length === 0) break;
        const pick = legal.includes('check') ? 'check' : legal.includes('call') ? 'call' : legal[0];
        await g.act(pick);
      }
      expect(chips(g)).toBe(200);
      const result = g.state.hand.result;
      expect(result).toBeDefined();
      if (result?.reason === 'showdown') {
        expect(g.state.revealAi).toBe(true);
        expect(result.handValues).toHaveLength(2);
        expect(result.potAwarded).toBeGreaterThan(0);
        return; // wiring proven end-to-end through a showdown
      }
    }
    throw new Error('expected at least one showdown across seeds');
  });

  it('advances to the next hand and can run a match to a winner', async () => {
    const g = newGame(2025);
    let guard = 0;
    while (!g.state.match.over && guard < 4000) {
      guard++;
      if (g.state.hand.street === 'complete') {
        await g.nextHand();
        continue;
      }
      const legal = g.humanActions();
      if (legal.length === 0) break;
      const pick = legal.includes('call') ? 'call' : legal.includes('check') ? 'check' : legal[0];
      await g.act(pick);
    }
    expect(g.state.match.over).toBe(true);
    expect([HUMAN, AI]).toContain(g.state.match.winner);
    // The loser is busted; the winner holds every chip.
    const loser = g.state.match.winner === HUMAN ? AI : HUMAN;
    expect(g.state.match.stacks[loser]).toBeLessThanOrEqual(0);
  });

  it('restart deals a fresh match', () => {
    const g = newGame(7);
    g.restart();
    expect(g.state.match.handsPlayed).toBe(0);
    expect(g.state.match.over).toBe(false);
    expect(chips(g)).toBe(200);
  });
});
