import { describe, expect, it } from 'vitest';
import { rollDice, rollDie } from './dice';

describe('rollDie', () => {
  it('maps the rng range onto faces 1 through 6', () => {
    expect(rollDie(() => 0)).toBe(1);
    expect(rollDie(() => 0.999999)).toBe(6);
    expect(rollDie(() => 0.5)).toBe(4);
  });

  it('only ever returns integer faces 1-6 with a real rng', () => {
    for (let i = 0; i < 1000; i++) {
      const face = rollDie();
      expect(face).toBeGreaterThanOrEqual(1);
      expect(face).toBeLessThanOrEqual(6);
      expect(Number.isInteger(face)).toBe(true);
    }
  });
});

describe('rollDice', () => {
  it('returns the requested number of dice', () => {
    expect(rollDice(5)).toHaveLength(5);
    expect(rollDice(0)).toEqual([]);
  });

  it('uses the injected rng deterministically', () => {
    const values = [0, 0.2, 0.4, 0.6, 0.8];
    let i = 0;
    const rng = () => values[i++ % values.length];
    expect(rollDice(5, rng)).toEqual([1, 2, 3, 4, 5]);
  });

  it('rejects invalid counts', () => {
    expect(() => rollDice(-1)).toThrow(RangeError);
    expect(() => rollDice(2.5)).toThrow(RangeError);
  });
});
