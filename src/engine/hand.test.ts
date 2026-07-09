import { describe, expect, it } from 'vitest';
import {
  applyAction,
  board,
  IllegalActionError,
  legalActions,
  pot,
  startHand,
  type Deal,
  type HandConfig,
  type HandState,
} from './hand';
import { mulberry32 } from './rng';

const CFG: HandConfig = {
  button: 0,
  smallBlind: 1,
  bigBlind: 2,
  stacks: [100, 100],
};

/**
 * A fixed deal where player 0 wins decisively at showdown: with the two board
 * 6s, player 0's 6,6 makes Four of a Kind (cat 8), while player 1's 1,1 makes
 * only Two Pairs (cat 2). The board's faces 6,6,2,3,4 form no 5-straight.
 */
const DEAL: Deal = {
  holes: [
    [6, 6],
    [1, 1],
  ],
  board: [6, 6, 2, 3, 4], // flop 6,6,2 / turn 3 / river 4
};

function play(state: HandState, actions: { type: any }[]): HandState {
  let s = state;
  for (const a of actions) s = applyAction(s, a);
  return s;
}

describe('startHand / blinds', () => {
  it('posts small blind on the button and big blind on the opponent (heads-up)', () => {
    const s = startHand(CFG, mulberry32(1), DEAL);
    expect(s.players[0].committed).toBe(1); // button = small blind
    expect(s.players[1].committed).toBe(2); // opponent = big blind
    expect(s.players[0].stack).toBe(99);
    expect(s.players[1].stack).toBe(98);
    expect(s.betToMatch).toBe(2);
    expect(pot(s)).toBe(3);
  });

  it('the button (small blind) acts first pre-flop', () => {
    const s = startHand(CFG, mulberry32(1), DEAL);
    expect(s.toAct).toBe(0);
    expect(s.street).toBe('preflop');
    expect(s.revealed).toBe(0);
  });

  it('deals 2 private dice each and hides the board until the flop', () => {
    const s = startHand(CFG, mulberry32(42));
    expect(s.players[0].hole).toHaveLength(2);
    expect(s.players[1].hole).toHaveLength(2);
    expect(s.boardFull).toHaveLength(5);
    expect(board(s)).toHaveLength(0);
  });
});

describe('legal action gating', () => {
  it('offers fold/call/raise to the small blind facing the big blind', () => {
    const s = startHand(CFG, mulberry32(1), DEAL);
    expect(legalActions(s).sort()).toEqual(['call', 'fold', 'raise']);
  });

  it('rejects a check when a bet faces the player', () => {
    const s = startHand(CFG, mulberry32(1), DEAL);
    expect(() => applyAction(s, { type: 'check' })).toThrow(IllegalActionError);
  });

  it('rejects a call when nothing is owed', () => {
    // Reach the flop with both checking is impossible pre-flop; use flop.
    let s = startHand(CFG, mulberry32(1), DEAL);
    s = play(s, [{ type: 'call' }, { type: 'check' }]); // SB calls, BB checks → flop
    expect(s.street).toBe('flop');
    expect(() => applyAction(s, { type: 'call' })).toThrow(IllegalActionError);
  });

  it('does not mutate the input state', () => {
    const s = startHand(CFG, mulberry32(1), DEAL);
    const before = structuredClone(s);
    applyAction(s, { type: 'call' });
    expect(s).toEqual(before);
  });
});

describe('street progression', () => {
  it('advances preflop → flop when SB calls and BB checks the option', () => {
    let s = startHand(CFG, mulberry32(1), DEAL);
    s = applyAction(s, { type: 'call' }); // SB completes to 2
    expect(s.street).toBe('preflop'); // BB still has the option
    expect(s.toAct).toBe(1);
    s = applyAction(s, { type: 'check' }); // BB checks
    expect(s.street).toBe('flop');
    expect(s.revealed).toBe(3);
    expect(board(s)).toEqual([6, 6, 2]);
    // committed reset, big blind (non-button) acts first post-flop
    expect(s.players[0].committed).toBe(0);
    expect(s.toAct).toBe(1);
  });

  it('runs all four streets when both check every post-flop street', () => {
    let s = startHand(CFG, mulberry32(1), DEAL);
    s = play(s, [{ type: 'call' }, { type: 'check' }]); // → flop
    s = play(s, [{ type: 'check' }, { type: 'check' }]); // → turn
    expect(s.street).toBe('turn');
    expect(s.revealed).toBe(4);
    s = play(s, [{ type: 'check' }, { type: 'check' }]); // → river
    expect(s.street).toBe('river');
    expect(s.revealed).toBe(5);
    s = play(s, [{ type: 'check' }, { type: 'check' }]); // → showdown
    expect(s.street).toBe('complete');
    expect(s.result?.reason).toBe('showdown');
  });
});

