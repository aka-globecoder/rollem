# Roll'Em Rules Review — Combination Ranking & Feasibility

Owner: CTO. Reviewing the CEO's attachments on ROL-2: `Roll_Em.htm` (game rules,
Hold'em-style dice poker) and `Combinaisons_Roll_Em.csv` (16 ranked combinations).
Last updated: 2026-07-07.

**Scope of the game as described:** each player holds 2 hidden dice; betting rounds
with blinds; a 5-die community board dealt as flop (3) / turn (1) / river (1);
showdown compares combinations over the player's 7 dice (2 hand + 5 board), with
kickers and face-value ordering (6 high) breaking ties within a category.

**Method:** exhaustive enumeration of all 6⁷ = 279,936 equally-likely 7-dice
outcomes, classifying each by the CSV's own definitions (multiplicity patterns
over all 7 dice; straights = "at least k consecutive faces present"). A hand's
final category is the highest-ranked category it contains. Probabilities below
are exact, not simulated. (The shared board correlates *players* with each
other, but one player's 7 dice are still 7 fair independent d6, so single-hand
category frequencies are unaffected.)

---

## 1. Verdict on the two questions asked

**"Is the rank order correct?" — No.** Measured against the poker principle
that rarer hands must outrank more common ones, 28 of the 120 category pairs in
the CSV are ranked backwards. Headline errors:

| CSV says | Reality |
|---|---|
| 4-Straight is rank 1 (weakest) | As ranked, it can **never win**: 7 dice always contain at least one pair (7 dice, 6 faces), and every pair-bearing category outranks rank 1. Dead category. |
| Full House at rank 6 | The **single most common** 7-dice hand: 27.0% of all rolls have the 3+2+1+1 pattern. It must be the *weakest* category. |
| Two Pairs at rank 2, Full House 4 ranks above it | Both patterns are *exactly* equally likely (75,600/279,936 each). As final hands, Full House (27.0%) is common-er than Two Pairs (18.0%) because two-pair hands often upgrade to straights. |
| 6-Straight at rank 12, above Four of a Kind (9) | 6-Straight occurs 5.4% — more common than Four of a Kind (4.5%), Big Full (4.5%), and Double Trips (3.0%) that it outranks. |
| Five of a Kind (13) above 4oaK+Trips (11) | Backwards: Five of a Kind is 0.90%, 4oaK+Trips is 0.375% — the "Carré Tierce" is rarer and should rank higher. |

**"Are the combinations possible?" — Yes, all 16.** Every listed combination
is rollable with 7 dice, and every CSV example is valid for its category except
row 1: `2-3 / 4-5-5-5-1` has faces {1,2,3,4,5} — that is a **5-Straight** (plus
trips of 5s), not a 4-Straight. It illustrates a stronger hand than its own row.

Two impossibilities are correctly *omitted* from the list, which is good design:
with 7 dice, "high card" cannot exist (there is always at least a pair), and a
lone pair cannot exist as a hand either — one pair + 5 distinct singles means
all six faces are present, which is automatically a 6-Straight.

Other defects found:

- **The two attachments contradict each other.** The HTML's "Liste des
  combinaisons" is ordered differently from the CSV: e.g. the HTML puts the
  6-Straight ("Straight Max") 7th while the CSV puts it 12th, and Three Pairs
  5th vs the CSV's 3rd. One source of truth is needed; the corrected table
  below supersedes both.
