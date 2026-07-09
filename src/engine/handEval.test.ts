import { describe, it, expect } from 'vitest';
import { HandCategory, evaluateHand, compareDice } from './handEval';

const cat = (dice: number[]) => evaluateHand(dice).category;

describe('evaluateHand — category classification', () => {
  it('classifies each shape by its defining example', () => {
    expect(cat([3, 3, 3, 5, 5, 1, 2])).toBe(HandCategory.FullHouse); // 3+2
    expect(cat([6, 6, 4, 4, 1, 2, 3])).toBe(HandCategory.TwoPairs); // 2+2, faces {1,2,3,4,6} = no 5-run
    expect(cat([2, 2, 4, 4, 6, 6, 1])).toBe(HandCategory.ThreePairs); // 2+2+2
    expect(cat([1, 2, 3, 4, 5, 5, 5])).toBe(HandCategory.Trips); // trips outrank the 5-run they contain
    expect(cat([3, 3, 3, 5, 5, 6, 6])).toBe(HandCategory.BigFull); // 3+2+2
    expect(cat([4, 4, 4, 4, 1, 2, 6])).toBe(HandCategory.FourOfAKind); // 4+singles
    expect(cat([4, 4, 4, 4, 2, 2, 6])).toBe(HandCategory.FourPlusPair); // 4+2
    expect(cat([3, 3, 3, 5, 5, 5, 1])).toBe(HandCategory.DoubleTrips); // 3+3
    expect(cat([5, 5, 5, 5, 5, 1, 2])).toBe(HandCategory.FiveOfAKind); // 5+2
    expect(cat([4, 4, 4, 4, 6, 6, 6])).toBe(HandCategory.FourPlusTrips); // 4+3
    expect(cat([5, 5, 5, 5, 5, 2, 2])).toBe(HandCategory.FivePlusPair); // 5+2
    expect(cat([6, 6, 6, 6, 6, 6, 1])).toBe(HandCategory.SixOfAKind); // 6+1
    expect(cat([4, 4, 4, 4, 4, 4, 4])).toBe(HandCategory.SevenOfAKind); // 7
  });

  it('scores straights by presence, longest run wins', () => {
    // 2-3-4-5-6 present, doubled 6 -> two pair? no, pattern is 2,2,1,1,1? -> [6,6,2,3,4,5,?]
    expect(cat([2, 3, 4, 5, 6, 6, 2])).toBe(HandCategory.FiveStraight); // 2..6 run, two pairs demoted
    expect(cat([1, 2, 3, 4, 5, 6, 6])).toBe(HandCategory.SixStraight); // all six faces
    expect(cat([1, 2, 3, 4, 5, 1, 1])).toBe(HandCategory.Trips); // 1..5 run but trips of 1 outrank it
  });

  it('rejects malformed hands', () => {
    expect(() => evaluateHand([1, 2, 3])).toThrow();
    expect(() => evaluateHand([1, 2, 3, 4, 5, 6, 7])).toThrow();
    expect(() => evaluateHand([0, 1, 2, 3, 4, 5, 6])).toThrow();
  });
});

describe('compareHands — tie-breaking (DESIGN.md §6)', () => {
  it('a stronger category always beats a weaker one', () => {
    // Two Pairs beats Full House (Full House is the weakest payable hand).
    expect(compareDice([3, 3, 5, 5, 1, 2, 4], [3, 3, 3, 5, 5, 1, 2])).toBeGreaterThan(0);
  });

  it('Full aux 5 beats Full aux 3 (higher trips)', () => {
    expect(compareDice([5, 5, 5, 2, 2, 1, 6], [3, 3, 3, 2, 2, 1, 6])).toBeGreaterThan(0);
  });

  it('same trips, higher pair wins the Full House', () => {
    expect(compareDice([4, 4, 4, 6, 6, 1, 2], [4, 4, 4, 5, 5, 1, 2])).toBeGreaterThan(0);
  });

  it('Two Pairs: higher top pair decides, then second pair, then kicker', () => {
    // both TwoPairs (faces chosen to avoid an accidental 5-run); 6-high beats 5-high
    expect(compareDice([6, 6, 2, 2, 1, 3, 4], [5, 5, 4, 4, 1, 2, 6])).toBeGreaterThan(0);
    // same pairs (6,2), kicker decides: 5 > 4
    expect(compareDice([6, 6, 2, 2, 5, 1, 3], [6, 6, 2, 2, 4, 1, 3])).toBeGreaterThan(0);
  });

  it('higher quad wins Four of a Kind', () => {
    expect(compareDice([6, 6, 6, 6, 1, 2, 3], [5, 5, 5, 5, 1, 2, 3])).toBeGreaterThan(0);
  });

  it('higher top-of-run wins a straight', () => {
    // 2..6 five-straight (top 6) beats 1..5 five-straight (top 5)
    expect(compareDice([2, 3, 4, 5, 6, 6, 2], [1, 2, 3, 4, 5, 5, 1])).toBeGreaterThan(0);
  });

  it('identical hands split (compare === 0)', () => {
    expect(compareDice([3, 3, 3, 5, 5, 1, 2], [3, 3, 3, 5, 5, 1, 2])).toBe(0);
  });
});

describe('exhaustive enumeration — matches DESIGN.md §5 probabilities', () => {
  // The strong correctness proof: classify all 6^7 = 279,936 seven-dice rolls
  // and assert each category's share (rounded to 3 dp) equals the design doc.
  const TOTAL = 6 ** 7;
  const expectedPct: Record<HandCategory, number> = {
    [HandCategory.FullHouse]: 27.006,
    [HandCategory.TwoPairs]: 18.004,
    [HandCategory.ThreePairs]: 13.503,
    [HandCategory.FiveStraight]: 9.002,
    [HandCategory.Trips]: 9.002,
    [HandCategory.SixStraight]: 5.401,
    [HandCategory.BigFull]: 4.501,
    [HandCategory.FourOfAKind]: 4.501,
    [HandCategory.FourPlusPair]: 4.501,
    [HandCategory.DoubleTrips]: 3.001,
    [HandCategory.FiveOfAKind]: 0.9,
    [HandCategory.FourPlusTrips]: 0.375,
    [HandCategory.FivePlusPair]: 0.225,
    [HandCategory.SixOfAKind]: 0.075,
    [HandCategory.SevenOfAKind]: 0.002,
  };

  it('every roll classifies into exactly one category and shares match the doc', () => {
    const tally = new Map<HandCategory, number>();
    const d = [1, 1, 1, 1, 1, 1, 1];
    let total = 0;
    // odometer over all 7 dice, faces 1..6
    for (;;) {
      const c = evaluateHand(d).category;
      tally.set(c, (tally.get(c) ?? 0) + 1);
      total++;
      // increment
      let i = 0;
      for (; i < 7; i++) {
        if (d[i] < 6) {
          d[i]++;
          break;
        }
        d[i] = 1;
      }
      if (i === 7) break;
    }

    expect(total).toBe(TOTAL);
    let summed = 0;
    for (const [, count] of tally) summed += count;
    expect(summed).toBe(TOTAL);

    for (const key of Object.keys(expectedPct)) {
      const c = Number(key) as HandCategory;
      const pct = Math.round(((tally.get(c) ?? 0) / TOTAL) * 100 * 1000) / 1000;
      expect(pct, `category ${HandCategory[c]}`).toBe(expectedPct[c]);
    }
  });
});