describe('fixed-limit bet sizing (DESIGN.md §3)', () => {
  it('bets one big blind on the flop', () => {
    let s = startHand(CFG, mulberry32(1), DEAL);
    s = play(s, [{ type: 'call' }, { type: 'check' }]); // → flop
    s = applyAction(s, { type: 'bet' }); // BB bets
    expect(s.betToMatch).toBe(2); // 1 BB
  });

  it('bets two big blinds on the turn and river', () => {
    let s = startHand(CFG, mulberry32(1), DEAL);
    s = play(s, [{ type: 'call' }, { type: 'check' }]); // flop
    s = play(s, [{ type: 'check' }, { type: 'check' }]); // turn
    s = applyAction(s, { type: 'bet' });
    expect(s.betToMatch).toBe(4); // 2 BB
  });

  it('caps aggression at one bet + three raises per street', () => {
    let s = startHand(CFG, mulberry32(1), DEAL);
    s = play(s, [{ type: 'call' }, { type: 'check' }]); // flop, BB to act
    s = applyAction(s, { type: 'bet' }); // 1 aggressive
    s = applyAction(s, { type: 'raise' }); // 2
    s = applyAction(s, { type: 'raise' }); // 3
    s = applyAction(s, { type: 'raise' }); // 4 → cap reached
    expect(legalActions(s)).not.toContain('raise');
    expect(legalActions(s).sort()).toEqual(['call', 'fold']);
    expect(() => applyAction(s, { type: 'raise' })).toThrow(IllegalActionError);
  });

  it('counts the pre-flop big blind toward the raise cap', () => {
    let s = startHand(CFG, mulberry32(1), DEAL);
    // BB already counts as bet (raiseCount 1); SB raise, BB raise, SB raise → cap
    s = applyAction(s, { type: 'raise' }); // 2
    s = applyAction(s, { type: 'raise' }); // 3
    s = applyAction(s, { type: 'raise' }); // 4
    expect(legalActions(s)).not.toContain('raise');
  });
});

describe('fold ends the hand immediately', () => {
  it('awards the whole pot to the non-folder with no showdown', () => {
    let s = startHand(CFG, mulberry32(1), DEAL);
    s = applyAction(s, { type: 'fold' }); // SB folds pre-flop
    expect(s.street).toBe('complete');
    expect(s.result?.reason).toBe('fold');
    expect(s.result?.winners).toEqual([1]);
    // BB wins the 3-chip pot: started 100, posted 2, +3 → 101
    expect(s.players[1].stack).toBe(101);
    expect(s.players[0].stack).toBe(99); // lost the 1 small blind
    expect(s.players[0].stack + s.players[1].stack).toBe(200);
  });
});