- **Evaluation ambiguity.** The HTML annex says a player may use just one of
  their two hand dice, while the CSV definitions describe the pattern of *all
  7 dice* ("exactly 3 of a kind **+ 4 other dice** that do not form extra
  pairs"). This review follows the CSV (all 7 dice count). If the intent is
  Hold'em-style "best subset" evaluation instead, the probabilities — and
  therefore the ranking — change, and the CSV definitions need rewriting.

## 2. Recommended ranking (Option A): drop the 4-Straight — 15 categories, zero errors

The 4-Straight is the whole problem: 38.4% of all 7-dice hands contain a run of
four, so it is too common to rank anywhere without breaking rarity order
(proven by exhaustive search — see §4). Remove it and a **perfectly
rarity-monotone** ranking exists:

| Rank | Combination | French name | Probability (final hand) |
|-----:|---|---|---:|
| 1 (weakest) | Full House (3+2) | Full | 27.006% |
| 2 | Two Pairs (2+2) | Double paire | 18.004% |
| 3 | Three Pairs (2+2+2) | Triple paire | 13.503% |
| 4 | 5-Straight | 5 Suite | 9.002% |
| 5 | Trips (3) | Brelan | 9.002% (tie) |
| 6 | 6-Straight | 6 Suite | 5.401% |
| 7 | Big Full (3+2+2) | Big Full | 4.501% |
| 8 | Four of a Kind (4) | Carré Court | 4.501% (tie) |
| 9 | 4oaK + Pair (4+2) | Carré Long | 4.501% (tie) |
| 10 | Double Trips (3+3) | Double Brelan | 3.001% |
| 11 | Five of a Kind (5) | Penta Court | 0.900% |
| 12 | 4oaK + Trips (4+3) | Carré Tierce | 0.375% |
| 13 | 5oaK + Pair (5+2) | Penta Long | 0.225% |
| 14 | Six of a Kind (6) | Hexa | 0.075% |
| 15 (strongest) | Seven of a Kind (7) | Max | 0.002% |

Column sums to 100.000% — every possible roll lands in exactly one row.

Notes on the ties (equal probabilities, order fixed by consistency or free):

- **Trips must outrank the 5-Straight.** They are exactly equally likely, but
  only in this order: if the straight ranked higher, trips hands containing a
  5-run would count as straights, making the straight strictly more common
  than Trips — an inversion. Ranked this way, both sit at exactly 9.002%.
- **Big Full, Four of a Kind, 4oaK+Pair are exactly tied** (12,600 outcomes
  each). Their relative order is a free design choice; the order above follows
  player intuition (quad-based hands above the full-house-based one, the
  pair-kicker quad on top).

Selling point for the fun review: with 7 dice the familiar poker hierarchy
flips — a full house is the *floor*, two pairs beats it, and trips beat a
5-straight. Counterintuitive, mathematically bulletproof, and a genuinely
distinct identity for Roll'Em vs. card poker.

## 3. Alternative (Option B): keep all 16 categories — best possible order has 2 flaws

If the 4-Straight must stay, the best achievable order (exhaustive search over
all orderings and all straight-vs-pattern precedence choices) is:

Full House < Three Pairs < Two Pairs < **4-Straight** < 5-Straight < Trips <
6-Straight < Big Full < 4oaK+Pair < Four of a Kind < Double Trips < Five oaK <
4oaK+Trips < 5oaK+Pair < Six oaK < Seven oaK

Two unavoidable inversions, both caused by the 4-Straight (final-hand share
17.1%, more common than the Three Pairs and Two Pairs it outranks). Also note
Three Pairs and Two Pairs must swap relative to the CSV in this variant.

## 4. Why no perfect 16-category order exists

Exhaustive check: every one of the 3⁵ = 243 ways of deciding which straight
beats which pattern was combined with a search over all category orderings
(precedence-constrained assignment, exact minimization of inverted pairs).
Minimum possible inversions with the 4-Straight included: **2**. Without it:
**0** (§2). The intuition: "contains 4 consecutive faces" is true of 38.4% of
all hands — more common than any single pattern except the full house — so it
cannot sit low (everything above a weak category absorbs nothing, leaving it a
17%+ monster mid-table) and cannot sit high (it would outrank far rarer hands).

## 5. Raw pattern probabilities (reference for the engine and future tuning)

Multiplicity patterns over 7 dice (exclusive, before straight upgrades):

| Pattern | Count | Probability |
|---|---:|---:|
| 3+2+1+1 (Full House) | 75,600 | 27.006% |
| 2+2+1+1+1 (Two Pairs) | 75,600 | 27.006% |
| 2+2+2+1 (Three Pairs) | 37,800 | 13.503% |
| 3+1+1+1+1 (Trips) | 25,200 | 9.002% |
| 2+1+1+1+1+1 (lone pair → always a 6-Straight) | 15,120 | 5.401% |
| 3+2+2 (Big Full) | 12,600 | 4.501% |
| 4+2+1 (4oaK+Pair) | 12,600 | 4.501% |
| 4+1+1+1 (Four of a Kind) | 12,600 | 4.501% |
| 3+3+1 (Double Trips) | 8,400 | 3.001% |
| 5+1+1 (Five of a Kind) | 2,520 | 0.900% |
| 4+3 (4oaK+Trips) | 1,050 | 0.375% |
| 5+2 (5oaK+Pair) | 630 | 0.225% |
| 6+1 (Six of a Kind) | 210 | 0.075% |
| 7 (Seven of a Kind) | 6 | 0.002% |

Straight containment: run ≥ 4 in 38.409% of hands, ≥ 5 in 17.404%, = 6 in 5.401%.

## 6. Open product questions (CEO)

1. **Ranking choice:** Option A (15 categories, mathematically perfect —
   recommended) or Option B (all 16, two documented quirks)?
2. **Evaluation semantics:** confirm all 7 dice form the hand (CSV reading,
   assumed here), vs. Hold'em-style best-subset with the "use one or both hand
   dice" rule from the HTML — the latter invalidates these numbers.
3. **Roadmap conflict:** these rules are a *multiplayer betting game* (blinds,
   chips, folding), while ROADMAP.md's Milestone 1 is a *single-player
   push-your-luck* game vs. a simple AI, with multiplayer explicitly deferred
   to Milestone 3. A single-player poker MVP needs a betting AI — a much
   bigger build than the roll/bank heuristic. Pivot the roadmap, or ship the
   push-your-luck MVP first? DESIGN.md currently documents the push-your-luck
   game and is untouched pending this decision.
