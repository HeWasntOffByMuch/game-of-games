import { describe, expect, it } from 'vitest';
import { assembleOrThrow } from '../../src/assembler/assemble';
import { teachDelta } from '../../src/assembler/teach';
import { mechanicEdges } from '../../src/grammar/edges';
import { applyMutation, legalMutations } from '../../src/game/mutate';
import { CATALOGUE } from '../../src/mechanics/catalogue';
import { formatLog } from '../../src/game/format';
import type { Policy } from '../../src/game/policies';
import { playGame } from './play';

const BASE = ['dice', 'market', 'threeOfAKind'];
const JUST_ENOUGH = ['dice', 'market', 'threeOfAKind', 'reroll', 'lowestWins'];

const PLAYERS = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Bo' },
  { id: 'p3', name: 'Cy' },
];

/** Everyone goes for the same prize, so comparison decides the winner. */
const claimFirst: Policy = {
  commit: (spec) => ({ prize: spec.prizes[0]?.prize.id ?? null, values: {} }),
};

const neverReroll: Policy = {
  prepare: () => ({ reroll: false }),
  commit: claimFirst.commit,
};

describe('Just Enough', () => {
  describe('reached by mutation, not by special-case code', () => {
    it('is exactly what you get by adding Reroll then Lowest Wins', () => {
      const viaMutation = applyMutation(applyMutation(BASE, { op: 'add', mechanic: 'reroll' }), {
        op: 'add',
        mechanic: 'lowestWins',
      });
      expect(viaMutation).toEqual(JUST_ENOUGH);

      const mutated = assembleOrThrow(viaMutation, CATALOGUE);
      const direct = assembleOrThrow(JUST_ENOUGH, CATALOGUE);
      expect(mutated).toEqual(direct);
    });

    it('offers both additions from the base game', () => {
      const adds = legalMutations(BASE, CATALOGUE)
        .filter((o) => o.mutation.op === 'add')
        .map((o) => o.label);
      expect(adds).toContain('Add Reroll');
      expect(adds).toContain('Add Lowest Wins');
    });

    it('will not offer Reroll where there is no random number to redraw', () => {
      // Nothing in this catalogue provides a chosen-only number yet, so the
      // guard is checked directly: Reroll requires `number{random}`.
      const rerollMeta = CATALOGUE.find((m) => m.id === 'reroll');
      expect(rerollMeta?.consumes).toEqual([
        { type: 'number', attrs: { random: true }, required: true },
      ]);
    });

    it('teaches only the delta when Reroll is added', () => {
      const before = assembleOrThrow(BASE, CATALOGUE);
      const after = assembleOrThrow([...BASE, 'reroll'], CATALOGUE);
      expect(teachDelta(before, after)).toEqual({
        gone: [],
        changed: [],
        added: [
          {
            mechanic: 'reroll',
            heading: 'REROLL',
            teach: 'You may reroll once. Doubles on a reroll bust.',
            connection: "A bust means you can't buy this turn.",
          },
        ],
      });
    });

    it('teaches only the delta when Lowest Wins is added', () => {
      const before = assembleOrThrow([...BASE, 'reroll'], CATALOGUE);
      const after = assembleOrThrow(JUST_ENOUGH, CATALOGUE);
      expect(teachDelta(before, after)).toEqual({
        gone: [],
        changed: [],
        added: [
          {
            mechanic: 'lowestWins',
            heading: 'LOWEST WINS',
            teach: 'The lowest number wins a prize instead of the highest.',
            connection: 'You still need to reach the price.',
          },
        ],
      });
    });

    it('puts the frame rule back when Lowest Wins is taken away', () => {
      const before = assembleOrThrow(JUST_ENOUGH, CATALOGUE);
      const after = assembleOrThrow([...BASE, 'reroll'], CATALOGUE);
      expect(teachDelta(before, after).changed).toEqual(['Highest number wins again.']);
    });

    it('generates the rules strip from v3 Worked Example 5', () => {
      const game = assembleOrThrow(JUST_ENOUGH, CATALOGUE);
      const strip = game.teach.flatMap((block) =>
        block.connection ? [`${block.heading}: ${block.teach}`, block.connection] : [`${block.heading}: ${block.teach}`],
      );
      expect(strip).toEqual([
        'DICE: Everyone rolls two dice at the start of each turn.',
        'Your dice total is your number.',
        "MARKET: Cards for sale each turn. Your number must reach a card's price.",
        'THREE OF A KIND: Three matching symbols score 5 points, then go back.',
        'Cards come from the Market.',
        'REROLL: You may reroll once. Doubles on a reroll bust.',
        "A bust means you can't buy this turn.",
        'LOWEST WINS: The lowest number wins a prize instead of the highest.',
        'You still need to reach the price.',
      ]);
    });

    it('wires the modifiers into the existing chain', () => {
      const game = assembleOrThrow(JUST_ENOUGH, CATALOGUE);
      const between = mechanicEdges(game.edges).map((e) => `${e.kind} ${e.from}->${e.to}`);
      expect(between).toContain('modifies reroll->dice');
      expect(between).toContain('modifies lowestWins->market');
      expect(between).toContain('feeds dice->market');
      expect(between).toContain('feeds market->threeOfAKind');
    });
  });

  describe('the strategy actually inverts', () => {
    const base = { seed: 'inversion', players: PLAYERS, maxTurns: 8 };

    it('rolls identically in both games, because streams are per mechanic', () => {
      const one = playGame({ ...base, ids: BASE }, claimFirst).round.log.ofType('number');
      const two = playGame({ ...base, ids: [...BASE, 'lowestWins'] }, claimFirst).round.log.ofType('number');
      expect(one.map((e) => e.value)).toEqual(two.map((e) => e.value));
    });

    it('hands the same rolls to different winners once Lowest Wins is added', () => {
      const winners = (ids: string[]): string[] =>
        playGame({ ...base, ids }, claimFirst).round.log.ofType('win').map((w) => `${w.turn}:${w.player}`);
      expect(winners(BASE)).not.toEqual(winners([...BASE, 'lowestWins']));
    });

    it('gives the prize to the lowest total that still reaches the price', () => {
      const { round } = playGame({ ...base, ids: JUST_ENOUGH }, neverReroll);
      const prizes = new Map(round.log.ofType('prizeOffered').map((e) => [e.prize.id, e.prize]));

      for (const win of round.log.ofType('win')) {
        const price = prizes.get(win.prize)?.minStrength ?? 0;
        expect(win.strength).toBeGreaterThanOrEqual(price);

        const rivals = round.log
          .ofType('claim')
          .filter((c) => c.prize === win.prize && c.turn === win.turn && c.strength >= price);
        const cancelled = new Set(
          round.log
            .ofType('tieCancelled')
            .filter((t) => t.prize === win.prize && t.turn === win.turn)
            .flatMap((t) => t.players),
        );
        const survivors = rivals.filter((c) => !cancelled.has(c.player));
        expect(win.strength).toBe(Math.min(...survivors.map((c) => c.strength)));
      }
    });

    it('makes a big roll a problem: it wins only when the small ones cancel', () => {
      const { round } = playGame({ ...base, ids: JUST_ENOUGH }, neverReroll);
      const prizes = new Map(round.log.ofType('prizeOffered').map((e) => [e.prize.id, e.prize]));
      let topRollWins = 0;
      let checked = 0;

      for (const win of round.log.ofType('win')) {
        const price = prizes.get(win.prize)?.minStrength ?? 0;
        const qualifying = round.log
          .ofType('claim')
          .filter((c) => c.prize === win.prize && c.turn === win.turn && c.strength >= price);
        if (qualifying.length < 2) continue;
        checked += 1;
        if (win.strength !== Math.max(...qualifying.map((c) => c.strength))) continue;

        // The only way the biggest number takes the prize is that everything
        // below it tied and cancelled. Nothing authored that rule.
        topRollWins += 1;
        const cancelledBelow = round.log
          .ofType('tieCancelled')
          .filter((t) => t.prize === win.prize && t.turn === win.turn && t.strength < win.strength);
        expect(cancelledBelow.length).toBeGreaterThan(0);
      }

      expect(checked).toBeGreaterThan(0);
      expect(topRollWins).toBeGreaterThan(0);
    });
  });

  describe('Reroll in play', () => {
    const base = { seed: 'rerolling', ids: JUST_ENOUGH, players: PLAYERS, maxTurns: 8 };

    it('changes the game when used', () => {
      const never = playGame(base, neverReroll).round.log.ofType('number').map((e) => e.value);
      const always = playGame(base, {
        prepare: () => ({ reroll: true }),
        commit: claimFirst.commit,
      }).round.log.ofType('numberChanged');
      expect(always.length).toBeGreaterThan(0);
      expect(never.length).toBeGreaterThan(0);
    });

    it('busts sometimes, and a bust never wins', () => {
      const { round } = playGame({ ...base, maxTurns: 20 }, {
        prepare: () => ({ reroll: true }),
        commit: claimFirst.commit,
      });
      const busts = round.log.ofType('numberChanged').filter((e) => e.note === 'bust');
      expect(busts.length).toBeGreaterThan(0);
      for (const bust of busts) {
        const win = round.log.ofType('win').find((w) => w.turn === bust.turn && w.player === bust.player);
        expect(win).toBeUndefined();
      }
    });

    it('plays out exactly as recorded', () => {
      const { round } = playGame({ ...base, seed: 'golden-2', maxTurns: 5 }, neverReroll);
      expect(formatLog(round.log.all())).toMatchSnapshot();
    });
  });
});
