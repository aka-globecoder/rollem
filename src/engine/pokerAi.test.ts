import { describe, it, expect } from 'vitest';
import { chooseAction, handEquity, BALANCED, TIGHT, LOOSE } from './pokerAi';
import {
  legalActions,
  applyAction,
  startHand,
  type HandState,
  type PlayerState,
  type Street,
} from './hand';
import { mulberry32 } from './rng';

// --- equity ---------------------------------------------------------------

describe('handEquity', () => {
  it('rates the effective nuts near 1 (only a mirror hole ties)', () => {
    // Six 4s locked in (board 4,4,4,4,6 + hole 4,4): only an opp 4,4 ties -> 35.5/36.
    expect(handEquity([4, 4], [4, 4, 4, 4, 6])).toBeCloseTo(35.5 / 36, 6);
  });

  it('rates a dominated hand near 0', () => {
    // Weakest full house on a paired board: almost every opponent hole beats it.
    expect(handEquity([1, 3], [5, 5, 5, 2, 2])).toBeLessThan(0.1);
  });

  it('rewards a stronger hole on the same board', () => {
    const strong = handEquity([6, 6], [1, 2, 3, 6, 6]); // quad sixes
    const weak = handEquity([1, 4], [1, 2, 3, 6, 6]);
    expect(strong).toBeGreaterThan(weak);
  });

  it('is exact and deterministic (no RNG dependence)', () => {
    expect(handEquity([6, 6], [6, 1, 2])).toBe(handEquity([6, 6], [6, 1, 2]));
  });

  it('validates dice counts', () => {
    expect(() => handEquity([4], [])).toThrow(/2 dice/);
    expect(() => handEquity([4, 4], [1, 2, 3, 4, 5, 6])).toThrow(/at most 5/);
  });
});

// --- a HandState fixture for precise policy spots -------------------------

const STREET_AT: Record<number, Street> = {
  0: 'preflop',
  3: 'flop',
  4: 'turn',
  5: 'river',
};

/** Build a live HandState for the seat to act, controlling the betting spot. */
function spot(o: {
  hole: number[];
  board: number[];
  toAct?: 0 | 1;
  button?: 0 | 1;
  betToMatch?: number;
  myCommitted?: number;
  myTotal?: number;
  oppTotal?: number;
  raiseCount?: number;
  stack?: number;
}): HandState {
  const toAct = o.toAct ?? 0;
  const opp: 0 | 1 = toAct === 0 ? 1 : 0;
  const revealed = o.board.length;
  const boardFull = [...o.board];
  while (boardFull.length < 5) boardFull.push(1); // padding past `revealed` is ignored
  const stack = o.stack ?? 100;

  const mk = (hole: number[], committed: number, total: number): PlayerState => ({
    hole: [...hole],
    stack,
    committed,
    totalCommitted: total,
    hasActed: false,
    folded: false,
    allIn: false,
  });

  const myCommitted = o.myCommitted ?? 0;
  const players: [PlayerState, PlayerState] = [null as never, null as never];
  players[toAct] = mk(o.hole, myCommitted, o.myTotal ?? myCommitted);
  players[opp] = mk([1, 1], o.betToMatch ?? 0, o.oppTotal ?? (o.betToMatch ?? 0));

  return {
    street: STREET_AT[revealed],
    boardFull,
    revealed,
    players,
    button: o.button ?? 0,
    smallBlind: 1,
    bigBlind: 2,
    toAct,
    betToMatch: o.betToMatch ?? 0,
    raiseCount: o.raiseCount ?? 0,
  };
}

// Known-equity fixtures (see the equity tests / probe): nuts ≈ 0.986,
// trash ≈ 0.028, medium ≈ 0.609, marginal ≈ 0.330.
const NUTS = { hole: [4, 4], board: [4, 4, 4, 4, 6] };
const TRASH = { hole: [1, 3], board: [5, 5, 5, 2, 2] };
const MEDIUM = { hole: [6, 6], board: [6, 1, 2] };
const MARGINAL = { hole: [1, 2], board: [6, 6, 3] };

// --- policy: the three ROL-9 sanity criteria -----------------------------

describe('chooseAction — folds trash', () => {
  it('folds a dominated hand facing a bet at meaningful pot odds', () => {
    const d = chooseAction(
      spot({ ...TRASH, betToMatch: 10, myTotal: 10, oppTotal: 20, raiseCount: 1 }),
    );
    expect(d.action.type).toBe('fold');
    expect(d.equity).toBeLessThan(d.potOdds); // −EV to continue
  });
});

