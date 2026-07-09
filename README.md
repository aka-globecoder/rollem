# Roll'Em

**Dice poker** — Texas hold'em played with dice — in the browser. Heads-up: one
human against an AI. Two hidden dice each, five shared board dice across the
flop/turn/river, and four betting rounds. The twist: with seven dice the hand
rankings **invert**, so rarer shapes win (a Full House is the *weakest* payable
hand, up to Seven of a Kind at the top).

## Stack

- [Vite](https://vite.dev/) — dev server and build
- [TypeScript](https://www.typescriptlang.org/) — strict mode
- [Vitest](https://vitest.dev/) — test runner

No framework: the game logic is pure TypeScript (`src/engine/`), the game flow
is a headless controller (`src/ui/table.ts`), and the DOM layer (`src/main.ts`)
is a render-from-state view — so the whole game is testable without a browser.

## How to play

You vs. the AI, fixed-limit betting, 100 chips each, blinds 1/2 (they escalate
so a match lasts a few minutes). You hold two hidden dice; five board dice are
revealed across the flop (3), turn (1) and river (1). Each betting round you
**check/bet/call/raise/fold**. At showdown the best seven-dice combination wins
the pot — remember the rankings are inverted (rarer beats commoner). Win the
AI's whole stack to take the match. The AI's dice stay hidden unless the hand
reaches a showdown.

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
src/main.ts           DOM view: renders ui/table.ts state, forwards clicks
src/style.css         All styling (no framework)
src/ui/table.ts       Headless table controller (drives the engine + AI, paces turns)
src/engine/           Pure game logic. Fully unit-tested. No DOM imports.
src/**/*.test.ts      Tests live next to the code they cover.
.github/workflows/    CI: npm ci, test, build on every push/PR.
```

### Engine modules (`src/engine/`)

The rules implemented here are exactly those in the project design doc
(`DESIGN.md`, at the repo root).

| Module        | Responsibility                                                        |
|---------------|-----------------------------------------------------------------------|
| `dice.ts`     | Die/dice rolling with an injectable `Rng`                             |
| `rng.ts`      | `mulberry32` seedable PRNG for tests and reproducible play            |
| `handEval.ts` | 7-dice hand evaluator + comparator; the inverted 15-category ranking (§5–§6) |
| `hand.ts`     | One hand: deal → flop/turn/river betting → showdown; fixed-limit rules, all-in refunds (§3–§7) |
| `match.ts`    | Match layer: chip stacks, button rotation, escalating blinds, elimination (§2, §7, §9) |
| `pokerAi.ts`  | Equity-based opponent: exact win-probability enumeration + pot-odds policy (§8) |

Typical flow: `createMatch()` → `beginHand(match, rng)` → `applyAction(hand,
{type})` per betting decision → `settleHand(match, hand)` to fold stacks back
and deal on. All actions are pure (state in, new state out) and throw on illegal
moves, so the UI leans on the engine for validation.

## Engineering conventions

- Game rules live in `src/engine/` as pure functions with an injectable RNG
  (`Rng` type) so every rule is deterministic under test.
- Every engine module gets a test file. Rules bugs kill trust in a dice game.
- The UI controller is headless and testable: inject `rng` + `delay` and drive a
  whole match with no DOM (see `src/ui/table.test.ts`).