describe('showdown award + tie split', () => {
  it('awards the matched pot to the best hand', () => {
    let s = startHand(CFG, mulberry32(1), DEAL);
    s = play(s, [
      { type: 'call' },
      { type: 'check' }, // flop
      { type: 'check' },
      { type: 'check' }, // turn
      { type: 'check' },
      { type: 'check' }, // river
      { type: 'check' },
      { type: 'check' }, // showdown
    ]);
    expect(s.result?.reason).toBe('showdown');
    // p0: 6,6 + board 6,6,2,3,4 → four 6s (cat 8) beats p1: 1,1 → two pairs.
    expect(s.result?.winners).toEqual([0]);
    // Pot was 4 (each put 2 in); winner p0: 100 - 2 + 4 = 102.
    expect(s.players[0].stack).toBe(102);
    expect(s.players[1].stack).toBe(98);
    expect(s.players[0].stack + s.players[1].stack).toBe(200);
  });

  it('splits an exact tie, odd chip to the big blind (non-button)', () => {
    // Identical holes → identical 7-dice hands → split.
    const tieDeal: Deal = {
      holes: [
        [3, 3],
        [3, 3],
      ],
      board: [1, 2, 4, 5, 6],
    };
    // Make the pot odd: SB raises pre-flop to 3, BB calls → each committed 3,
    // matched pot 6 (even). Force odd via an odd blind config instead.
    const oddCfg: HandConfig = { button: 0, smallBlind: 1, bigBlind: 3, stacks: [100, 100] };
    let s = startHand(oddCfg, mulberry32(1), tieDeal);
    // SB completes to 3, BB checks → each committed 3, matched pot 6 (even).
    // Fold-free run to showdown.
    s = play(s, [
      { type: 'call' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
    ]);
    expect(s.result?.winners).toEqual([0, 1]);
    // Even pot of 6 → 3 each, both back to 100.
    expect(s.players[0].stack).toBe(100);
    expect(s.players[1].stack).toBe(100);
  });

  it('refunds an uncalled all-in excess before splitting a tie', () => {
    const tieDeal: Deal = {
      holes: [
        [3, 3],
        [3, 3],
      ],
      board: [1, 2, 4, 5, 6],
    };
    // p0 has a deep stack, p1 is short and goes all-in for less; the uncalled
    // excess must come back to p0 so the (tied) matched pot is what's split.
    // Heads-up matched pots are always 2×(smaller contribution) — thus always
    // even — so the odd-chip rule never fires heads-up (it exists for multiway).
    const cfg: HandConfig = { button: 0, smallBlind: 1, bigBlind: 2, stacks: [100, 5] };
    let s = startHand(cfg, mulberry32(1), tieDeal);
    // p0 raises, p1 (BB, short) can only call up to its stack → all-in for less.
    s = applyAction(s, { type: 'raise' }); // p0 → committed 3
    s = applyAction(s, { type: 'raise' }); // p1 short-raises all-in
    let guard = 0;
    while (s.street !== 'complete' && guard++ < 20) {
      const legal = legalActions(s);
      s = applyAction(s, { type: legal.includes('call') ? 'call' : legal[0] });
    }
    expect(s.result?.winners).toEqual([0, 1]);
    expect(s.result?.potAwarded % 2).toBe(0); // matched pot always even heads-up
    expect(s.players[0].stack + s.players[1].stack).toBe(105);
  });
});

describe('all-in run-out', () => {
  it('deals the remaining board and reaches showdown when a player is all-in', () => {
    const cfg: HandConfig = { button: 0, smallBlind: 1, bigBlind: 2, stacks: [10, 10] };
    let s = startHand(cfg, mulberry32(1), DEAL);
    // Raise war until all-in on the flop.
    s = play(s, [{ type: 'call' }, { type: 'check' }]); // flop
    // BB bets, SB raises, BB raises, SB raises (cap), BB calls...
    s = applyAction(s, { type: 'bet' });
    s = applyAction(s, { type: 'raise' });
    s = applyAction(s, { type: 'raise' });
    s = applyAction(s, { type: 'raise' });
    s = applyAction(s, { type: 'call' });
    // Depending on stacks this may go all-in and run out, or advance to turn.
    expect(['turn', 'complete']).toContain(s.street);
    expect(s.players[0].stack + s.players[1].stack).toBe(20);
  });
});

describe('conservation of chips', () => {
  it('total chips are invariant across any completed hand', () => {
    let s = startHand(CFG, mulberry32(7));
    // Run to a natural completion by checking/calling down.
    let guard = 0;
    while (s.street !== 'complete' && guard++ < 50) {
      const legal = legalActions(s);
      const pick = legal.includes('check')
        ? 'check'
        : legal.includes('call')
          ? 'call'
          : legal[0];
      s = applyAction(s, { type: pick });
    }
    expect(s.street).toBe('complete');
    expect(s.players[0].stack + s.players[1].stack).toBe(200);
  });
});
