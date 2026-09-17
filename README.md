# House Rules

Players pick small, familiar mechanics. The game they make together is
whatever those mechanics do when they collide.

This is the prototype for one question:

> Can small, familiar mechanics combine into surprising, understandable,
> strategically interesting ~2-minute games, and is it fun to mutate those
> games between rounds?

It is not an implementation of the full design (`docs/house-rules-spec-v3.md`).
It is the smallest thing that can be put in front of people to find out whether
the idea is fun. What was deliberately left out, and why, is in
`docs/DECISIONS.md`.

## Playing it

The hot-seat app is deployed from `main` on every push:

**https://hewasntoffbymuch.github.io/game-of-games/**

That is all a playtest needs - one laptop, that link, and
`docs/PLAYTEST.md`.

The deploy workflow (`.github/workflows/deploy.yml`) typechecks, tests, builds
and publishes on every push to `main`. It needs Pages switched on once, under
**Settings -> Pages -> Source: GitHub Actions** - `GITHUB_TOKEN` is not allowed
to set that itself.

## Running it locally

```
npm install
npm run dev      # the hot-seat app: several players round one laptop
npm test         # 200+ tests
npm run check    # typecheck + tests
```

`docs/PLAYTEST.md` is the facilitator's guide.

To try a combination without a browser:

```
npm run play -- dice,market,threeOfAKind --players 4 --seed abc
npm run play -- pot,bidding,lowestWins --players 4
```

## The idea in one page

**The Frame** is always on and taught once:

1. Everyone takes their turn at the same time.
2. Pick a prize. Highest number wins it.
3. Tied numbers cancel out. The best one left wins.
4. Most points when the turns run out wins.

**Mechanics** are small rules players choose between. Seven exist so far: Dice,
Market, Three of a Kind, Reroll, Lowest Wins, Pot, Bidding. They never import
each other; they declare what they provide and consume, and the assembler works
out how they connect, rejects combinations that do not, and generates the rules
text.

**The point is what falls out.** Pot + Bidding + Lowest Wins is a
lowest-unique-bid game, and nothing in the catalogue mentions uniqueness:

- Lowest Wins makes bids cheap,
- the Frame's tie cancellation makes the obvious bid of 1 self-defeating,
- the growing Pot punishes crowding,
- Bidding's cost stops players simply climbing.

Or add Lowest Wins to a Market game, and the price stops being a hurdle and
becomes a target - because the Frame filters by requirement before it compares.

## Layout

```
src/frame/       turn pipeline, resolution, tie cancellation, ranking, seeded rng
src/grammar/     port types, edge derivation
src/assembler/   validation rules, hook order, teach text
src/mechanics/   one folder each; they never import one another
src/game/        assembling and running a round, mutations, autoplay
src/ui/          the hot-seat app
src/playtest/    the round log
docs/            DECISIONS.md, PLAYTEST.md, PROTOTYPE_PLAN.md, the v3 spec
```
