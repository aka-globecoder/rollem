/**
 * Dice-poker hand evaluation for Roll'Em.
 *
 * Implements the 15-category combination ranking and tie-breaking rules from
 * DESIGN.md §5–§6 (the dice-poker pivot). A hand is the 7 dice a player can use
 * at showdown (2 private + 5 board). Categories are ordered strictly by rarity:
 * the rarer the shape, the stronger the hand — so a Full House is the *weakest*
 * payable hand and Seven of a Kind the strongest. See DESIGN.md for the "why".
 *
 * Pure and UI-independent: `evaluateHand` classifies, `compareHands` orders.
 */

/**
 * The 15 combination categories, weakest (1) to strongest (15). The numeric
 * value IS the strength rank, so a higher enum value beats a lower one.
 */
export enum HandCategory {
  FullHouse = 1, // 3+2 : trips + a pair + 2 singles
  TwoPairs = 2, // 2+2 : exactly two pairs + 3 singles
  ThreePairs = 3, // 2+2+2 : three distinct pairs + 1 single
  FiveStraight = 4, // 5 consecutive faces present (not all six)
  Trips = 5, // 3 : exactly three of a kind + 4 singles
  SixStraight = 6, // all faces 1-2-3-4-5-6 present
  BigFull = 7, // 3+2+2 : trips + two distinct pairs
  FourOfAKind = 8, // 4 + 3 singles
  FourPlusPair = 9, // 4+2 : quad + a separate pair
  DoubleTrips = 10, // 3+3 : two different three-of-a-kinds
  FiveOfAKind = 11, // 5 + 2 leftover
  FourPlusTrips = 12, // 4+3 : quad + trips
  FivePlusPair = 13, // 5+2 : five of a kind + a pair
  SixOfAKind = 14, // 6 + 1 leftover
  SevenOfAKind = 15, // all seven dice the same face
}

/** Human-readable labels (English / French per DESIGN.md §5). */
export const CATEGORY_LABEL: Record<HandCategory, string> = {
  [HandCategory.FullHouse]: 'Full House',
  [HandCategory.TwoPairs]: 'Two Pairs',
  [HandCategory.ThreePairs]: 'Three Pairs',
  [HandCategory.FiveStraight]: '5-Straight',
  [HandCategory.Trips]: 'Trips',
  [HandCategory.SixStraight]: '6-Straight',
  [HandCategory.BigFull]: 'Big Full',
  [HandCategory.FourOfAKind]: 'Four of a Kind',
  [HandCategory.FourPlusPair]: 'Four of a Kind + Pair',
  [HandCategory.DoubleTrips]: 'Double Trips',
  [HandCategory.FiveOfAKind]: 'Five of a Kind',
  [HandCategory.FourPlusTrips]: 'Four of a Kind + Trips',
  [HandCategory.FivePlusPair]: 'Five of a Kind + Pair',
  [HandCategory.SixOfAKind]: 'Six of a Kind',
  [HandCategory.SevenOfAKind]: 'Seven of a Kind',
};

export interface HandValue {
  /** The scored category (its numeric value is the strength rank). */
  category: HandCategory;
  /**
   * Tie-break vector, compared lexicographically (higher wins) only against
   * another hand of the *same* category — see DESIGN.md §6. Defining faces
   * come first (highest group first), then kickers highest-down.
   */
  tiebreak: number[];
}

const HAND_SIZE = 7;

/** Count-shape → category for the shapes that are defined purely by grouping. */
const SHAPE_TO_CATEGORY: Record<string, HandCategory> = {
  '7': HandCategory.SevenOfAKind,
  '6,1': HandCategory.SixOfAKind,
  '5,2': HandCategory.FivePlusPair,
  '5,1,1': HandCategory.FiveOfAKind,
  '4,3': HandCategory.FourPlusTrips,
  '4,2,1': HandCategory.FourPlusPair,
  '4,1,1,1': HandCategory.FourOfAKind,
  '3,3,1': HandCategory.DoubleTrips,
  '3,2,2': HandCategory.BigFull,
  '3,2,1,1': HandCategory.FullHouse,
  '3,1,1,1,1': HandCategory.Trips,
  '2,2,2,1': HandCategory.ThreePairs,
  '2,2,1,1,1': HandCategory.TwoPairs,
  // '2,1,1,1,1,1' (one pair) is impossible without all six faces present,
  // which makes it a 6-Straight — handled by the straight check below.
};

