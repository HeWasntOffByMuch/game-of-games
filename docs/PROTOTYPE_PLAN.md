# House Rules — Prototype Implementation Plan (P0)

**Status:** for review. No implementation starts until this is approved.

**Reference:** `house-rules-spec-v3.md` (design reference, not a backlog).

## 1. What this phase is for

One hypothesis, tested by humans:

> Can small, familiar mechanics combine into surprising, understandable, strategically
> interesting ~2-minute games, and is it fun to mutate those games between rounds?

Milestone: **on one computer, several local players select mechanics, read the resulting
rules, play a short game, see the result, add or replace one mechanic, understand the rule
delta, and immediately play again.**

Success is playtest evidence, not spec coverage.

## 2. Scope

### 2.1 Three target games (the whole prototype exists to produce these)

| # | Game | Mechanics | What it proves |
|---|---|---|---|
| 1 | Dice Market Matches | `dice` + `market` + `threeOfAKind` | straightforward dependency chain |
| 2 | Just Enough | + `reroll` + `lowestWins` | mutation changes the meaning of existing mechanics |
| 3 | Lowest Unique Bid | `pot` + `bidding` + `lowestWins` | emergence: no mechanic authors "unique bidding" |

Seven mechanics, not sixteen. Everything must fall out of reusable parts — no per-game code.

### 2.2 Ports actually needed

`number`, `points`, `card`, `prize`, `win`, `lose`, `tie`, `modifier`.

Deferred (no prototype mechanic uses them): `speed`, `square`, `end`, `info`, `coins`.

### 2.3 Edge types actually needed

`feeds`, `modifies`. **`competes` is deferred** — zero of the three games need it (Pot→Bidding is a
`feeds points{spend}` edge). The edge-kind union stays open so it can be added in one place.

### 2.4 Mechanics deferred

`board`, `secretNumbers`, `quickGrab`, `rent`, `raceTo`, `hearts`, `powerUp`, `jackpot`, `freeze`.

`rent` and `secretNumbers` are the cheapest next additions if playtests want more variety — both use
existing ports and hooks.

### 2.5 Explicitly NOT built (from v3)

Simulation/materiality: simulation matrices, lookahead bots, TipBot, trivial-policy bots,
provenance-share thresholds, decision/outcome influence, neutral stubs, flow share, ablation,
Jensen–Shannon strategy shift, automated moment detection, cohesion reports, auto-tuning,
adaptive sampling, automated quality gates.

Infrastructure: multiplayer networking, WebSocket rooms, reconnection, QR/share codes, Hall of Fame,
production server, scaffolding generators, art/audio, accounts, deployment.

Director machinery: secret ballots, weighted reel, tokens, vetoes, underdog weight, Stars, co-author
credits, Set policies A/B/alternate. The prototype offers a plain list of valid mutations that the
group picks from — enough to test whether mutating is fun.

These stay in v3 as later-stage directions.

## 3. Architecture

Single TypeScript package, strict mode, directories as module boundaries. A monorepo of
`packages/*` buys nothing at this size; the boundaries that matter are enforced by tests.

```
src/
  frame/        rng.ts  state.ts  verbs.ts  events.ts  resolve.ts  pipeline.ts  ranking.ts
  grammar/      ports.ts  combine.ts  edges.ts
  assembler/    assemble.ts  rules.ts  teach.ts  templates.ts
  mechanics/    registry.ts  <id>/{meta.ts, mechanic.ts, strings.ts, params.ts}
  game/         round.ts  session.ts  mutate.ts
  cli/          play.ts            # headless round runner, scripted or random inputs
  ui/           Vite app (hot-seat)
  playtest/     log.ts
tests/          frame/  assembler/  mechanics/  games/  boundaries/
docs/           DECISIONS.md  PROTOTYPE_PLAN.md  PLAYTEST.md
config/         params.ts
```

Guiding rule: an abstraction earns its place if **two or more** of the three games need it.

### 3.1 Frame (always on)

Responsibilities: simultaneous turn structure, prize offers, `pickPrize` (pass always legal), claim
comparison, **tie cancellation**, live points/ranking, default ending, deterministic RNG, event log.

Per-prize resolution, in order:

1. Collect claims.
2. Drop claims failing the prize's `minStrength`, and every claim with strength 0.
3. Sort by strength (direction from the comparison modifier; default highest).
4. Remove **every** group of tied claims.
5. Best remaining claim wins.
6. Emit `win` / `lose` / `tie` events.

Two deliberately small decisions that make the three games work:

- **`Prize { id, kind, payload, value, minStrength? }`.** Market sets `minStrength = price`; Pot does
  not. No general predicate needed, and Lowest Wins + Market ("you still need to reach the price")
  falls out of step 2 running before step 3.
