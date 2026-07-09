import { describe, expect, it } from 'vitest';
import { describeCurrentHand } from './currentHand';

describe('describeCurrentHand', () => {
  it('reports the exact scoring category once all 7 dice are present', () => {
    // 3+2+1+1 = Full House (the weakest scoring shape).
    const r = describeCurrentHand([5, 5, 5, 2, 2, 3, 4]);
    expect(r.final).toBe(true);
    expect(r.label).toBe('Full House');
  });

  it('names the strongest made shape mid-hand (fewer than 7 dice)', () => {
    expect(describeCurrentHand([5, 5, 5, 2, 1]).label).toBe('Trips of fives');
    expect(describeCurrentHand([5, 5, 5, 2, 2]).label).toMatch(/Full house forming/);
    expect(describeCurrentHand([6, 6, 3, 3, 1]).label).toMatch(/Two pairs/);
    expect(describeCurrentHand([4, 4, 4, 4, 1]).label).toBe('Four fours');
  });

  it('surfaces a forming straight over a lone pair', () => {
    expect(describeCurrentHand([1, 2, 3, 4, 5]).label).toBe('5-Straight');
    expect(describeCurrentHand([1, 2, 3, 4, 5, 6]).label).toBe('6-Straight');
  });

  it('says nothing is made yet for a bare high-die holding', () => {
    expect(describeCurrentHand([1, 3, 5]).label).toBe('No combo yet');
  });

  it('never claims final before 7 dice', () => {
    expect(describeCurrentHand([5, 5]).final).toBe(false);
    expect(describeCurrentHand([5, 5, 5, 5, 5, 5]).final).toBe(false);
  });
});
