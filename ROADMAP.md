# Roll'Em — Product Roadmap

Owner: CEO. Last updated: 2026-07-09.

> **2026-07-09 — Direction pivot.** Roll'Em is now **dice poker** (Texas
> Hold'em played with dice), not the earlier push-your-luck game. Decided by
> the CEO on ROL-2 after reviewing the `Roll_Em.htm` / `Combinaisons_Roll_Em.csv`
> ruleset. The design lives in `DESIGN.md`; the combination-ranking analysis is
> in `RULES_REVIEW.md`. Sections below are updated to match.

## Product direction

Roll'Em is a **dice-poker game playable in the browser** — Texas Hold'em rules
with dice instead of cards. Two hidden dice per player, five community dice
revealed across four betting rounds, best seven-dice combination wins the pot.
Fast hands (30–60 s) and short matches (~3–5 minutes with escalating blinds),
built on a ranking that inverts poker intuition (a full house is the *weakest*
hand — see `DESIGN.md`). Single-player heads-up against a simple AI first;
multiplayer tables only after the core game is proven fun.

Why dice poker: bluffing and betting give dice a tension card poker fans already
understand, the inverted 7-dice hierarchy is a genuine hook, and a heads-up
fixed-limit MVP is still a one-engineer build.

## Milestone 1 — Playable MVP (current)

Everything below is broken into issues under ROL-1 and assigned to the CTO.
Scope grew with the pivot: the engine now needs a betting model and a poker AI.

1. **Game design document** — rules, betting rounds, combination ranking,
   tie-breaks, win condition, AI. CTO drafts, CEO signs off on the fun. *(Done —
   `DESIGN.md`.)*
2. **Project scaffold** — repo, toolchain, test runner, CI. Simple stack, no
   speculative infra.
3. **Core game engine** — pure, fully-tested logic: 7-dice combination
   evaluator + comparator, hand state machine (streets/board/showdown), and the
   fixed-limit betting engine. UI-independent.
4. **Browser UI** — playable heads-up game (1 human vs 1 AI): private dice,
   board, pot, chip stacks, betting actions, showdown.
5. **Playtest & polish** — full matches run clean, obvious rough edges fixed,
   README done.

**Exit criteria:** a stranger can open the game in a browser, learn it in one
match, and finish a full heads-up match without hitting a bug.

## Milestone 2 — Feel & first users (after MVP)

- UX pass with a designer hire (see HIRING_PLAN.md): animations, sound, juice on
  the dice roll and reveals.
- Difficulty options for the AI opponent (tight/loose/bluff tiers — knobs already
  specified in `DESIGN.md` §8).
- Match history / stats for replayability.
- Possible ranking-variety additions (e.g. re-introduce cut categories) only if
  playtests want them.

## Milestone 3 — Growth (after the game is demonstrably fun)

- Launch and community (CMO hire).
- Multiplayer tables (3–8 players; hot-seat first, then online) and no-limit
  betting — only if playtests demand it.

## Non-goals for now

Mobile apps, accounts/auth, monetization, online multiplayer, 3+ player tables,
and no-limit betting. All are Milestone 2/3+ questions and each would slow down
proving the core loop is fun.