- **Strength 0 never wins.** Covers pass, a bust, and a bid of 0 with one rule.

### 3.2 Deterministic RNG

Seeded PRNG (mulberry32 over a hashed string seed), with `rng.derive(label)` child streams so dice
draws and market offers don't shift each other. Two consumers today, so the abstraction is real.

Contract: `(seed, mechanic ids, params, input stream) → identical event log`.

### 3.3 Runtime ports

Mechanics never import each other; they read and publish through the turn context. Minimal typed
surface rather than a stringly-typed generic bus:

- `numbers` — per-player values, **summed across providers, then modifiers applied** (the grammar's
  combine rule). Used by dice, bidding, reroll, market, lowestWins.
- `points` — additive, live. Used by pot, threeOfAKind, bidding.
- `cards` — per-player collection with `symbol`. Used by market, threeOfAKind.
- `prizes` — union of offers.
- `comparison` — a modifier slot (`highest` | `lowest`).
- events — `win` / `lose` / `tie` / `points` streams.

### 3.4 Hooks

Only the five the prototype uses: `turnStart`, `beforeResolve`, `onWin`, `afterResolve`, `turnEnd`.
Ordering within a hook is by declared `priority`.

Plus a `prepare` input phase that resolves immediately (Reroll must show you the new roll *before*
you pick a card). Deferred: `beforeInput`, `afterInput`, `onLose`, `onTie`, `onScore` hook points —
no prototype mechanic subscribes to them. Tie events are still recorded in the log.

### 3.5 Verbs

`offerPrize`, `gain`, `spend`, `addHolding`, `removeHolding`, `roll`, `setNumber`, `applyModifier`,
`award`, `endRound`. Deferred: `skipTurn`, `loseHeart`, `markOut`, `cancelClaims` (internal to the
frame).

### 3.6 Provenance

Each event records the mechanic that caused it (`source`). Full causal chains are deferred — they
exist to power materiality metrics we are not building. A single `source` tag is enough for the
event log, the rules panel, and tests.

### 3.7 Assembler (static composition only)

Derives edges from port declarations, validates, orders hooks, generates teach text.

Rules kept — each one rejects something a prototype player could actually build:

| Rule | Keeps out |
|---|---|
| R1 required consume has a provider | `pot + threeOfAKind` (no cards), `bidding` with no points source |
| R2 non-optional provide has a consumer | `dice + market` (cards nothing uses) |
| R3 every mechanic reaches Ranking | effects that never touch score |
| R4 graph connected without terminals | parallel games meeting only at the score |
| R5 every mechanic has ≥1 edge | standalone bookkeeping |
| R6 roles covered (`stakes`, `contest`, `score`) | incomplete games |
| R7 a decision exists | games that play themselves |
| R12 2–6 mechanics | overload |

Deferred: R8 (no prototype conflicts; ≤2 inputs/turn never binds), R9 as cycle detection (hook
*ordering* is implemented; cycle checking is not), R10 payoff latency (all prototype mechanics are
latency 0–1), R11 as a hard gate (teach generation and budget counts ship as tests, not a build
gate). `≤1 end` / `≤1 speed` from R6 defer with those ports.

Rejections carry a specific reason string, e.g. `R2: market.card has no consumer (candidates: threeOfAKind)`
— the candidate list is what makes mutation offers possible.

### 3.8 Teach generation

Order = **the order mechanics entered the Set** (opener order, then mutations appended). That single
rule reproduces v3's Example 1, 4 and 5 teach text exactly.

Per mechanic: its teach line, plus at most one connection line from a template registry, omitted when
the teach line already names the connected thing (which is why Market carries no line and Dice does).

Templates needed: dice→strength, bidding→strength, card→threeOfAKind, reroll→dice→market,
lowestWins→market, lowestWins→bidding.

Mutation delta: `NEW:` block (teach + ≤1 connection line), `GONE:` for replace, and the one `CHANGED:`
case the prototype can produce (removing Lowest Wins → "Highest number wins again.").

### 3.9 Ending

Default ending is a **turn cap** (deterministic; default 8–10 turns, tunable). Wall-clock round
duration is displayed and recorded for instrumentation but does not end the round — a hot-seat round
with private commits cannot honour a 120 s cap, and forcing it would corrupt the very measurement we
want. This is a deviation from v3 and is logged.

### 3.10 Local interface

Vite + TypeScript, no UI framework. The engine stays headless; the UI is a pure view over state
snapshots and the event log.

Hidden simultaneous input on one computer is handled by sequential private commits:

1. **Turn start** — public: prizes, scores, whose turn to commit.
2. **Private commit, per player** — that player's roll/points and legal choices only. Reroll resolves
   immediately, then they pick a prize (or pass) and any amount, then Commit clears the panel.
