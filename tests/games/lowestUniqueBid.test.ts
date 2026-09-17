import { describe, expect, it } from 'vitest';
import { assembleOrThrow } from '../../src/assembler/assemble';
import { mechanicEdges } from '../../src/grammar/edges';
import { hasDecision } from '../../src/assembler/rules';
import { CATALOGUE } from '../../src/mechanics/catalogue';
import { createGame } from '../../src/game/createGame';
import { formatLog } from '../../src/game/format';
import type { Round } from '../../src/frame/round';
import { playGame, scripted } from './play';

const IDS = ['pot', 'bidding', 'lowestWins'];

const PLAYERS = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Bo' },
  { id: 'p3', name: 'Cy' },
  { id: 'p4', name: 'Di' },
];

/** Plays one turn with exactly these bids. Everyone starts on 5 points. */
function bidOnce(bids: number[], ids: string[] = IDS): Round {
  const { round } = createGame({ seed: 'bids', ids, players: PLAYERS, maxTurns: 1 });
  round.begin();
  PLAYERS.forEach((player, index) => {
    round.commit(player.id, { prize: null, values: { bidding: bids[index] ?? 0 } });
  });
  round.reveal();
  return round;
}

describe('Lowest Unique Bid', () => {
  describe('composition', () => {
    it('assembles into the loop v3 describes', () => {
      const game = assembleOrThrow(IDS, CATALOGUE);
      const between = mechanicEdges(game.edges).map((e) => `${e.kind} ${e.from}->${e.to} ${e.label}`);
      expect(between).toContain('feeds bidding->pot number: strength');
      expect(between).toContain('feeds pot->bidding points: spend');
      expect(between).toContain('modifies lowestWins->pot prize');
    });

    it('covers stakes and score with the same mechanic', () => {
      expect(assembleOrThrow(IDS, CATALOGUE).roles).toEqual({
        stakes: ['pot'],
        contest: ['bidding'],
        score: ['pot'],
      });
    });

    it('generates the teach text from v3 Worked Example 4', () => {
      const game = assembleOrThrow(IDS, CATALOGUE);
      expect(game.teach).toEqual([
        {
          mechanic: 'pot',
          heading: 'POT',
          teach: 'A pot of points grows every turn until someone wins it.',
        },
        {
          mechanic: 'bidding',
          heading: 'BIDDING',
          teach: 'Secretly bid points. Only the winner pays their bid.',
          connection: 'Your bid is your number.',
        },
        {
          mechanic: 'lowestWins',
          heading: 'LOWEST WINS',
          teach: 'The lowest number wins a prize instead of the highest.',
          connection: 'The lowest bid wins, and still pays.',
        },
      ]);
    });

    it('fits the opener teach budget', () => {
      const { budget } = assembleOrThrow(IDS, CATALOGUE);
      expect(budget.lines).toBeLessThanOrEqual(6);
      expect(budget.words).toBeLessThanOrEqual(60);
    });

    it('is reached from the opener Pot + Bidding by adding Lowest Wins', () => {
      expect(assembleOrThrow(['pot', 'bidding'], CATALOGUE).ids).toEqual(['pot', 'bidding']);
      expect(assembleOrThrow(['pot', 'bidding', 'lowestWins'], CATALOGUE).ids).toEqual(IDS);
    });

    it('is offerable with Dice instead of Bidding, which is not the same as good', () => {
      // Dice now asks which face to commit, so Dice + Pot has a decision and
      // passes every static rule. Whether choosing a die against one growing
      // pot is *interesting* is a question only a playtest answers - passing
      // validation is not evidence of a good game.
      const game = assembleOrThrow(['dice', 'pot'], CATALOGUE);
      expect(game.ids).toEqual(['dice', 'pot']);
      expect(hasDecision(game.metas)).toBe(true);
    });
  });

  describe('emergence: nothing here mentions uniqueness', () => {
    it('has no rule about being unique anywhere in the catalogue', () => {
      const text = CATALOGUE.map((m) => `${m.name} ${m.teach} ${m.tip}`).join(' ').toLowerCase();
      expect(text).not.toContain('uniq');
      expect(text).not.toContain('alone');
      expect(text).not.toContain('only one');
    });

    it('lets the odd bid out take the pot when the safe bids collide', () => {
      // v3's moment: three players play it safe on 1, cancel, and the fourth
      // takes the pot for 4.
      const round = bidOnce([1, 1, 1, 4]);
      expect(round.log.ofType('tieCancelled')[0]).toMatchObject({ strength: 1, players: ['p1', 'p2', 'p3'] });
      expect(round.log.ofType('win')[0]).toMatchObject({ player: 'p4', strength: 4 });
    });

    it('makes the obvious bid of 1 self-defeating', () => {
      const round = bidOnce([1, 1, 2, 3]);
      expect(round.log.ofType('win')[0]).toMatchObject({ player: 'p3', strength: 2 });
    });

    it('rewards the lowest bid nobody else picked', () => {
      const round = bidOnce([5, 4, 3, 2]);
      expect(round.log.ofType('win')[0]?.player).toBe('p4');
    });

    it('grows the pot when every bid cancels', () => {
      const round = bidOnce([2, 2, 3, 3]);
      expect(round.log.ofType('noWinner')[0]?.reason).toBe('allCancelled');
      expect(round.log.ofType('note').at(-1)?.text).toBe('Pot grows to 3');
    });

    it('sits out a bid of 0 rather than handing it the win', () => {
      const round = bidOnce([0, 0, 3, 4]);
      const dropped = round.log.ofType('claimDropped');
      expect(dropped.map((d) => d.player)).toEqual(['p1', 'p2']);
      expect(round.log.ofType('win')[0]?.player).toBe('p3');
    });

    it('goes back to the highest bid winning when Lowest Wins is taken away', () => {
      const round = bidOnce([1, 1, 2, 3], ['pot', 'bidding']);
      expect(round.log.ofType('win')[0]).toMatchObject({ player: 'p4', strength: 3 });
    });
  });

  describe('paying for it', () => {
    it('charges only the winner', () => {
      const round = bidOnce([1, 1, 2, 3]);
      const spends = round.log.ofType('points').filter((e) => e.note === 'bid');
      expect(spends).toHaveLength(1);
      expect(spends[0]).toMatchObject({ player: 'p3', delta: -2 });
    });

    it('can cost more than it pays', () => {
      const round = bidOnce([4, 1, 1, 1]);
      const ada = round.players.find((p) => p.id === 'p1');
      // Started on 5, paid 4 for a pot of 2.
      expect(ada?.points).toBe(3);
    });

    it('never lets a player bid more than they hold', () => {
      const round = bidOnce([99, 1, 1, 1]);
      expect(round.log.ofType('claim').find((c) => c.player === 'p1')?.strength).toBe(5);
    });

    it('offers no bid at all once a player is out of points', () => {
      const { round } = createGame({ seed: 'broke', ids: IDS, players: PLAYERS, maxTurns: 2, params: { bidding: { startingPoints: 0 } } });
      round.begin();
      expect(round.specFor('p1').commit[0]).toMatchObject({ enabled: false, note: 'No points to bid' });
    });
  });

  describe('the pot', () => {
    it('grows by one each turn nobody wins, and resets after a win', () => {
      const { round } = playGame(
        { seed: 'pot', ids: IDS, players: PLAYERS, maxTurns: 4 },
        {
          // Everyone bids the same, so nothing is ever won.
          p1: scripted([{ values: { bidding: 2 } }]),
          p2: scripted([{ values: { bidding: 2 } }]),
          p3: scripted([{ values: { bidding: 2 } }]),
          p4: scripted([{ values: { bidding: 2 } }]),
        },
      );
      const offers = round.log.ofType('prizeOffered').map((e) => e.prize.value);
      expect(offers).toEqual([2, 3, 4, 5]);
    });

    it('plays out exactly as recorded', () => {
      const { round } = playGame(
        { seed: 'golden-3', ids: IDS, players: PLAYERS, maxTurns: 5 },
        {
          p1: scripted([{ values: { bidding: 1 } }, { values: { bidding: 1 } }, { values: { bidding: 3 } }, { values: { bidding: 2 } }, { values: { bidding: 1 } }]),
          p2: scripted([{ values: { bidding: 1 } }, { values: { bidding: 2 } }, { values: { bidding: 3 } }, { values: { bidding: 1 } }, { values: { bidding: 4 } }]),
          p3: scripted([{ values: { bidding: 1 } }, { values: { bidding: 2 } }, { values: { bidding: 1 } }, { values: { bidding: 1 } }, { values: { bidding: 2 } }]),
          p4: scripted([{ values: { bidding: 4 } }, { values: { bidding: 0 } }, { values: { bidding: 2 } }, { values: { bidding: 3 } }, { values: { bidding: 2 } }]),
        },
      );
      expect(formatLog(round.log.all())).toMatchSnapshot();
    });
  });
});
