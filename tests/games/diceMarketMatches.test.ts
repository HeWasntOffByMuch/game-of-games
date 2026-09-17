import { describe, expect, it } from 'vitest';
import { assembleOrThrow } from '../../src/assembler/assemble';
import { mechanicEdges } from '../../src/grammar/edges';
import { CATALOGUE } from '../../src/mechanics/catalogue';
import { createGame } from '../../src/game/createGame';
import { formatLog } from '../../src/game/format';
import { cheapestReachable, collector, dearestReachable, playGame } from './play';

const IDS = ['dice', 'market', 'threeOfAKind'];

const PLAYERS = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Bo' },
  { id: 'p3', name: 'Cy' },
];

const COLLECTING = collector({ p1: 'Moon', p2: 'Star', p3: 'Leaf' });

describe('Dice Market Matches', () => {
  describe('composition', () => {
    it('assembles into the chain v3 describes', () => {
      const game = assembleOrThrow(IDS, CATALOGUE);
      const between = mechanicEdges(game.edges).map((e) => `${e.from}->${e.to} ${e.label}`);
      expect(between).toEqual([
        'dice->market number: strength + price',
        'market->threeOfAKind card: spend',
      ]);
      expect(game.edges.some((e) => e.from === 'threeOfAKind' && e.to === 'Ranking')).toBe(true);
    });

    it('covers every structural role', () => {
      expect(assembleOrThrow(IDS, CATALOGUE).roles).toEqual({
        stakes: ['market'],
        contest: ['dice'],
        score: ['threeOfAKind'],
      });
    });

    it('generates the teach text from v3 Worked Example 1', () => {
      const game = assembleOrThrow(IDS, CATALOGUE);
      expect(game.teach).toEqual([
        {
          mechanic: 'dice',
          heading: 'DICE',
          // No connection line: the teach line already says "your number".
          teach: 'Roll two dice. Choose one as your number.',
        },
        {
          mechanic: 'market',
          heading: 'MARKET',
          teach: "Cards for sale each turn. Your number must reach a card's price.",
        },
        {
          mechanic: 'threeOfAKind',
          heading: 'THREE OF A KIND',
          teach: 'Three matching symbols score 5 points, then go back.',
          connection: 'Cards come from the Market.',
        },
      ]);
    });

    it('fits the opener teach budget', () => {
      const { budget } = assembleOrThrow(IDS, CATALOGUE);
      expect(budget.lines).toBeLessThanOrEqual(6);
      expect(budget.words).toBeLessThanOrEqual(60);
    });

    it('is rejected without a mechanic that uses the cards', () => {
      const result = assembleOrThrow.bind(null, ['dice', 'market'], CATALOGUE);
      expect(result).toThrow(/R2: market.card has no consumer/);
      expect(result).toThrow(/threeOfAKind/);
    });
  });

  describe('play', () => {
    it('never lets a claim below the price win', () => {
      const { round } = playGame(
        { seed: 'gate', ids: IDS, players: PLAYERS, maxTurns: 8 },
        dearestReachable,
      );
      const prizes = new Map(round.log.ofType('prizeOffered').map((e) => [e.prize.id, e.prize]));
      for (const win of round.log.ofType('win')) {
        const prize = prizes.get(win.prize);
        expect(win.strength).toBeGreaterThanOrEqual(prize?.minStrength ?? 0);
      }
      for (const drop of round.log.ofType('claimDropped')) {
        if (drop.reason !== 'belowRequirement') continue;
        expect(drop.strength).toBeLessThan(prizes.get(drop.prize)?.minStrength ?? 0);
      }
    });

    it('gives the card to the winner, and only the winner', () => {
      const { round } = playGame(
        { seed: 'cards', ids: IDS, players: PLAYERS, maxTurns: 8 },
        cheapestReachable,
      );
      const wins = round.log.ofType('win');
      const gains = round.log.ofType('cardGained');
      expect(gains).toHaveLength(wins.length);
      for (const gain of gains) {
        expect(wins.some((win) => win.player === gain.player && win.turn === gain.turn)).toBe(true);
      }
    });

    it('scores 5 for three matching symbols and takes the cards back', () => {
      const { round } = playGame(
        { seed: 'matches', ids: IDS, players: PLAYERS, maxTurns: 10 },
        COLLECTING,
      );
      const scores = round.log.ofType('points');
      expect(scores.length).toBeGreaterThan(0);
      for (const score of scores) {
        expect(score.source).toBe('threeOfAKind');
        expect(score.delta).toBe(5);
      }
      for (const spend of round.log.ofType('cardsSpent')) {
        expect(spend.cards).toHaveLength(3);
        expect(new Set(spend.cards.map((c) => c.symbol)).size).toBe(1);
      }
    });

    it('never leaves a completed match sitting in a hand', () => {
      const { round } = playGame(
        { seed: 'hands', ids: IDS, players: PLAYERS, maxTurns: 10 },
        COLLECTING,
      );
      for (const player of round.players) {
        const counts = new Map<string, number>();
        for (const card of player.cards) counts.set(card.symbol, (counts.get(card.symbol) ?? 0) + 1);
        for (const count of counts.values()) expect(count).toBeLessThan(3);
      }
    });

    it('cancels tied totals rather than breaking the tie', () => {
      // Everyone chasing the cheapest card collides constantly.
      const { round } = playGame(
        { seed: 'ties', ids: IDS, players: PLAYERS, maxTurns: 12 },
        cheapestReachable,
      );
      const cancelled = round.log.ofType('tieCancelled');
      expect(cancelled.length).toBeGreaterThan(0);
      for (const tie of cancelled) {
        expect(tie.players.length).toBeGreaterThan(1);
        const winner = round.log
          .ofType('win')
          .find((w) => w.prize === tie.prize && w.turn === tie.turn);
        expect(winner?.strength).not.toBe(tie.strength);
      }
    });

    it('is deterministic for the same seed and inputs', () => {
      const run = (): string =>
        formatLog(
          playGame({ seed: 'determinism', ids: IDS, players: PLAYERS, maxTurns: 8 }, cheapestReachable)
            .round.log.all(),
        );
      expect(run()).toEqual(run());
    });

    it('produces a different game from a different seed', () => {
      const one = formatLog(
        playGame({ seed: 'a', ids: IDS, players: PLAYERS, maxTurns: 8 }, cheapestReachable).round.log.all(),
      );
      const two = formatLog(
        playGame({ seed: 'b', ids: IDS, players: PLAYERS, maxTurns: 8 }, cheapestReachable).round.log.all(),
      );
      expect(one).not.toEqual(two);
    });

    it('plays out exactly as recorded', () => {
      const { round } = playGame(
        { seed: 'golden-1', ids: IDS, players: PLAYERS, maxTurns: 6 },
        cheapestReachable,
      );
      expect(formatLog(round.log.all())).toMatchSnapshot();
    });
  });
});
