import { describe, expect, it } from 'vitest';
import { bank, isHotDice, newGame, roll, setAside, type GameState } from './game';
import { riggedRng } from './test-helpers';

/** Roll specific faces for the current player's dice in hand. */
function rollFaces(state: GameState, faces: number[]): GameState {
  expect(faces).toHaveLength(state.diceInHand);
  return roll(state, riggedRng(faces));
}

describe('turn loop (§2)', () => {
  it('starts with player 0, six dice, empty totals', () => {
    const g = newGame();
    expect(g.current).toBe(0);
    expect(g.phase).toBe('roll');
    expect(g.diceInHand).toBe(6);
    expect(g.banked).toEqual([0, 0]);
  });

  it('busting on the first roll ends the turn with nothing', () => {
    const g = rollFaces(newGame(), [2, 3, 4, 6, 6, 2]);
    expect(g.current).toBe(1);
    expect(g.phase).toBe('roll');
    expect(g.banked).toEqual([0, 0]);
    expect(g.turnTotal).toBe(0);
    expect(g.lastTurnBusted).toBe(true);
    expect(g.bustRoll).toEqual([2, 3, 4, 6, 6, 2]);
  });

  it('busting on a later roll wipes the accumulated turn total', () => {
    let g = rollFaces(newGame(), [1, 5, 3, 3, 2, 6]);
    g = setAside(g, [0, 1]); // 1 + 5 = 150
    expect(g.turnTotal).toBe(150);
    expect(g.diceInHand).toBe(4);
    g = rollFaces(g, [3, 4, 2, 6]); // bust
    expect(g.current).toBe(1);
    expect(g.turnTotal).toBe(0);
    expect(g.banked).toEqual([0, 0]);
    expect(g.lastTurnBusted).toBe(true);
  });

  it('setting aside adds points, locks dice, and moves to the bank-or-roll decision', () => {
    let g = rollFaces(newGame(), [1, 5, 3, 3, 2, 6]);
    g = setAside(g, [0]); // keep only the 1, reroll five (§3 example)
    expect(g.turnTotal).toBe(100);
    expect(g.diceInHand).toBe(5);
    expect(g.phase).toBe('decide');
    expect(g.rolled).toEqual([]);
  });

  it('banking adds the turn total to the banked score and passes the turn', () => {
    let g = rollFaces(newGame(), [1, 5, 3, 3, 2, 6]);
    g = setAside(g, [0, 1]);
    g = bank(g);
    expect(g.banked).toEqual([150, 0]);
    expect(g.current).toBe(1);
    expect(g.phase).toBe('roll');
    expect(g.turnTotal).toBe(0);
    expect(g.lastTurnBusted).toBe(false);
  });

  it('turns alternate between the two players', () => {
    let g = rollFaces(newGame(), [1, 2, 3, 4, 6, 6]);
    g = bank(setAside(g, [0]));
    expect(g.current).toBe(1);
    g = rollFaces(g, [5, 2, 3, 4, 6, 6]);
    g = bank(setAside(g, [0]));
    expect(g.current).toBe(0);
    expect(g.banked).toEqual([100, 50]);
  });
});

describe('set-aside legality (§3)', () => {
  const rolled = () => rollFaces(newGame(), [1, 5, 3, 3, 2, 6]);

  it('rejects an empty set-aside', () => {
    expect(() => setAside(rolled(), [])).toThrow(/illegal set-aside/);
  });
  it('rejects non-scoring dice — a pair can never be completed across rolls', () => {
    expect(() => setAside(rolled(), [2])).toThrow(/illegal set-aside/); // a lone 3
    expect(() => setAside(rolled(), [2, 3])).toThrow(/illegal set-aside/); // the pair of 3s
    expect(() => setAside(rolled(), [0, 4])).toThrow(/illegal set-aside/); // 1 plus a junk 2
  });
  it('rejects out-of-range and duplicate indices', () => {
    expect(() => setAside(rolled(), [6])).toThrow(RangeError);
    expect(() => setAside(rolled(), [-1])).toThrow(RangeError);
    expect(() => setAside(rolled(), [0, 0])).toThrow(/duplicate/);
  });
  it('rejects the fourth die of a non-1/5 four-of-a-kind but allows the triple', () => {
    const g = rollFaces(newGame(), [2, 2, 2, 2, 1, 5]);
    expect(() => setAside(g, [0, 1, 2, 3])).toThrow(/illegal set-aside/);
    const kept = setAside(g, [0, 1, 2]);
    expect(kept.turnTotal).toBe(200);
    expect(kept.diceInHand).toBe(3);
  });
  it('allows partial set-asides to keep more dice in hand', () => {
    const g = setAside(rolled(), [1]); // keep only the 5
    expect(g.turnTotal).toBe(50);
    expect(g.diceInHand).toBe(5);
  });
  it('only allows actions matching the phase', () => {
    const g = newGame();
    expect(() => setAside(g, [0])).toThrow(/phase/);
    expect(() => bank(g)).toThrow(/phase/);
    const afterRoll = rollFaces(g, [1, 5, 3, 3, 2, 6]);
    expect(() => roll(afterRoll)).toThrow(/phase/);
    expect(() => bank(afterRoll)).toThrow(/phase/);
  });
});

