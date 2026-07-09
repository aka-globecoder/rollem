# Roll'Em — Game Design Document

Owner: CTO. Status: draft for CEO fun-review. Last updated: 2026-07-09.

Roll'Em is **dice poker**: Texas Hold'em played with dice instead of cards.
Each player holds two hidden dice; five dice are rolled face-up in the middle in
stages; you bet across four rounds on who will hold the best seven-dice
combination at showdown. Bluffing, position, and pot odds carry over directly
from poker — the dice just replace the deck.

This document is the single source of truth for the rules. The game engine
(ROL milestone item 3) and its tests implement exactly what is written here.
It supersedes the earlier push-your-luck draft (per the CEO's 2026-07-09
decision to pivot to the poker ruleset in `Roll_Em.htm` / `Combinaisons_Roll_Em.csv`).
Combination probabilities below come from exhaustive enumeration of all
6⁷ = 279,936 seven-dice outcomes; the full analysis is in `RULES_REVIEW.md`.

---

## 1. Overview

| Property | Value |
|---|---|
| Genre | Community-dice poker (Texas Hold'em rules, dice deck) |
| Players | 2–8; **MVP ships heads-up: 1 human vs 1 AI** |
| Dice per player | 2 private dice ("the hand"), kept hidden |
| Community dice | 5 shared dice ("the board"): flop 3, turn 1, river 1 |
| Hand evaluated over | All 7 dice (2 private + 5 board) |
| Chips | Each player starts with a fixed stack (MVP: 100 chips, blinds 1/2) |
| Win condition | Take all opponents' chips (last player with chips wins) |
| Round length | One hand ≈ 30–60 s; a full heads-up match ≈ 3–5 min with escalating blinds |
| Randomness | Uniform fair d6; hidden information (opponents' private dice) |

**How it differs from card poker — the hook:** with seven dice you *always*
hold at least a pair, and the hand hierarchy **inverts**. A full house is the
*weakest* payable hand; two pair beats it; trips beat a straight. Learning to
un-learn poker rankings is the game's identity (see §5).

## 2. Table setup and positions

1. Each player has a private cup/screen hiding their two dice, and a chip stack.
2. A **dealer button** marks the nominal dealer; it moves one seat clockwise
   after each hand.
3. The player left of the button posts the **small blind**, the next the **big
   blind** (forced bets, put in before any dice are seen). Heads-up special
   case (standard poker): the **button posts the small blind and acts first
   pre-flop**; the other player posts the big blind and acts first on every
   later street.
4. Blinds escalate on a fixed schedule to keep matches short (MVP: big blind
   doubles every 6 hands).

## 3. Core loop — one hand

A hand is four **betting rounds** ("streets") separated by dice being revealed.

1. **Deal (pre-flop).** Each player secretly rolls their 2 private dice. Betting
   round 1 opens (blinds are already in the pot).
2. **Flop.** Three community dice are rolled face-up. Betting round 2.
3. **Turn.** A fourth community die is rolled. Betting round 3.
4. **River.** A fifth community die is rolled. Betting round 4.
5. **Showdown.** Remaining players reveal their 2 private dice. Each forms the
   best combination over their 7 dice (2 private + 5 board, §5). Highest
   combination wins the pot; ties split it (§6).

A hand can also end early: if everyone but one player folds, that player wins the
pot immediately without a showdown (dice never revealed — this is where bluffing
lives).

### Betting round mechanics

Action proceeds clockwise. On your turn you may:

- **Fold** — surrender your dice and forfeit the hand (and any chips already put
  in). You are out until the next hand.
- **Check** — pass the action without betting; only legal if no bet faces you
  this round.
- **Bet** — put chips in when no bet faces you yet.
- **Call** — match the current bet to stay in.
- **Raise** — increase the current bet; everyone after must call the new amount,
  re-raise, or fold.

A round ends when every player still in has either matched the highest bet or
folded. Unmatched excess (e.g. a raise no one called) is returned. All-in and
side pots follow standard no-limit hold'em rules; the MVP uses a **fixed-limit**
structure to keep the AI and UI simple (bet/raise = one big blind pre-flop and on
the flop, two big blinds on turn and river; max one bet + three raises per round).

## 4. What forms a hand

Your hand is the single **highest-ranking category** present across all seven of
your dice (your 2 private + the 5 shared board dice). Unlike card hold'em there
is no "pick best five" — every one of the seven dice counts toward the pattern,
exactly as the category definitions in §5 describe (e.g. "Trips = exactly three
of a kind **plus four other dice** that don't form another pair or trip").

Both players share the same 5 board dice, so a hand is only as private as the two
dice behind your screen. Position and betting tells are the read.

## 5. Combination ranking (weakest → strongest)

**Fifteen categories, ordered strictly by rarity** — the rarer the hand, the
higher it beats. This is the corrected Option-A ranking (the source CSV's order
had 28 mis-rankings; see `RULES_REVIEW.md`). The 4-Straight from the source list
is **removed**: a run of four appears in 38% of all hands, too common to sit
anywhere in the order without breaking it. Probabilities are the exact share of
all 279,936 seven-dice rolls whose best category is that row (they sum to 100%).

| # | Combination | FR name | Definition (over all 7 dice) | Probability |
|--:|---|---|---|--:|
| 1 (weakest) | Full House (3+2) | Full | Three of a kind + a pair + 2 singles (no other pair) | 27.006% |
| 2 | Two Pairs (2+2) | Double paire | Exactly two pairs + 3 singles | 18.004% |
| 3 | Three Pairs (2+2+2) | Triple paire | Three distinct pairs + 1 single | 13.503% |
| 4 | 5-Straight | 5 Suite | 5 consecutive faces present (and not a 6-straight) | 9.002% |
| 5 | Trips (3) | Brelan | Exactly three of a kind + 4 singles (no extra pair/trip) | 9.002% |
| 6 | 6-Straight | 6 Suite | All faces 1-2-3-4-5-6 present | 5.401% |
| 7 | Big Full (3+2+2) | Big Full | Three of a kind + two distinct pairs | 4.501% |
| 8 | Four of a Kind (4) | Carré Court | Four of a kind + 3 singles (no pair among them) | 4.501% |
| 9 | 4oaK + Pair (4+2) | Carré Long | Four of a kind + a separate pair | 4.501% |
| 10 | Double Trips (3+3) | Double Brelan | Two different three-of-a-kinds | 3.001% |
| 11 | Five of a Kind (5) | Penta Court | Five of a kind + 2 leftover | 0.900% |
| 12 | 4oaK + Trips (4+3) | Carré Tierce | Four of a kind + a three of a kind | 0.375% |
| 13 | 5oaK + Pair (5+2) | Penta Long | Five of a kind + a pair | 0.225% |
| 14 | Six of a Kind (6) | Hexa | Six of a kind + 1 leftover | 0.075% |
| 15 (strongest) | Seven of a Kind (7) | Max | All seven dice the same face | 0.002% |

Notes for the engine:

- **Trips must rank above the 5-Straight** even though both are 9.002%: many
  trip hands also contain a 5-run, so if the straight outranked trips those hands
  would be counted as straights and the straight would become strictly more
  common — an inversion. Ranked as shown, both are exactly 9.002%.
- Ranks **7, 8, 9 are exactly equal probability** (4.501% each). Their order is a
  fixed design choice (quad-based hands above the full-house-based Big Full, the
  paired quad highest); ties between two *players* both holding one of these are
  broken by §6, never by category.
- **Full House sits below Two Pairs by the same overlap mechanism.** At the raw
  count-shape level the two are exactly tied (`3,2,1,1` and `2,2,1,1,1` each occur
  75,600 times). The two-pair shape spans 5 distinct faces, so 25,200 of those
  hands also contain a 5-run and are promoted to 5-Straight (75,600 − 25,200 =
  50,400 = 18.004%). The full-house shape spans only 4 distinct faces and can
  never contain a straight, so all 75,600 (27.006%) remain — making Full House
  strictly more common, hence weaker. Verified by exhaustive enumeration (ROL-13).
- "Straight" = the faces are present among the 7 dice; a hand's straight length
  is the longest such run. A hand containing 1-2-3-4-5-6 is a 6-Straight (rank 6),
  never scored as a lower straight.

## 6. Tie-breaking (same category)

Dice faces rank 1 (low) to 6 (high). When two players hold the same category:

1. Compare the **defining faces**, highest group first. Full House: higher trips
   wins; if equal, higher pair. Two Pairs: higher top pair, then second pair.
   Straights: higher top face of the run. Four of a Kind: higher quad face. Etc.
2. If still equal, compare **kickers** (the leftover dice) from highest down.
3. If every relevant face is equal, the pot is **split** evenly among the tied
   players (odd chip goes to the first seat left of the button).

Face-order examples: a pair of 3s beats a pair of 2s; trips of 5s beat trips of
2s; a Full aux 5 (555+xx) beats a Full aux 3 (333+xx).

## 7. Winning

- A hand is won by the best combination at showdown, or by being the last player
  unfolded.
- The **match** is won when one player holds **all the chips** (everyone else has
  been eliminated by running out). Heads-up MVP: the human wins by busting the
  AI; loses by going bust.
- Escalating blinds guarantee termination and keep a full match inside the
  3–5 minute target.

## 8. Single-player structure — the AI opponent

The MVP is heads-up: one human vs one AI. The AI never sees the human's private
dice; it plays only from its own 2 dice, the visible board, and the betting so
far. Decisions are instant; dice-reveal animations are paced for readability.

**Hand-strength estimate.** On each street the AI computes the exact probability
that its final 7-dice hand will beat a *random* opponent hand, by enumerating the
unseen dice (cheap: at most 6² pre-flop combinations for the opponent, and the
remaining board dice are few). This yields a win-probability `p ∈ [0,1]`. Exact
enumeration is feasible because the dice space is tiny — no Monte Carlo needed.

**Action policy (fixed-limit), evaluated per decision:**

1. Compute `p` (equity vs a random hand) and the **pot odds** `c = toCall / (pot + toCall)`.
2. If facing a bet:
   - `p < c − 0.05` → **fold** (call is −EV).
   - `c − 0.05 ≤ p < 0.65` → **call**.
   - `p ≥ 0.65` → **raise** if raises remain, else **call**.
3. If no bet faces the AI (can check):
   - `p ≥ 0.60` → **bet** (value).
   - `0.35 ≤ p < 0.60` → **check**.
   - `p < 0.35` → **check**, but **bluff-bet** with fixed probability 0.15
     (deterministic via a seeded RNG so games are reproducible for tests).
4. Blind defense and last-to-act adjustments: in the big blind the fold threshold
   is loosened by 0.05 (already invested); on the button it is tightened by 0.05.

These constants are tuning knobs, not rules; Milestone 2 difficulty settings vary
them (a "tight" AI never bluffs and raises only at `p ≥ 0.75`; a "loose" AI bets
at `p ≥ 0.5` and bluffs at 0.30).

## 9. Round-length target

- One hand: **30–60 seconds** (four quick betting rounds, most hands end before
  the river).
- A full heads-up match: **3–5 minutes**, guaranteed by the blind schedule
  (big blind doubles every 6 hands; a 100-chip stack at 1/2 blinds is gone in
  well under 40 hands even with cautious play).
- Tuning levers if playtests run long/short: starting stack, blind step size, and
  blind escalation frequency — never the ranking table.

## 10. MVP scope (informative — for the roadmap update)

The pivot enlarges the build versus push-your-luck; the engine now needs a full
betting model. Smallest playable slice, in order:

1. **7-dice combination evaluator + comparator** (pure, exhaustively testable
   against the §5 table and §6 tie-breaks).
2. **Hand state machine**: blinds, four streets, board reveal, showdown, pot
   award, button/blind rotation.
3. **Betting engine**: fixed-limit actions, bet-matching, all-in/side-pot,
   round-closing logic.
4. **AI opponent** (§8), with exact equity enumeration.
5. **Heads-up UI**: your 2 dice, the board, pot, chip stacks, action buttons,
   reveal + result. No online multiplayer, accounts, or persistence in MVP.

Recommend deferring 3+ player tables and no-limit betting to a later milestone;
heads-up fixed-limit proves the fun with the least surface area.

## 11. Engine test checklist (derived from these rules)

- **Evaluator:** each of the 15 categories from a hand-crafted 7-dice roll;
  Trips-with-a-5-run classified as Trips (not straight); 1-2-3-4-5-6-x is a
  6-Straight; a hand matching two categories takes the higher rank.
- **Comparator / tie-breaks:** higher trips wins a Full-House clash; kicker
  decides otherwise-equal hands; fully-equal hands split; odd-chip rule.
- **Probabilities (property test):** brute-force all 279,936 rolls, assert the
  best-category counts match §5 exactly and the ranking is inversion-free.
- **Betting engine:** fold-to-one-player ends the hand; check only legal with no
  bet facing; call/raise matching; round closes when all matched; blinds posted;
  heads-up button-posts-small-blind and acts-first-preflop; all-in creates a
  correct side pot; blind escalation schedule.
- **AI:** each branch of §8 (fold/call/raise/bet/check/bluff) fires at the right
  `p` and pot odds; equity enumeration returns exact known values for fixed
  boards; seeded bluffing is reproducible.
- **Match:** button/blinds rotate correctly; a player at 0 chips is eliminated;
  last player standing wins.

## 12. Open product questions (CEO)

1. **Betting model:** MVP is **fixed-limit** heads-up (simplest to build and to
   make the AI competent). Is that acceptable, or do you specifically want
   **no-limit** ("faire tapis"/all-in shoves) in the MVP for the poker feel?
2. **Blind/stack numbers:** 100-chip stacks, 1/2 blinds doubling every 6 hands
   are placeholder values tuned for a ~5-minute match. Want different starting
   stakes or a fixed number of hands instead of play-until-broke?
3. **Bluffing AI:** the AI bluffs 15% when weak so the game isn't purely
   mechanical. Keep bluffing in the MVP, or ship a straightforward value-only AI
   first and add bluffing as a difficulty tier?
4. **Table size:** MVP is heads-up (1v1). Confirm multiplayer tables (3–8, and
   the online play the source rules imply) stay in a later milestone.