3. **Reveal** — all claims shown, resolution walked through (drops → ties cancelled → winner), points
   update live.

Screens: Setup → Teach → Play → Results → Mutate (list of valid options + delta) → Teach delta → Play.

A headless CLI runs the same rounds with scripted or random inputs, for tests and dev play.

### 3.11 Playtest instrumentation (deliberately thin)

JSON-lines appended in the browser, with a Download Log button. Records: session id, seed, player
count, mechanics per round, mutation operator applied, round wall-clock duration, per-turn durations,
winner and final scores, and optional 👍/👎 plus a 1–5 "did you understand it?" tap.

No automated analysis. Humans read the log.

## 4. Test plan

Behavior and composition, never speculative architecture.

**Frame**
- RNG determinism and stream independence.
- Resolution order: `minStrength` filter and zero-strength drop happen before comparison.
- Tie cancellation: two-way, three-way, two separate tied groups, everyone tied (no winner).
- Lowest-wins flip, including "lowest qualifying above the price wins".
- Live ranking valid after every event; turn-cap ending.

**Grammar / assembler**
- Derived edges for all three games match v3's stated chains.
- Rejections with reasons: `dice+market` (R2), `pot+threeOfAKind` (R1), a parallel-island pair (R4),
  a single-mechanic set (R12), a roles-incomplete set (R6).
- Hook ordering is stable and priority-driven.
- Generated opener text for games 1–3 matches v3's worked examples verbatim; line/word budgets hold.

**Mechanics** (one file each)
- dice: 2d6, deterministic.
- market: offers, price gate, card transfer on win.
- threeOfAKind: scores 5, returns cards to the deck.
- reroll: rerolls once, doubles bust to 0.
- lowestWins: flips comparison only.
- pot: grows when unwon, resets after a win.
- bidding: only the winner pays; bid ≤ points.

**Games (golden, scripted input streams)**
- Each of the three games: fixed seed + fixed inputs → exact expected event log snapshot.
- **Mutation without special-casing:** `assemble([dice,market,3oak])` then `add(reroll)`,
  `add(lowestWins)` produces exactly `assemble([dice,market,3oak,reroll,lowestWins])`.
- **Strategy actually inverts:** the same input stream that wins game 1 loses game 2.
- **Just Enough:** a total exactly equal to the price beats a higher qualifying total; below price
  cannot win at all.
- **Lowest Unique Bid emergence:** bids `[1,1,1,7]` → the 7 takes the pot; `[1,1,2,3]` → the 2 wins;
  all-equal bids → nothing wins and the pot grows. No code mentions uniqueness.

**Boundaries**
- No file under `src/mechanics/<a>/` imports from `src/mechanics/<b>/`.
- No mechanic imports the frame's internal state module.

## 5. Milestones (commit with tests green after each)

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold: pnpm, TS strict, vitest, lint, `docs/DECISIONS.md` | `pnpm test` runs |
| M1 | Frame: rng, state, verbs, events, pipeline, resolution + tie cancel, ranking, ending | frame tests green |
| M2 | Grammar + assembler: ports, combine, edge derivation, rule subset, hook order, teach | assembler tests + rejection fixtures green |
| M3 | `dice`, `market`, `threeOfAKind` → **Dice Market Matches** playable headless | golden log test green |
| M4 | `reroll`, `lowestWins` → **Just Enough** by composition only | mutation + inversion tests green |
| M5 | `pot`, `bidding` → **Lowest Unique Bid** | emergence tests green |
| M6 | Hot-seat browser UI: teach, private commits, reveal, results, mutate | a full human round playable end to end |
| M7 | Playtest log + export + `docs/PLAYTEST.md` facilitator notes | log downloadable, notes written |

M1–M5 are headless and fully testable; M6 is where the hypothesis becomes testable by people.

## 6. Open questions for review

1. **Ending:** turn cap instead of a 120 s wall-clock cap for hot-seat (§3.9). Agreed?
2. **Mutation choice:** a plain shared list, no voting/reel/tokens. Agreed for P0?
3. **Player count for first playtests:** target 3–4. Frame supports 2–6.
4. **Market numbers:** prices hand-tuned against the 2d6 distribution and written in `config/params.ts`,
   not auto-tuned. Expect to change them after the first session.
5. **`competes` edges deferred** (§2.3) — the three games do not produce one.

## 7. What we want to learn (restated, so the prototype is judged against it)

Are the games fun · can players understand a generated game quickly · do mechanics feel like they
interact · does one mutation create an "oh, now the strategy changes" moment · does the vocabulary
get easier with repetition · does tie cancellation give identity or sameness · are ~2-minute rounds
right · is choosing and mutating itself entertaining · which combinations genuinely emerge.

None of these is answered in code.
