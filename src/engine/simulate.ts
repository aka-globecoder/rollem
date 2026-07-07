/**
 * Engine-only game runner: plays a full AI-vs-AI game with a seeded RNG.
 * Proves the acceptance criterion that a complete game is playable without
 * any UI, and powers the simulation tests.
 */
import { aiChooseSetAside, aiDecide } from './ai';
import type { Rng } from './dice';
import { bank, newGame, roll, setAside, type GameState } from './game';
import { mulberry32 } from './rng';

export interface SimulationResult {
  state: GameState;
  /** Number of turns taken across both players (busts and banks each end one). */
  turns: number;
  /** Total roll actions across the game. */
  rolls: number;
}

const MAX_ACTIONS = 100_000;

/** Play one full game where every player uses the DESIGN.md §5 AI policy. */
export function playAiGame(seed: number | Rng): SimulationResult {
  const rng = typeof seed === 'number' ? mulberry32(seed) : seed;
  let state = newGame();
  let turns = 0;
  let rolls = 0;
  let lastPlayer = state.current;

  for (let actions = 0; actions < MAX_ACTIONS; actions++) {
    if (state.phase === 'gameOver') {
      return { state, turns: turns + 1, rolls };
    }
    if (state.current !== lastPlayer) {
      turns++;
      lastPlayer = state.current;
    }
    switch (state.phase) {
      case 'roll':
        state = roll(state, rng);
        rolls++;
        break;
      case 'select':
        state = setAside(state, aiChooseSetAside(state.rolled));
        break;
      case 'decide':
        state = aiDecide(state) === 'bank' ? bank(state) : (rolls++, roll(state, rng));
        break;
    }
  }
  throw new Error(`game did not finish within ${MAX_ACTIONS} actions — engine is stuck`);
}