describe('hot dice (§2 step 5)', () => {
  it('setting aside all six dice returns all six with the turn total intact', () => {
    let g = rollFaces(newGame(), [1, 1, 1, 5, 5, 5]);
    g = setAside(g, [0, 1, 2, 3, 4, 5]);
    expect(g.turnTotal).toBe(1500);
    expect(g.diceInHand).toBe(6);
    expect(isHotDice(g)).toBe(true);
  });

  it('hot dice chain across 2+ rolls, still one accumulating turn', () => {
    let g = rollFaces(newGame(), [1, 1, 1, 5, 5, 5]);
    g = setAside(g, [0, 1, 2, 3, 4, 5]); // 1500
    g = rollFaces(g, [2, 2, 2, 1, 5, 5]);
    g = setAside(g, [0, 1, 2, 3, 4, 5]); // + 200 + 100 + 100 = 1900
    expect(g.turnTotal).toBe(1900);
    expect(isHotDice(g)).toBe(true);
    expect(g.current).toBe(0); // same turn throughout
  });

  it('a normal decide state is not hot dice', () => {
    const g = setAside(rollFaces(newGame(), [1, 5, 3, 3, 2, 6]), [0]);
    expect(isHotDice(g)).toBe(false);
  });
});

describe('winning (§4)', () => {
  // Small targets keep the scripts short; the target is a newGame option.
  it('banking exactly the target triggers the endgame (exact-score win)', () => {
    let g = newGame({ target: 100 });
    g = bank(setAside(rollFaces(g, [1, 2, 3, 4, 6, 6]), [0])); // p0 banks exactly 100
    expect(g.endgameTriggeredBy).toBe(0);
    expect(g.winner).toBeNull(); // opponent still gets a final turn
    expect(g.current).toBe(1);
    g = rollFaces(g, [2, 3, 4, 6, 6, 2]); // p1 busts the final turn
    expect(g.phase).toBe('gameOver');
    expect(g.winner).toBe(0);
  });

  it('the opponent can win by beating the score on their final turn', () => {
    let g = newGame({ target: 100 });
    g = bank(setAside(rollFaces(g, [1, 2, 3, 4, 6, 6]), [0])); // p0: 100
    g = bank(setAside(rollFaces(g, [1, 1, 3, 3, 2, 6]), [0, 1])); // p1 banks 200
    expect(g.phase).toBe('gameOver');
    expect(g.winner).toBe(1);
    expect(g.banked).toEqual([100, 200]);
  });

  it('busting with the target already in hand does not win — points must be banked', () => {
    let g = newGame(); // target 2000
    g = setAside(rollFaces(g, [1, 1, 1, 5, 5, 5]), [0, 1, 2, 3, 4, 5]); // 1500
    g = setAside(rollFaces(g, [1, 1, 1, 2, 2, 2]), [0, 1, 2, 3, 4, 5]); // 2700 in hand
    expect(g.turnTotal).toBe(2700);
    g = rollFaces(g, [2, 3, 4, 6, 6, 2]); // bust
    expect(g.endgameTriggeredBy).toBeNull();
    expect(g.winner).toBeNull();
    expect(g.banked).toEqual([0, 0]);
    expect(g.current).toBe(1);
  });

  it('an exact tie after the final turn forces extra full turns until it breaks', () => {
    let g = newGame({ target: 100 });
    g = bank(setAside(rollFaces(g, [1, 2, 3, 4, 6, 6]), [0])); // p0: 100, endgame on
    g = bank(setAside(rollFaces(g, [1, 2, 3, 4, 6, 6]), [0])); // p1 final turn: 100 — tie
    expect(g.winner).toBeNull();
    expect(g.phase).toBe('roll');
    expect(g.current).toBe(0); // tie-break round, normal order

    g = rollFaces(g, [2, 3, 4, 6, 6, 2]); // p0 busts the tie-break turn
    expect(g.winner).toBeNull();
    expect(g.current).toBe(1);
    g = rollFaces(g, [2, 3, 4, 6, 6, 2]); // p1 busts too — still tied
    expect(g.winner).toBeNull();
    expect(g.current).toBe(0); // another tie-break round

    g = bank(setAside(rollFaces(g, [5, 2, 3, 4, 6, 6]), [0])); // p0: 150
    g = rollFaces(g, [2, 3, 4, 6, 6, 2]); // p1 busts
    expect(g.phase).toBe('gameOver');
    expect(g.winner).toBe(0);
    expect(g.banked).toEqual([150, 100]);
  });

  it('a bank during the endgame never grants additional final turns', () => {
    let g = newGame({ target: 100 });
    g = bank(setAside(rollFaces(g, [1, 2, 3, 4, 6, 6]), [0])); // p0 triggers
    g = bank(setAside(rollFaces(g, [1, 1, 3, 3, 2, 6]), [0, 1])); // p1 banks 200 > 100
    // p1 crossed the target too, but the game ends — no second endgame.
    expect(g.phase).toBe('gameOver');
    expect(g.winner).toBe(1);
  });
});

describe('newGame validation', () => {
  it('rejects bad player counts and targets', () => {
    expect(() => newGame({ players: 1 })).toThrow(RangeError);
    expect(() => newGame({ players: 2.5 })).toThrow(RangeError);
    expect(() => newGame({ target: 0 })).toThrow(RangeError);
    expect(() => newGame({ target: -100 })).toThrow(RangeError);
  });
});
