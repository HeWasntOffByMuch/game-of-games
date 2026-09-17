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

## P0 — decisions made during implementation

These came out of writing and playing the code, not out of planning.

### D17. With one prize, the frame claims it automatically
`pickPrize` only exists when there is more than one prize. With a single prize —
Lowest Unique Bid, for example — entering the contest *is* the mechanic's own input
("0 sits out"), and the frame claims the sole prize for anyone whose number is above 0.
**Why:** playing it showed the double decision was not just redundant but contradictory —
a player could bid 4 and then pass, and the bid did nothing. R7 guarantees a single-prize
game has a mechanic input, so nothing loses its decision.

### D18. Market draws symbols with replacement; there is no finite deck
v3 has matched cards return to the Market deck. The prototype's Market draws from a fixed
symbol set each turn instead, so nothing has to hand cards back.
**Why:** it removes an inter-mechanic dependency (Three of a Kind would have to give cards
to Market) for no loss — the scarcity that matters is within a turn, where three offers
are contested by everyone.

### D19. Market offers three cards, one per symbol, priced 4–10
Three symbols and three offers means every symbol is on sale every turn at a changing price.
**Why:** it makes the denial race legible — you can always see which card someone needs —
and across 40 seeds at 3–4 players it brings first points to a median of turn 4. Checked by
running the headless game, not by the deferred simulator. Expect to change it after the
first session.

### D20. Two number providers teach the combined rule
When a game has both Dice and Bidding, the grammar sums them, so the teach text says
"Your bid adds to your dice" instead of each mechanic claiming to be the number.
**Why:** `Dice out, Bidding in` is a legal mutation from the base game, and without this the
generated rules would have stated something untrue. The connection templates now check
whether a mechanic is the only number provider.

### D21. Prepare choices are settled before the prize picker appears
The UI hides the prize list until every enabled prepare field has been answered.
**Why:** rerolling after picking could leave a player claiming a card they could no longer
reach. It also matches v3's turn description: see your roll, reroll if you dare, then pick a
card you can reach.

### D22. Generated games are named by joining their mechanics
"Dice + Market + Three of a Kind", not a generated name from v3's name fragments.
**Why:** a bad generated name is worse than no name, and naming is not what the first
playtest is testing.

### D23. No automated browser test
The hot-seat UI was verified by driving it in Chromium during development, but the repo
keeps no browser-test dependency. The session state machine and the view functions are
both plain functions, so the flow, the escaping and the disabled states are covered by
ordinary tests.

### D24. `roundEnd` reasons are `turnCap` and `stopped`
v3's ending mechanics are deferred, so the second reason is a facilitator calling time
during a playtest rather than a mechanic ending the round. The playtest log records which.

## P1 — after the first human playtest (2 players)

The playtest found that Dice made games *more random without making them more
interesting*, that Bidding played better because the number itself was a decision,
that Bidding went solvable with only two players, and — most importantly — that a
game can pass every structural check and still contain no interesting decision.

### D25. Dice rolls two dice and the player chooses one
Was: two dice, summed, and the total is your number. Now: roll two, commit one.
**Why:** randomness should perturb decisions, not replace them. A rolled total *is*
the outcome; a rolled pair is a question. Against a price, under Lowest Wins, or
with ties cancelling, the bigger die is frequently the wrong one.
`count` is a parameter, so three dice can be tried without code changes, but two is
the simplest version that creates the choice and is what ships.

### D26. A `pickOne` input kind
`pickAmount`'s min/max cannot express "2 or 5". Added `pickOne` with an explicit
`choices` list. This is the smallest grammar change that lets a random result
become a choice; nothing else about the grammar moved.

### D27. Prepare questions are asked in priority order, and Reroll comes first
Reroll's priority dropped below Dice's. It has no hooks, so priority now only
orders the questions — and rerolling replaces the dice the next question is about.
Autoplay was fixed to re-read the input spec between answers for the same reason;
deciding both answers from one snapshot chose from dice that no longer existed.

### D28. The die choice is made with the prizes in view
The commit panel shows what is on offer, with prices, while the die question is
open. Choosing blind is not the decision we are trying to test.

### D29. Market prices retuned to 2–6
A chosen die is 1–6, not a 2d6 total of 2–12. Checked across 40 seeds at 2, 3 and
4 players: first points land at a median of turn 3–4. Still hand-tuned, still
expected to change.

### D30. Dice teaches itself and needs no connection line
New teach line: "Roll two dice. Choose one as your number." It names "your number"
itself, so the connection template that used to say "Your dice total is your
number." was removed. **This is a deliberate deviation from v3's Worked Examples 1
and 5**, whose teach text no longer matches; the examples describe the old Dice.

### D31. `minRecommendedPlayers` is advice, not a rule
Bidding and Lowest Wins declare 3. The assembler reports the maximum across a
game's mechanics, and the UI shows "Played better with 3+ so far" on openers and
mutation options. It never rejects anything.
**Why:** it records what a playtest found, and says so in those words. It is not a
balance claim, and there is no simulation behind it.

### D32. Passing validation is not evidence of a good game
Because Dice now has an input, `Dice + Pot` satisfies R7 and is offerable — a game
we expect to be thin. That is left as it is, and the test that used to assert the
rejection now asserts the opposite together with the reason. The static rules
answer "does this hold together", never "is this worth playing"; only people
answer the second question.

### D33. Turn options are 6, 8, 10, 12; the 4-turn option is gone
Enough decisions to understand a game matters more than hitting 120 seconds right
now. Duration and turn count are still recorded separately, so pacing can be
optimised once we know which games are worth pacing.

### D34. The playtest log is an append-only event stream for a whole sitting
Was: a list of round records for one game, replaced whenever a new session began.
Now: one accumulating log of timestamped, sequence-numbered events spanning every
game, mutation, player count and restart in a sitting.
**Why:** a sitting is not a list of rounds. Events with ids can be grouped
afterwards; a nested structure cannot be un-nested.
- It survives a page refresh (restored from `localStorage`).
- Nothing in the flow of play clears it — not a round ending, a mutation, a new
  game, returning to setup, or downloading.
- Only an explicit two-tap "Clear" empties it, kept separate from "Download" so a
  mis-click cannot destroy a sitting's evidence.

### D35. Returning to setup without ending the sitting
There was previously no way out of the play loop. "Start a different game" goes
back to setup, which is also how the player count changes mid-sitting. It emits a
`gameEnd` event and keeps the log.
