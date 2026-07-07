import { describe, expect, it } from 'vitest';
import { DEFAULT_TARGET } from './game';
import { playAiGame } from './simulate';

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe('full engine-only games (AI vs AI, seeded)', () => {
  it('every seeded game finishes with a decisive, consistent result', () => {
    for (const seed of SEEDS) {
      const { state } = playAiGame(seed);
      expect(state.phase).toBe('gameOver');
      expect(state.winner).not.toBeNull();
      const winner = state.winner!;
      const loser = 1 - winner;
      // A win requires banking the target (or beating someone who did).
      expect(state.banked[winner]).toBeGreaterThanOrEqual(DEFAULT_TARGET);
      // No unresolved ties at game over.
      expect(state.banked[winner]).toBeGreaterThan(state.banked[loser]);
      expect(state.endgameTriggeredBy).not.toBeNull();
    }
  });

  it('is deterministic: the same seed replays the same game', () => {
    const a = playAiGame(42);
    const b = playAiGame(42);
    expect(a.state).toEqual(b.state);
    expect(a.rolls).toBe(b.rolls);
  });

  it('different seeds produce different games', () => {
    const results = new Set(SEEDS.slice(0, 50).map((s) => JSON.stringify(playAiGame(s).state.banked)));
    expect(results.size).toBeGreaterThan(1);
  });

  it('games are the right length for a sub-5-minute match (§6)', () => {
    const turnCounts = SEEDS.map((s) => playAiGame(s).turns);
    const avg = turnCounts.reduce((a, b) => a + b, 0) / turnCounts.length;
    // Observed: ~10 turns total — the greedy AI often banks a 300+ first
    // roll, so games run shorter than §6's 8–12-per-player estimate. Bound
    // both ways so a rules regression (too-easy or unwinnable) shows up.
    expect(avg).toBeGreaterThan(6);
    expect(avg).toBeLessThan(30);
    for (const t of turnCounts) expect(t).toBeLessThan(200);
  });

  it('across seeds, final turns end both ways: comeback wins and busted losses (§8)', () => {
    let comebackWins = 0; // the non-trigger player out-rolled the trigger
    let finalTurnLosses = 0; // the last turn ended in a bust and the trigger won
    for (const seed of SEEDS) {
      const { state } = playAiGame(seed);
      if (state.winner !== state.endgameTriggeredBy) comebackWins++;
      if (state.winner === state.endgameTriggeredBy && state.lastTurnBusted) finalTurnLosses++;
    }
    expect(comebackWins).toBeGreaterThan(0);
    expect(finalTurnLosses).toBeGreaterThan(0);
  });
});
