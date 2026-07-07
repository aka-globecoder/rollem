/**
 * Pure helpers for the human's set-aside selection (DESIGN.md §3).
 * Kept DOM-free so selection legality is unit-testable.
 */
import { scoreSelection } from '../engine/scoring';

/**
 * True if the die at `index` can be part of *some* legal set-aside from this
 * roll: any 1 or 5, or any die whose face appears 3+ times in the roll.
 * (The final selection is still validated as a whole by `selectionPoints` —
 * e.g. picking only two dice of a triple face is selectable but not keepable.)
 */
export function isDieSelectable(roll: readonly number[], index: number): boolean {
  const face = roll[index];
  if (face === undefined) return false;
  if (face === 1 || face === 5) return true;
  return roll.filter((f) => f === face).length >= 3;
}

/**
 * Points the current selection is worth, or null when the selection is not a
 * legal set-aside (empty, or includes dice that don't score as kept).
 */
export function selectionPoints(
  roll: readonly number[],
  selected: ReadonlySet<number>,
): number | null {
  return scoreSelection([...selected].map((i) => roll[i]));
}
