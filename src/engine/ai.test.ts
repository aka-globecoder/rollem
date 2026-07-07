import { describe, expect, it } from 'vitest';
import { aiChooseSetAside, aiDecide } from './ai';
import { newGame, roll, setAside, type GameState } from './game';
import { riggedRng } from './test-helpers';

/** A mid-decision state with the given scores; AI is the current player. */
function decideState(over: Partial<GameState>): GameState {
  return { ...newGame(), phase: 'decide', ...over };
}

describe('aiChooseSetAside — greedy §5 set-aside policy', () => {
  it('keeps every scoring die in the roll', () => {
    expect(aiChooseSetAside([1, 5, 3, 3, 2, 6])).toEqual([0, 1]);
    expect(aiChooseSetAside([2, 2, 2, 2, 5, 1])).toEqual([0, 1, 2, 4, 5]);
    expect(aiChooseSetAside([1, 1, 1, 5, 5, 5])).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeps everything even when that leaves 1–2 dice in hand', () => {
    expect(aiChooseSetAside([1, 5, 5, 2, 3, 4])).toEqual([0, 1, 2]); // 3 dice left
    expect(aiChooseSetAside([1, 1, 5, 5, 5, 3])).toEqual([0, 1, 2, 3, 4]); // 1 die left
  });

  it('produces a selection the engine accepts', () => {
    const g = roll(newGame(), riggedRng([2, 2, 2, 2, 5, 1]));
    const after = setAside(g, aiChooseSetAside(g.rolled));
    expect(after.turnTotal).toBe(350);
  });
});

describe('aiDecide — §5 bank-or-roll branches, in order', () => {
  it('final turn (checked first): rolls until it beats the best opponent, then banks', () => {
    const finalTurn = (turnTotal: number) =>
      decideState({ banked: [2000, 1500], current: 1, endgameTriggeredBy: 0, turnTotal, diceInHand: 3 });
    expect(aiDecide(finalTurn(300))).toBe('roll'); // 1800 ≤ 2000
    expect(aiDecide(finalTurn(500))).toBe('roll'); // exactly 2000: a tie is not a win
    expect(aiDecide(finalTurn(600))).toBe('bank'); // 2100 > 2000
  });

  it('final turn overrides the reach-the-target rule: reaching 2,000 below the leader keeps rolling', () => {
    const s = decideState({ banked: [2100, 1900], current: 1, endgameTriggeredBy: 0, turnTotal: 150, diceInHand: 4 });
    expect(aiDecide(s)).toBe('roll'); // 2050 ≥ target but banking would lose on the spot
  });

  it('banks as soon as banked + turnTotal reaches the target (wins or forces the endgame)', () => {
    expect(aiDecide(decideState({ banked: [0, 1800], current: 1, turnTotal: 250, diceInHand: 3 }))).toBe('bank');
    expect(aiDecide(decideState({ banked: [0, 1800], current: 1, turnTotal: 200, diceInHand: 3 }))).toBe('bank'); // exactly 2,000
    expect(aiDecide(decideState({ banked: [0, 1800], current: 1, turnTotal: 150, diceInHand: 3 }))).toBe('roll');
  });

  it('always rolls hot dice', () => {
    const s = decideState({ banked: [0, 0], turnTotal: 400, diceInHand: 6 });
    expect(aiDecide(s)).toBe('roll'); // despite turnTotal ≥ 300
  });

  it('banks at turn total ≥ 300', () => {
    expect(aiDecide(decideState({ turnTotal: 300, diceInHand: 3 }))).toBe('bank');
    expect(aiDecide(decideState({ turnTotal: 250, diceInHand: 3 }))).toBe('roll');
  });

  it('banks at ≥ 150 when fewer than 3 dice remain', () => {
    expect(aiDecide(decideState({ turnTotal: 150, diceInHand: 2 }))).toBe('bank');
    expect(aiDecide(decideState({ turnTotal: 150, diceInHand: 3 }))).toBe('roll');
    expect(aiDecide(decideState({ turnTotal: 100, diceInHand: 2 }))).toBe('roll');
  });

  it('is deterministic for identical states', () => {
    const s = decideState({ turnTotal: 250, diceInHand: 4 });
    expect(aiDecide(s)).toBe(aiDecide({ ...s }));
  });
});