/** Evaluate a 7-dice hand into its category and tie-break vector. */
export function evaluateHand(dice: readonly number[]): HandValue {
  if (dice.length !== HAND_SIZE) {
    throw new RangeError(`a hand is ${HAND_SIZE} dice, got ${dice.length}`);
  }
  const counts = [0, 0, 0, 0, 0, 0, 0]; // counts[1..6]
  for (const d of dice) {
    if (!Number.isInteger(d) || d < 1 || d > 6) {
      throw new RangeError(`die faces must be integers 1–6, got ${d}`);
    }
    counts[d]++;
  }

  // Longest run of consecutive present faces, and its top face.
  let longestRun = 0;
  let runTop = 0;
  let cur = 0;
  for (let f = 1; f <= 6; f++) {
    if (counts[f] > 0) {
      cur++;
      if (cur > longestRun) {
        longestRun = cur;
        runTop = f; // f is the highest face in the current run
      }
    } else {
      cur = 0;
    }
  }

  const presentFaces = [1, 2, 3, 4, 5, 6].filter((f) => counts[f] > 0);
  const shape = presentFaces
    .map((f) => counts[f])
    .sort((a, b) => b - a)
    .join(',');

  const countCategory = SHAPE_TO_CATEGORY[shape];
  const straightCategory =
    longestRun >= 6
      ? HandCategory.SixStraight
      : longestRun === 5
        ? HandCategory.FiveStraight
        : undefined;

  // The scored category is the strongest (highest rank) the hand qualifies for.
  let category = countCategory ?? HandCategory.FullHouse;
  if (straightCategory !== undefined && straightCategory > category) {
    category = straightCategory;
  }

  const tiebreak =
    category === HandCategory.FiveStraight || category === HandCategory.SixStraight
      ? straightTiebreak(counts, runTop, longestRun)
      : groupTiebreak(counts);

  return { category, tiebreak };
}

/**
 * Tie-break for grouped categories: faces ordered by (count desc, face desc),
 * so the defining groups (trips, quads, pairs) come before kicker singles, and
 * higher faces before lower — exactly DESIGN.md §6 steps 1–2.
 */
function groupTiebreak(counts: number[]): number[] {
  const faces = [1, 2, 3, 4, 5, 6].filter((f) => counts[f] > 0);
  faces.sort((a, b) => counts[b] - counts[a] || b - a);
  return faces;
}

/**
 * Tie-break for straights: highest face of the run first, then the leftover
 * dice (everything not part of one instance of the run) highest-down.
 */
function straightTiebreak(counts: number[], runTop: number, runLen: number): number[] {
  const leftover = counts.slice();
  for (let f = runTop; f > runTop - runLen; f--) {
    leftover[f]--; // remove one die per run face
  }
  const kickers: number[] = [];
  for (let f = 6; f >= 1; f--) {
    for (let n = 0; n < leftover[f]; n++) kickers.push(f);
  }
  return [runTop, ...kickers];
}

/**
 * Order two hands. Returns > 0 if `a` beats `b`, < 0 if `b` beats `a`, and 0 on
 * a true tie (pot split — see DESIGN.md §6 step 3). Sign only; magnitude is not
 * meaningful.
 */
export function compareHands(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i++) {
    const diff = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Convenience: evaluate and compare two raw 7-dice hands. */
export function compareDice(a: readonly number[], b: readonly number[]): number {
  return compareHands(evaluateHand(a), evaluateHand(b));
}
