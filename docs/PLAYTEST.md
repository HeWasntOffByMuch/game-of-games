# Running a playtest

The prototype exists to answer questions a specification cannot. Everything below
is about getting honest answers out of a table of people in about half an hour.

## Setting up

```
npm install
npm run dev          # opens the hot-seat app
```

One laptop, 3-4 players sitting round it, someone facilitating. 2-6 works; 3-4 is
the sweet spot for the first sessions.

On the setup screen: put in real names, choose a round length (8 turns is the
default; 4 is a good warm-up), and pick a game to start with. Any listed opener
is a valid game - the assembler will not offer one that does not work.

Good openers to start from:

| Opener | Becomes |
|---|---|
| Dice + Market + Three of a Kind | add Reroll, then Lowest Wins, for "Just Enough" |
| Pot + Bidding | add Lowest Wins, for lowest-unique-bid |

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
  longer than the two minutes v3 wants, because the laptop has to go round -
  note whether it *felt* too long, which is the part that matters.
- **Does the vocabulary stick?** By the third game, is anyone still re-reading
  the Market card?

## The log

Every round is recorded: mechanics, the mutation that produced them, turn and
round durations, standings, and the optional ratings. "Download the playtest
log" on the results or change-the-game screen saves it as JSON lines.

Nothing is analysed automatically, on purpose. v3 describes a large
simulation and materiality system; we are not building it until playtests tell
us what is worth measuring (`docs/DECISIONS.md`, D2). Read the log alongside
your notes.

One line per round:

```json
{"sessionId":"20260917T1543","round":2,"mechanics":["dice","market","threeOfAKind","reroll"],
 "gameName":"Dice + Market + Three of a Kind + Reroll","players":4,
 "mutation":{"op":"add","mechanic":"reroll"},"turnsPlayed":8,"endedBecause":"turnCap",
 "durationMs":214000,"turnDurationsMs":[31000,24000],"winners":["p2"],"fun":"up","clarity":4}
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
