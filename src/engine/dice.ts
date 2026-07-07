/** A random source returning a float in [0, 1). Injectable so game logic is testable. */
export type Rng = () => number;

/** Roll a single six-sided die, returning 1–6. */
export function rollDie(rng: Rng = Math.random): number {
  return Math.floor(rng() * 6) + 1;
}

/** Roll `count` six-sided dice. */
export function rollDice(count: number, rng: Rng = Math.random): number[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`count must be a non-negative integer, got ${count}`);
  }
  return Array.from({ length: count }, () => rollDie(rng));
}
