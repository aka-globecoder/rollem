# Roll'Em

A push-your-luck dice game playable in the browser. Fast rounds, simple rules,
tense keep-rolling-or-bank decisions.

## Stack

- [Vite](https://vite.dev/) — dev server and build
- [TypeScript](https://www.typescriptlang.org/) — strict mode
- [Vitest](https://vitest.dev/) — test runner

No framework: the game engine is pure TypeScript (`src/engine/`), the game
flow is a headless controller (`src/ui/app.ts`), and the DOM layer
(`src/main.ts`) is a render-from-state view — so the whole game is testable
without a browser.

## How to play

You vs. the AI, first to bank 2,000 points. Roll six dice, click the scoring
dice you want to keep (1s = 100, 5s = 50, three of a kind = face × 100, three
1s = 1,000), then **bank** your turn total or **roll again** with the rest. A
roll with no scoring dice is a bust: unbanked points are gone. Keep all six as
scorers and they come back (*hot dice*). When someone banks 2,000+, the
opponent gets one final turn to beat them.

## Getting started

Requires Node 20+.

```sh
npm install     # install dependencies
npm test        # run the test suite once
npm run dev     # start the dev server (http://localhost:5173)
```

Other scripts:

```sh
npm run test:watch   # tests in watch mode
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build locally
```

## Project layout

```
index.html            Vite entry point
src/main.ts           DOM view: renders ui/app.ts state, forwards clicks
src/style.css         All styling (no framework)
src/ui/               Headless game-flow controller + selection helpers
src/engine/           Pure game logic. Fully unit-tested. No DOM imports.
src/**/*.test.ts      Tests live next to the code they cover.
.github/workflows/    CI: npm ci, test, build on every push/PR.
```

### Engine modules (`src/engine/`)

The rules implemented here are exactly those in the project design doc
(`DESIGN.md`, one level above this repo).

| Module        | Responsibility                                                        |
|---------------|-----------------------------------------------------------------------|
| `dice.ts`     | Die/dice rolling with an injectable `Rng`                             |
| `rng.ts`      | `mulberry32` seedable PRNG for tests and reproducible simulations     |
| `scoring.ts`  | Scoring table, bust detection, set-aside legality (§3)                |
| `game.ts`     | Turn/state machine: roll → set aside → bank-or-roll, hot dice, endgame, tie-break (§2, §4) |
| `ai.ts`       | Deterministic opponent: greedy set-aside + ordered bank-or-roll heuristics (§5) |
| `simulate.ts` | Plays complete seeded AI-vs-AI games engine-only                      |

Typical flow: `newGame()` → `roll(state, rng)` → `setAside(state, indices)` →
`bank(state)` or `roll` again. All actions are pure (state in, new state out)
and throw on illegal moves, so the UI can lean on the engine for validation.

## Engineering conventions

- Game rules and scoring live in `src/engine/` as pure functions with an
  injectable RNG (`Rng` type) so every rule is deterministic under test.
- Every engine module gets a test file. Rules bugs kill trust in a dice game.
