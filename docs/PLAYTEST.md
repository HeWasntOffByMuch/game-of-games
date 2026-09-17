# Running a playtest

The prototype exists to answer questions a specification cannot. Everything below
is about getting honest answers out of a table of people in about half an hour.

## Setting up

Open **https://hewasntoffbymuch.github.io/game-of-games/** on one laptop. That is
the whole setup - it is deployed from `main` on every push.

To run it from a checkout instead:

```
npm install
npm run dev
```

One laptop, 3-4 players sitting round it, someone facilitating. 2-6 works; 3-4 is
the sweet spot for the first sessions.

On the setup screen: put in real names, choose a round length (8 turns is the
default), and pick a game to start with. Any listed opener holds together
structurally - which is not the same as being interesting. Finding out which ones
*are* interesting is the whole point of the session.

Some openers are marked "Played better with 3+ so far". That is a note from an
earlier playtest, not a rule: you can still play them with two, and if they are
fine with two we want to know.

**The first session was 2 players. What we most need now is 3 and 4.** Bidding and
Lowest Wins both went narrow with two players, and the guess is that they need
several opponents to reason about. Play the same game at two counts if you can.

Good openers to start from:

| Opener | Becomes |
|---|---|
| Dice + Market + Three of a Kind | add Reroll, then Lowest Wins, for "Just Enough" |
| Pot + Bidding | add Lowest Wins, for lowest-unique-bid |

Dice now rolls two and asks which one you commit, with the prices in view. Watch
whether that choice is ever genuinely hard, or whether the bigger die is just
always right.

## Running a round

1. **Teach.** Read the house rules aloud once, at the start of the session only.
   Then read the game's cards. Do not explain more than the cards say - if the
   cards are not enough, that is a finding.
2. **Play.** The laptop goes round the table. Each player taps "I'm <name>",
   makes their choice privately, and locks it in. Then everyone watches the
   reveal together.
3. **Reveal.** Let people react before moving on. The cancelled-tie line is
   usually where the game teaches itself.
4. **Result.** Two optional taps: was it fun, and did the rules make sense.
5. **Change the game.** Show the options, let the table argue, pick one. Read
   only the NEW/GONE/CHANGED card, then play again.

"Call time" ends a round early. Use it if the table is bored - and write down
that you used it.

## What to watch for

Do not ask these as questions. Watch for them.

- **Is there a decision at all?** The sharpest finding from the first session was
  that a game can be valid, connected, clear and reproducible and still have
  nothing to decide. If a player's choice is obvious every turn, say so - that is
  the most useful thing you can write down.
- **Did they understand it?** Count how often someone asks "wait, what happens
  if…" on the first turn. Note which rule it was about.
- **Do the mechanics feel connected?** Listen for people talking about one
  mechanic in terms of another ("if I take the Moon I can't afford…"). If each
  mechanic is discussed on its own, the composition is not landing.
- **Is there an "oh, now the strategy changes" moment?** After a mutation, does
  anyone visibly rethink? Adding Lowest Wins to a Market game is the strongest
  test we have.
- **Does tie cancellation give the games an identity?** Or does every game start
  to feel like the same game of avoiding other people's numbers? This is the one
  we are least sure about.
- **Is choosing the mutation fun in itself?** Does the table enjoy the argument,
  or do they want to get back to playing?
- **How long is a round really?** The log records it. A hot-seat round will be
  longer than the two minutes v3 wants, because the laptop has to go round - note
  whether it *felt* too long, which is the part that matters. Do not read "that
  game ended quickly" as "that game was well paced": a short game with nothing to
  decide is just short.
- **Does the vocabulary stick?** By the third game, is anyone still re-reading
  the Market card?

## The log

**One log covers the whole sitting.** It keeps accumulating across rounds,
mutations, different games and changes of player count, and it survives a page
refresh. Play as many games as you like in one go, then download once at the end.

It is on the setup screen, which is where you pass through between games. It
tells you how much it holds ("2 games, 5 rounds, 34 turns recorded so far").

- **Download** saves everything so far and *does not* clear it.
- **Clear** is separate and asks twice. It is the only thing that empties the log.

Nothing is analysed automatically, on purpose. v3 describes a large simulation and
materiality system; we are not building it until playtests tell us what is worth
measuring (`docs/DECISIONS.md`, D2). Read the log alongside your notes.

The file is JSON lines, one event per line, in the order things happened:

| Event | Carries |
|---|---|
| `sessionStart` | when the sitting began |
| `gameStart` | game id, mechanics, player count and names, turn cap, recommended players |
| `roundStart` | round id, the mechanics for *this* round, the seed, and the mutation that produced it |
| `turn` | every player's prepare and commit answers, their number, what they went for, the frame's own events, standings, and how long the turn took |
| `roundEnd` | turns played, real duration, why it ended, standings, winners |
| `mutation` | the operator, what went in and out, and the rule delta taught |
| `rating` | the fun and clarity taps, against the round they were given for |
| `gameEnd` | the group left this game for a different one |

Every event has `seq`, `at` and `sessionId`; everything inside a game shares a
`gameId`, and everything inside a round shares a `roundId`, so it all regroups
afterwards.

```json
{"seq":14,"at":"2026-09-17T19:42:03.000Z","sessionId":"20260917T194","t":"turn","gameId":"g1","roundId":"g1r2","turn":3,
 "durationMs":31000,"players":[{"player":"p1","name":"Ada","prepare":{"reroll":false,"dice":3},"commit":{},
 "prize":"t3p1","prizeLabel":"Star","strength":3,"points":5}],"events":[…],"standings":[…]}
```

## Afterwards

Write down, per session:

- which game people asked to play again,
- which rule needed explaining beyond its card,
- any moment somebody laughed or groaned,
- anything that felt broken or pointless.

Those notes decide what gets built next. Numbers from the log are supporting
evidence, not the verdict.

## Checking a combination outside a playtest

```
npm run play -- dice,market,threeOfAKind --players 4 --seed abc --turns 8
npm run play -- pot,bidding,lowestWins --players 4 --policy random
```

It prints the assembled rules and the whole event log. An invalid combination
prints why, and which mechanic would fix it.