describe('chooseAction — value-bets / raises the nuts', () => {
  it('value-bets the nuts when checked to', () => {
    const d = chooseAction(spot({ ...NUTS, betToMatch: 0, raiseCount: 0 }));
    expect(d.action.type).toBe('bet');
  });

  it('raises the nuts when facing a bet with raises left', () => {
    const d = chooseAction(spot({ ...NUTS, betToMatch: 2, raiseCount: 1 }));
    expect(d.action.type).toBe('raise');
  });

  it('calls (legal fallback) the nuts once the raise cap is hit', () => {
    const d = chooseAction(spot({ ...NUTS, betToMatch: 2, raiseCount: 4 }));
    expect(legalActions(spot({ ...NUTS, betToMatch: 2, raiseCount: 4 }))).not.toContain('raise');
    expect(d.action.type).toBe('call');
  });
});

describe('chooseAction — defends +EV calls', () => {
  it('calls a strong-but-not-raise hand at cheap pot odds', () => {
    // p ≈ 0.609: above the fold line, below the 0.65 raise threshold -> call.
    const d = chooseAction(
      spot({ ...MEDIUM, betToMatch: 2, myTotal: 10, oppTotal: 10, raiseCount: 1 }),
    );
    expect(d.action.type).toBe('call');
    expect(d.equity).toBeGreaterThan(d.potOdds);
  });
});

// --- policy: bluffing, determinism, position, difficulty -----------------

describe('chooseAction — bluffing (deterministic under injected RNG)', () => {
  it('bluff-bets a marginal hand when the RNG rolls under the bluff frequency', () => {
    const d = chooseAction(spot({ ...MARGINAL, betToMatch: 0, raiseCount: 0 }), () => 0.0);
    expect(d.action.type).toBe('bet');
  });

  it('checks the same hand when the RNG rolls above the bluff frequency', () => {
    const d = chooseAction(spot({ ...MARGINAL, betToMatch: 0, raiseCount: 0 }), () => 0.99);
    expect(d.action.type).toBe('check');
  });

  it('is fully reproducible under a seeded RNG', () => {
    const s = startHand({ button: 0, smallBlind: 1, bigBlind: 2, stacks: [100, 100] }, mulberry32(77));
    const a = chooseAction(s, mulberry32(5));
    const b = chooseAction(s, mulberry32(5));
    expect(a.action.type).toBe(b.action.type);
    expect(a.equity).toBe(b.equity);
  });
});

describe('chooseAction — position (§8.4)', () => {
  // Marginal p ≈ 0.330 facing pot odds 0.40 (toCall 4 into a 6 pot).
  const base = { ...MARGINAL, betToMatch: 4, myTotal: 2, oppTotal: 4, raiseCount: 1 };

  it('the big blind defends wider than the button folds', () => {
    // Button (button === seat): margin 0.00 -> fold line 0.40 -> 0.330 folds.
    expect(chooseAction(spot({ ...base, toAct: 0, button: 0 })).action.type).toBe('fold');
    // Big blind (button === other seat): margin 0.10 -> fold line 0.30 -> 0.330 calls.
    expect(chooseAction(spot({ ...base, toAct: 0, button: 1 })).action.type).toBe('call');
  });
});

describe('chooseAction — difficulty knobs (Milestone 2 stubs)', () => {
  it('tight never bluffs even with a bluff-favourable RNG', () => {
    const d = chooseAction(spot({ ...MARGINAL, betToMatch: 0, raiseCount: 0 }), () => 0.0, TIGHT);
    expect(d.action.type).toBe('check');
  });

  it('tight needs a bigger edge to raise than balanced', () => {
    expect(TIGHT.raise).toBeGreaterThan(BALANCED.raise);
  });

  it('loose value-bets thinner and bluffs more than balanced', () => {
    expect(LOOSE.valueBet).toBeLessThan(BALANCED.valueBet);
    expect(LOOSE.bluffFreq).toBeGreaterThan(BALANCED.bluffFreq);
  });
});

// --- integration: always returns a legal action --------------------------

describe('chooseAction — integration with hand.ts', () => {
  it('always returns a legal action across a full self-play hand', () => {
    const rng = mulberry32(2025);
    let s = startHand({ button: 0, smallBlind: 1, bigBlind: 2, stacks: [100, 100] }, rng);
    for (let i = 0; i < 100 && s.street !== 'complete'; i++) {
      const d = chooseAction(s, rng);
      expect(legalActions(s)).toContain(d.action.type);
      s = applyAction(s, d.action);
    }
    expect(s.street).toBe('complete');
  });
});
