import { describe, expect, it } from 'vitest';
import {
  bustProbability,
  isBust,
  maxRollScore,
  scoreSelection,
  scoringDiceIndices,
  tripleValue,
} from './scoring';

describe('scoreSelection — the §3 scoring table', () => {
  it('scores a single 1 as 100 and a single 5 as 50', () => {
    expect(scoreSelection([1])).toBe(100);
    expect(scoreSelection([5])).toBe(50);
  });

  it('scores three of a kind as face × 100', () => {
    expect(scoreSelection([2, 2, 2])).toBe(200);
    expect(scoreSelection([3, 3, 3])).toBe(300);
    expect(scoreSelection([4, 4, 4])).toBe(400);
    expect(scoreSelection([6, 6, 6])).toBe(600);
    expect(scoreSelection([5, 5, 5])).toBe(500);
  });

  it('scores three 1s as the 1,000 special case, not 100', () => {
    expect(scoreSelection([1, 1, 1])).toBe(1000);
    expect(tripleValue(1)).toBe(1000);
  });

  it('scores multiple disjoint combinations in one selection', () => {
    expect(scoreSelection([1, 1, 1, 5, 5])).toBe(1100);
    expect(scoreSelection([2, 2, 2, 5, 5, 5])).toBe(700);
    expect(scoreSelection([1, 5])).toBe(150);
  });

  describe('four or more of a kind is one triple plus 1/5 leftovers, never a bonus', () => {
    it('5-5-5-5 = 500 triple + 50 single', () => {
      expect(scoreSelection([5, 5, 5, 5])).toBe(550);
    });
    it('1×4 = 1,100; 1×5 = 1,200; 1×6 = 1,300', () => {
      expect(scoreSelection([1, 1, 1, 1])).toBe(1100);
      expect(scoreSelection([1, 1, 1, 1, 1])).toBe(1200);
      expect(scoreSelection([1, 1, 1, 1, 1, 1])).toBe(1300);
    });
    it('rejects 4+ of a non-1/5 face: the leftovers score 0 and cannot be set aside', () => {
      expect(scoreSelection([2, 2, 2, 2])).toBeNull();
      expect(scoreSelection([6, 6, 6, 6, 6, 6])).toBeNull();
    });
  });

  describe('set-aside legality', () => {
    it('rejects an empty selection', () => {
      expect(scoreSelection([])).toBeNull();
    });
    it('rejects any selection containing a non-scoring die', () => {
      expect(scoreSelection([2])).toBeNull();
      expect(scoreSelection([1, 2])).toBeNull();
      expect(scoreSelection([3, 3])).toBeNull(); // a lone pair is never legal
      expect(scoreSelection([1, 1, 1, 4])).toBeNull();
    });
    it('rejects invalid faces outright', () => {
      expect(() => scoreSelection([0])).toThrow(RangeError);
      expect(() => scoreSelection([7])).toThrow(RangeError);
    });
  });
});

describe('maxRollScore / isBust — bust detection (§3 examples)', () => {
  it('2-3-4-6-6-2 on six dice is a bust', () => {
    expect(isBust([2, 3, 4, 6, 6, 2])).toBe(true);
    expect(maxRollScore([2, 3, 4, 6, 6, 2])).toBe(0);
  });
  it('3-4 on two remaining dice is a bust', () => {
    expect(isBust([3, 4])).toBe(true);
  });
  it('2-2-2 on three remaining dice is NOT a bust (triple = 200)', () => {
    expect(isBust([2, 2, 2])).toBe(false);
    expect(maxRollScore([2, 2, 2])).toBe(200);
  });
  it('values a full mixed roll greedily', () => {
    expect(maxRollScore([1, 5, 3, 3, 2, 6])).toBe(150);
    expect(maxRollScore([1, 1, 1, 5, 5, 2])).toBe(1100);
    expect(maxRollScore([2, 2, 2, 2, 5, 1])).toBe(350); // triple 200 + 50 + 100; 4th 2 worth 0
    expect(maxRollScore([2, 2, 2, 2, 2, 2])).toBe(200); // one triple only, no bonus
  });
});

describe('scoringDiceIndices — which dice may be set aside', () => {
  it('returns all 1s and 5s', () => {
    expect(scoringDiceIndices([1, 5, 3, 3, 2, 6])).toEqual([0, 1]);
  });
  it('returns exactly three dice of a 4+-of-a-kind non-1/5 face', () => {
    expect(scoringDiceIndices([2, 2, 2, 2, 5, 1])).toEqual([0, 1, 2, 4, 5]);
    expect(scoringDiceIndices([6, 6, 6, 6, 6, 6])).toEqual([0, 1, 2]);
  });
  it('returns nothing for a bust roll', () => {
    expect(scoringDiceIndices([2, 3, 4, 6, 6, 2])).toEqual([]);
  });
  it('never truncates 1s and 5s (their leftovers still score as singles)', () => {
    expect(scoringDiceIndices([5, 5, 5, 5, 5, 5])).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('bustProbability — risk shown at the bank-or-roll prompt (§7)', () => {
  it('matches exact enumeration for the anchor cases', () => {
    // 1 die: busts on 2,3,4,6 → 4/6.
    expect(bustProbability(1)).toBeCloseTo(4 / 6, 10);
    // 2 dice: no triples possible, so bust = both non-1/5 → (4/6)^2 = 16/36.
    expect(bustProbability(2)).toBeCloseTo(16 / 36, 10);
    // 3 dice: all four faces from {2,3,4,6} (64) minus the 4 triples, over 216.
    expect(bustProbability(3)).toBeCloseTo(60 / 216, 10);
  });

  it('strictly decreases as more dice are in hand (more dice, safer roll)', () => {
    for (let n = 2; n <= 6; n++) {
      expect(bustProbability(n)).toBeLessThan(bustProbability(n - 1));
    }
  });

  it('agrees with isBust over a full enumeration for 4 dice', () => {
    let busts = 0;
    for (let a = 1; a <= 6; a++)
      for (let b = 1; b <= 6; b++)
        for (let c = 1; c <= 6; c++)
          for (let d = 1; d <= 6; d++) if (isBust([a, b, c, d])) busts++;
    expect(bustProbability(4)).toBeCloseTo(busts / 6 ** 4, 10);
  });

  it('returns 0 for out-of-range dice counts', () => {
    expect(bustProbability(0)).toBe(0);
    expect(bustProbability(7)).toBe(0);
  });
});
