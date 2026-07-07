import { describe, expect, it } from 'vitest';
import { isDieSelectable, selectionPoints } from './selection';

describe('isDieSelectable', () => {
  const roll = [1, 5, 2, 2, 3, 6];

  it('allows 1s and 5s', () => {
    expect(isDieSelectable(roll, 0)).toBe(true);
    expect(isDieSelectable(roll, 1)).toBe(true);
  });

  it('rejects non-scoring faces without a triple', () => {
    expect(isDieSelectable(roll, 2)).toBe(false); // 2 appears only twice
    expect(isDieSelectable(roll, 4)).toBe(false);
    expect(isDieSelectable(roll, 5)).toBe(false);
  });

  it('allows any die of a face appearing 3+ times', () => {
    const triple = [2, 2, 2, 3, 4, 6];
    expect(isDieSelectable(triple, 0)).toBe(true);
    expect(isDieSelectable(triple, 1)).toBe(true);
    expect(isDieSelectable(triple, 2)).toBe(true);
    expect(isDieSelectable(triple, 3)).toBe(false);
    const quad = [4, 4, 4, 4, 1, 3];
    expect(isDieSelectable(quad, 3)).toBe(true); // 4th die selectable, whole-selection check catches overuse
  });

  it('returns false for out-of-range indices', () => {
    expect(isDieSelectable(roll, 6)).toBe(false);
    expect(isDieSelectable(roll, -1)).toBe(false);
  });
});

describe('selectionPoints', () => {
  const roll = [2, 2, 2, 1, 5, 6];

  it('is null for an empty selection', () => {
    expect(selectionPoints(roll, new Set())).toBeNull();
  });

  it('scores singles and triples through the engine', () => {
    expect(selectionPoints(roll, new Set([3]))).toBe(100);
    expect(selectionPoints(roll, new Set([0, 1, 2]))).toBe(200);
    expect(selectionPoints(roll, new Set([0, 1, 2, 3, 4]))).toBe(350);
  });

  it('is null when a partial triple is selected', () => {
    expect(selectionPoints(roll, new Set([0, 1]))).toBeNull();
    expect(selectionPoints(roll, new Set([0, 1, 3]))).toBeNull();
  });
});
