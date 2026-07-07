import { describe, expect, it } from 'vitest';
import { aiDecide } from '../engine/ai';
import { mulberry32 } from '../engine/rng';
import { scoringDiceIndices } from '../engine/scoring';
import { riggedRng } from '../engine/test-helpers';
import { AI, App, HUMAN } from './app';

const instant = () => Promise.resolve();

/** Drive the human side exactly through the public click-level API. */
async function playHumanAction(app: App): Promise<void> {
  const { game } = app.state;
  switch (game.phase) {
    case 'roll':
      await app.roll();
      return;
    case 'select':
      for (const i of scoringDiceIndices(game.rolled)) app.toggleDie(i);
      app.keep();
      return;
    case 'decide':
      if (aiDecide(game) === 'bank') await app.bank();
      else await app.roll();
      return;
    case 'gameOver':
      return;
  }
}

describe('App full games (headless)', () => {
  it('plays complete games to gameOver via UI actions only, across seeds', async () => {
    for (let seed = 1; seed <= 25; seed++) {
      const app = new App({ rng: mulberry32(seed), delay: instant });
      for (let actions = 0; actions < 10_000 && app.state.game.phase !== 'gameOver'; actions++) {
        expect(app.state.game.current).toBe(HUMAN); // AI turns resolve inside human actions
        await playHumanAction(app);
      }
      expect(app.state.game.phase).toBe('gameOver');
      expect(app.state.game.winner).not.toBeNull();
      expect(app.state.message.length).toBeGreaterThan(0);
      expect(app.state.aiTurnRunning).toBe(false);
    }
  });

  it('restart returns to a fresh game only after gameOver', async () => {
    const app = new App({ rng: mulberry32(7), delay: instant });
    app.restart();
    expect(app.state.game.banked).toEqual([0, 0]); // no-op mid-game, still fresh anyway
    while (app.state.game.phase !== 'gameOver') await playHumanAction(app);
    app.restart();
    expect(app.state.game.phase).toBe('roll');
    expect(app.state.game.banked).toEqual([0, 0]);
    expect(app.state.game.current).toBe(HUMAN);
  });
});

describe('App scripted turns', () => {
  it('rejects illegal selections and accepts legal ones', async () => {
    // Human rolls a triple of 2s plus junk; AI then busts its 6-dice roll.
    const app = new App({
      rng: riggedRng([2, 2, 2, 3, 4, 6, /* AI: */ 2, 3, 4, 6, 6, 2]),
      delay: instant,
    });
    await app.roll();
    expect(app.state.game.phase).toBe('select');

    app.toggleDie(3); // face 3, not selectable
    expect(app.state.selected.size).toBe(0);

    app.toggleDie(0);
    app.toggleDie(1);
    app.keep(); // two of a triple: illegal, must be a no-op
    expect(app.state.game.phase).toBe('select');

    app.toggleDie(2);
    app.keep();
    expect(app.state.game.phase).toBe('decide');
    expect(app.state.game.turnTotal).toBe(200);

    await app.bank();
    expect(app.state.game.banked[HUMAN]).toBe(200);
    // AI's scripted roll busted; control is back with the human.
    expect(app.state.game.current).toBe(HUMAN);
    expect(app.state.game.banked[AI]).toBe(0);
    expect(app.state.flashDice).toEqual([2, 3, 4, 6, 6, 2]);
    expect(app.state.message).toContain('Your turn');
  });

  it('handles hot dice and a human bust', async () => {
    const app = new App({
      rng: riggedRng([
        1, 1, 1, 5, 5, 5, // human: two triples = 1,500, hot dice
        2, 3, 4, 6, 6, 3, // human rolls all 6 again: bust, loses 1,500
        1, 5, 3, 4, 2, 6, // AI keeps 150 with 4 dice left...
        2, 3, 4, 6, // ...rolls 4 dice: bust
      ]),
      delay: instant,
    });
    await app.roll();
    for (let i = 0; i < 6; i++) app.toggleDie(i);
    app.keep();
    expect(app.state.game.turnTotal).toBe(1500);
    expect(app.state.game.diceInHand).toBe(6);
    expect(app.state.message).toContain('Hot dice');

    await app.roll(); // busts; AI turn runs and also busts
    expect(app.state.game.banked).toEqual([0, 0]);
    expect(app.state.game.current).toBe(HUMAN);
    expect(app.state.game.phase).toBe('roll');
  });

  it('ignores human actions when it is not a legal moment', async () => {
    const app = new App({ rng: riggedRng([1, 2, 3, 4, 6, 6]), delay: instant });
    app.keep(); // no roll yet
    await app.bank();
    expect(app.state.game.phase).toBe('roll');
    await app.roll();
    await app.roll(); // rolling during 'select' is a no-op
    expect(app.state.game.phase).toBe('select');
    expect(app.state.game.rolled).toEqual([1, 2, 3, 4, 6, 6]);
  });
});
