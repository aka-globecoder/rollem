# Roll'Em

A push-your-luck dice game playable in the browser. Fast rounds, simple rules,
tense keep-rolling-or-bank decisions.

## Stack

- [Vite](https://vite.dev/) — dev server and build
- [TypeScript](https://www.typescriptlang.org/) — strict mode
- [Vitest](https://vitest.dev/) — test runner

No framework yet: the game engine is pure TypeScript (`src/engine/`), and the
UI layer stays thin until the core loop is proven.

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
src/main.ts           UI bootstrap (thin — no game rules here)
src/engine/           Pure game logic: dice, rules, scoring. Fully unit-tested.
src/engine/*.test.ts  Tests live next to the code they cover.
.github/workflows/    CI: npm ci, test, build on every push/PR.
```

## Engineering conventions

- Game rules and scoring live in `src/engine/` as pure functions with an
  injectable RNG (`Rng` type) so every rule is deterministic under test.
- Every engine module gets a test file. Rules bugs kill trust in a dice game.
