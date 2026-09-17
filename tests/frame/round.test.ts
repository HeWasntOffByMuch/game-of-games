import { describe, expect, it } from 'vitest';
import { Round, type RoundOptions } from '../../src/frame/round';
import type { GameEvent } from '../../src/frame/events';
import { addAmount, doubler, fixedNumbers, pointPrizes } from './stubs';

const PLAYERS = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Bo' },
  { id: 'p3', name: 'Cy' },
];

function makeRound(over: Partial<RoundOptions> = {}): Round {
  return new Round({
    seed: 'test',
    mechanics: [fixedNumbers, pointPrizes],
    players: PLAYERS,
    params: { fixedNumbers: { values: { p1: 4, p2: 9, p3: 7 } } },
    maxTurns: 3,
    ...over,
  });
}

/** Everyone claims the first prize; strengths come from the stub. */
function playTurn(round: Round, picks: Record<string, string | null>): void {
  for (const player of PLAYERS) {
    round.commit(player.id, { prize: picks[player.id] ?? null, values: {} });
  }
  round.reveal();
}

describe('Round', () => {
  it('opens a turn with prizes offered and numbers published', () => {
    const round = makeRound();
    round.begin();
    expect(round.turn).toBe(1);
    expect(round.phase).toBe('input');
    expect(round.prizes).toHaveLength(1);
    expect(round.specFor('p2').strength).toBe(9);
  });

  it('awards the prize and scores live', () => {
    const round = makeRound();
    round.begin();
    const prizeId = round.prizes[0]!.id;
    playTurn(round, { p1: prizeId, p2: prizeId, p3: prizeId });

    expect(round.players.find((p) => p.id === 'p2')?.points).toBe(3);
    expect(round.standings()[0]).toEqual({ player: 'p2', points: 3, rank: 1 });
  });

  it('records a pass instead of a claim', () => {
    const round = makeRound();
    round.begin();
    const prizeId = round.prizes[0]!.id;
    playTurn(round, { p1: null, p2: prizeId, p3: null });

    const passes = round.log.ofType('pass').map((e) => e.player);
    expect(passes).toEqual(['p1', 'p3']);
    expect(round.log.ofType('claim')).toHaveLength(1);
  });

  it('runs to the turn cap and then ends', () => {
    const round = makeRound({ maxTurns: 3 });
    round.begin();
    for (let turn = 1; turn <= 3; turn += 1) {
      playTurn(round, {});
      round.next();
    }
    expect(round.isOver).toBe(true);
    expect(round.endedBecause).toBe('turnCap');
    expect(round.log.ofType('roundEnd')).toHaveLength(1);
  });

  it('can be stopped early, and is still rankable', () => {
    const round = makeRound();
    round.begin();
    const prizeId = round.prizes[0]!.id;
    playTurn(round, { p2: prizeId });
    round.stop();

    expect(round.isOver).toBe(true);
    expect(round.endedBecause).toBe('stopped');
    expect(round.standings()[0]?.player).toBe('p2');
  });

  it('is deterministic: same seed, same mechanics, same inputs, same log', () => {
    const run = (): readonly GameEvent[] => {
      const round = makeRound();
      round.begin();
      for (let turn = 1; turn <= 3; turn += 1) {
        const prizeId = round.prizes[0]!.id;
        playTurn(round, { p1: prizeId, p2: prizeId, p3: prizeId });
        round.next();
      }
      return round.log.all();
    };
    expect(JSON.stringify(run())).toEqual(JSON.stringify(run()));
  });

  describe('input handling', () => {
    it('applies a prepare choice immediately, so the player sees the result', () => {
      const round = makeRound({ mechanics: [fixedNumbers, doubler, pointPrizes] });
      round.begin();
      expect(round.specFor('p1').strength).toBe(4);
      round.applyPrepare('p1', 'doubler', true);
      expect(round.specFor('p1').strength).toBe(8);
    });

    it('refuses to prepare the same mechanic twice in a turn', () => {
      const round = makeRound({ mechanics: [fixedNumbers, doubler, pointPrizes] });
      round.begin();
      round.applyPrepare('p1', 'doubler', true);
      expect(() => round.applyPrepare('p1', 'doubler', true)).toThrow(/already prepared/);
    });

    it('applies a commit amount to the claim strength', () => {
      const round = makeRound({ mechanics: [fixedNumbers, addAmount, pointPrizes] });
      round.begin();
      const prizeId = round.prizes[0]!.id;
      round.commit('p1', { prize: prizeId, values: { addAmount: 3 } });
      round.commit('p2', { prize: prizeId, values: { addAmount: 0 } });
      round.commit('p3', { prize: null, values: { addAmount: 0 } });
      round.reveal();

      const claims = round.log.ofType('claim');
      expect(claims.find((c) => c.player === 'p1')?.strength).toBe(7);
      expect(claims.find((c) => c.player === 'p2')?.strength).toBe(9);
    });

    it('refuses a second commit from the same player', () => {
      const round = makeRound();
      round.begin();
      round.commit('p1', { prize: null, values: {} });
      expect(() => round.commit('p1', { prize: null, values: {} })).toThrow(/already committed/);
    });

    it('refuses a claim on a prize that is not offered', () => {
      const round = makeRound();
      round.begin();
      expect(() => round.commit('p1', { prize: 'nope', values: {} })).toThrow(/No such prize/);
    });

    it('refuses to reveal while players are still to commit', () => {
      const round = makeRound();
      round.begin();
      round.commit('p1', { prize: null, values: {} });
      expect(round.pendingPlayers()).toEqual(['p2', 'p3']);
      expect(() => round.reveal()).toThrow(/Still waiting on: p2, p3/);
    });
  });

  it('resets prizes, numbers and comparison between turns', () => {
    const round = makeRound();
    round.begin();
    playTurn(round, {});
    round.next();
    expect(round.turn).toBe(2);
    expect(round.prizes).toHaveLength(1);
    expect(round.comparison).toBe('highest');
    expect(round.specFor('p1').strength).toBe(4);
  });

  it('tags every mechanic-caused event with its source', () => {
    const round = makeRound();
    round.begin();
    const prizeId = round.prizes[0]!.id;
    playTurn(round, { p2: prizeId });

    expect(round.log.ofType('prizeOffered')[0]?.source).toBe('pointPrizes');
    expect(round.log.ofType('points')[0]?.source).toBe('pointPrizes');
  });
});
