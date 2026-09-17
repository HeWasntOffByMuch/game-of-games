# Decisions

Design decisions and deviations from `house-rules-spec-v3.md`, newest section last.
v3 remains the design reference; entries here record what the prototype does instead, and why.

## P0 — prototype phase (pre-implementation)

### D1. Prototype scope is three games, not the catalogue
Seven mechanics (`dice`, `market`, `threeOfAKind`, `reroll`, `lowestWins`, `pot`, `bidding`) instead
of sixteen. They are the minimum that produces Dice Market Matches, Just Enough and Lowest Unique
Bid — a dependency chain, a meaning-changing mutation, and an emergent game.
**Why:** the phase exists to get human playtest evidence, not catalogue coverage.

### D2. No simulation / materiality machinery
Deferred: simulation matrices, lookahead bots, TipBot, trivial-policy bots, neutral stubs, provenance
share, decision influence, outcome influence, flow share, ablation, Jensen–Shannon strategy shift,
automated moment detection, cohesion reports, auto-tuning, adaptive sampling, automated quality gates.
**Why:** v3's thresholds (10% decision influence, 15% outcome influence, …) are design hypotheses.
Building instruments before we know what needs measuring risks measuring the wrong thing precisely.

### D3. Single package, not `packages/*`
One strict-TypeScript project with directories (`src/frame`, `src/grammar`, `src/assembler`,
`src/mechanics/<id>`, …) instead of a pnpm monorepo.
**Why:** the boundary that matters is "mechanics never import each other", which is enforced by a
test, not by package manifests.

### D4. Ports limited to those in use
Implemented: `number`, `points`, `card`, `prize`, `win`, `lose`, `tie`, `modifier`.
Deferred: `speed`, `square`, `end`, and the reserved `info` / `coins`.

### D5. `competes` edges deferred
None of the three target games produces one — Pot → Bidding is `feeds points{spend}`. The edge-kind
union stays open so adding `competes` touches one file.

### D6. Hook points limited to five
`turnStart`, `beforeResolve`, `onWin`, `afterResolve`, `turnEnd`, plus an immediate-resolving
`prepare` input phase (Reroll must show the new roll before the prize pick).
Deferred: `beforeInput`, `afterInput`, `onLose`, `onTie`, `onScore` — no prototype mechanic
subscribes to them. `tie` events are still emitted and logged.

### D7. Validation subset
Kept: R1, R2, R3, R4, R5, R6 (roles only), R7, R12.
Deferred: R8 (no prototype conflicts; the ≤2-inputs rule never binds), R9 as cycle detection (hook
*ordering* is implemented), R10 payoff latency (all prototype mechanics are latency 0–1), R11 as a
build gate (teach budgets ship as tests instead).

### D8. Prize requirements are a `minStrength` field, not a predicate
`Prize { id, kind, payload, value, minStrength? }`; Market sets `minStrength = price`, Pot does not.
**Why:** it is the smallest thing that makes Lowest Wins + Market behave as v3 describes ("you still
need to reach the price"), because the filter runs before the comparison.

### D9. Strength 0 never wins
One rule covers passing, a Reroll bust, and a bid of 0. v3 states this in three separate places.

### D10. Teach order = order of entry into the Set
Opener order first, mutations appended. This single rule reproduces v3's Examples 1, 4 and 5 teach
text verbatim; v3's own examples are not consistent about a role-based ordering.

### D11. Provenance is a single `source` tag, not a causal chain
Each event records the mechanic that caused it. Full chains exist in v3 to power materiality metrics,
which D2 defers.

### D12. Ending is a turn cap, not a 120 s wall clock
Rounds end after a fixed number of turns (default 8–10, tunable). Wall-clock duration is displayed
and recorded but does not end the round.
**Why:** hot-seat play with sequential private commits cannot honour a 120 s cap, and forcing one
would corrupt the round-length measurement the playtest is meant to produce. Whether ~2-minute rounds
are right is an open playtest question, so the prototype measures rather than enforces.

### D13. No voting machinery
Mutations are chosen from a plain list of assembler-validated options. Deferred: secret ballots,
weighted reel, tokens, vetoes, underdog weight, Stars, co-author credits, Set policies A/B/alternate.
**Why:** "is mutating the game fun?" is testable without any of it.

### D14. Hidden simultaneous input becomes sequential private commits
On one computer each player commits in turn on a panel showing only their own information, then all
claims reveal at once.
**Why:** all three games depend on hidden targeting. This preserves the information structure; it
trades away literal simultaneity, which the playtest log will show the cost of.

### D15. Market prices are hand-tuned, not derived
Fixed price table in `config/params.ts`, chosen against the 2d6 distribution. v3 derives them from the
combined number distribution; that requires the simulator deferred in D2.

### D16. No networking, clients, or production infrastructure
Deferred: WebSocket rooms, phone controllers, reconnection, QR joining, share codes, Hall of Fame,
server architecture, scaffolding generators, art/audio, accounts, deployment.
