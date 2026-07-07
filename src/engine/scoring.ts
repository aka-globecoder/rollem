/**
 * Scoring rules from DESIGN.md §3.
 *
 * Only these combinations score, and combinations must come from a single roll:
 * - single 1 = 100, single 5 = 50
 * - three of a kind = face × 100, except three 1s = 1,000
 * - four or more of a kind is NOT a bonus: it scores as ONE three-of-a-kind,
 *   plus leftovers scored individually if they are 1s or 5s; other leftovers
 *   score 0 and can never be set aside.
 */

const SINGLE_VALUE: Readonly<Record<number, number>> = { 1: 100, 5: 50 };

/** Points for a three-of-a-kind of the given face. */
export function tripleValue(face: number): number {
  return face === 1 ? 1000 : face * 100;
}

function faceCounts(dice: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const die of dice) {
    if (!Number.isInteger(die) || die < 1 || die > 6) {
      throw new RangeError(`die face must be 1-6, got ${die}`);
    }
    counts.set(die, (counts.get(die) ?? 0) + 1);
  }
  return counts;
}

/**
 * Maximum points obtainable from a roll if every usable scorer is set aside
 * (the AI's greedy valuation). 0 means the roll is a bust.
 */
export function maxRollScore(roll: readonly number[]): number {
  let points = 0;
  for (const [face, count] of faceCounts(roll)) {
    const single = SINGLE_VALUE[face] ?? 0;
    if (count >= 3) {
      points += tripleValue(face) + (count - 3) * single;
    } else {
      points += count * single;
    }
  }
  return points;
}

/** True when the roll contains no scoring dice at all (DESIGN.md §2 step 2). */
export function isBust(roll: readonly number[]): boolean {
  return maxRollScore(roll) === 0;
}

/**
 * Indices of every die in the roll that can legally be part of a set-aside:
 * all 1s and 5s, plus exactly three dice of any other face appearing 3+ times
 * (the fourth-and-beyond of a non-1/5 face scores 0 and is never selectable).
 */
export function scoringDiceIndices(roll: readonly number[]): number[] {
  const counts = faceCounts(roll);
  const taken = new Map<number, number>();
  const indices: number[] = [];
  roll.forEach((face, i) => {
    if (SINGLE_VALUE[face] !== undefined) {
      indices.push(i);
      return;
    }
    if ((counts.get(face) ?? 0) >= 3 && (taken.get(face) ?? 0) < 3) {
      taken.set(face, (taken.get(face) ?? 0) + 1);
      indices.push(i);
    }
  });
  return indices;
}

/**
 * Score a proposed set-aside (multiset of faces taken from one roll).
 * Returns the points, or null if the selection is illegal: empty, or any
 * selected die is not part of a scoring single/triple within the selection.
 */
export function scoreSelection(selection: readonly number[]): number | null {
  if (selection.length === 0) return null;
  let points = 0;
  for (const [face, count] of faceCounts(selection)) {
    const single = SINGLE_VALUE[face];
    if (single !== undefined) {
      points += count >= 3 ? tripleValue(face) + (count - 3) * single : count * single;
    } else if (count === 3) {
      points += tripleValue(face);
    } else {
      // Non-1/5 faces score only as exactly one triple; anything else means
      // a selected die scores 0, which is never legal to set aside.
      return null;
    }
  }
  return points;
}
