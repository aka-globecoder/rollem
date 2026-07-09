/**
 * Display-only "what you currently have" readout (Winamax-style).
 *
 * The scoring engine (handEval.ts) only classifies a full 7-dice hand at
 * showdown. But a player wants to see their best shape *at any time* as the
 * board comes out — with only 2 (pre-flop), 5 (flop) or 6 (turn) dice visible.
 *
 * This module is purely presentational: it never feeds back into scoring or
 * comparison. When all 7 dice are present it defers to the real evaluator so
 * the label matches the showdown category exactly; with fewer dice it names the
 * strongest *made* shape so far. It never invents a ranking of its own.
 */

import { CATEGORY_LABEL, evaluateHand } from '../engine/handEval';

const FACE_NAMES = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

export interface CurrentHand {
  /** Short label, e.g. "Trips of fives" or "Full House". */
  label: string;
  /** True once this is the definitive 7-dice category (river / showdown). */
  final: boolean;
}

/**
 * Describe the best shape in the currently-visible dice (2–7 of them).
 * With 7 dice this is the exact scoring category; with fewer it's the strongest
 * grouping made "so far".
 */
export function describeCurrentHand(dice: readonly number[]): CurrentHand {
  if (dice.length === 7) {
    return { label: CATEGORY_LABEL[evaluateHand(dice).category], final: true };
  }

  const counts = [0, 0, 0, 0, 0, 0, 0]; // counts[1..6]
  for (const d of dice) counts[d]++;

  // Groups of (face, count) with count >= 2, strongest first (count then face).
  const groups = [1, 2, 3, 4, 5, 6]
    .filter((f) => counts[f] >= 2)
    .map((f) => ({ face: f, count: counts[f] }))
    .sort((a, b) => b.count - a.count || b.face - a.face);

  // Longest run of consecutive present faces (for straights forming).
  let longestRun = 0;
  let run = 0;
  for (let f = 1; f <= 6; f++) {
    run = counts[f] > 0 ? run + 1 : 0;
    if (run > longestRun) longestRun = run;
  }

  const label = describeGroups(groups, longestRun);
  return { label, final: false };
}

function ofKind(count: number, face: number): string {
  const name = FACE_NAMES[face - 1];
  switch (count) {
    case 2:
      return `Pair of ${name}`;
    case 3:
      return `Trips of ${name}`;
    case 4:
      return `Four ${name}`;
    case 5:
      return `Five ${name}`;
    case 6:
      return `Six ${name}`;
    default:
      return `${name}`;
  }
}

function describeGroups(groups: { face: number; count: number }[], longestRun: number): string {
  const top = groups[0];

  // Quads or better read as their own strong shape regardless of straights.
  if (top && top.count >= 4) return ofKind(top.count, top.face);

  // A straight forming (5+ in a row) is a scoring shape worth surfacing; prefer
  // it over trips/pairs since it is rarer here and rare = strong.
  if (longestRun >= 6) return '6-Straight';
  if (longestRun === 5) return '5-Straight';

  if (top && top.count === 3) {
    const pair = groups.find((g) => g.count === 2);
    if (pair) return `Full house forming (${FACE_NAMES[top.face - 1]} & ${FACE_NAMES[pair.face - 1]})`;
    return ofKind(3, top.face);
  }

  const pairs = groups.filter((g) => g.count === 2);
  if (pairs.length >= 3) return 'Three pairs';
  if (pairs.length === 2) return `Two pairs (${FACE_NAMES[pairs[0].face - 1]} & ${FACE_NAMES[pairs[1].face - 1]})`;
  if (pairs.length === 1) return ofKind(2, pairs[0].face);

  return 'No combo yet';
}
