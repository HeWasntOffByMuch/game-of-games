import { describe, expect, it } from 'vitest';
import { Round } from '../../src/frame/round';
import { lowestWins } from '../../src/mechanics/lowestWins';
import { fixedChosenNumbers, pointPrizes } from '../frame/stubs';

const PLAYERS = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Bo' },
  { id: 'p3', name: 'Cy' },
];

function play(values: Record<string, number>, withFlip: boolean): Round {
  const game = new Round({
    seed: 'flip',
    mechanics: withFlip ? [fixedChosenNumbers, lowestWins, pointPrizes] : [fixedChosenNumbers, pointPrizes],
    players: PLAYERS,
    params: { fixedChosenNumbers: { values } },
    maxTurns: 1,
  });
  game.begin();
  const prize = game.prizes[0]!.id;
  for (const player of PLAYERS) game.commit(player.id, { prize, values: {} });
  game.reveal();
  return game;
}

describe('Lowest Wins', () => {
  it('hands the prize to the lowest number instead of the highest', () => {
    expect(play({ p1: 4, p2: 9, p3: 7 }, false).log.ofType('win')[0]?.player).toBe('p2');
    expect(play({ p1: 4, p2: 9, p3: 7 }, true).log.ofType('win')[0]?.player).toBe('p1');
  });

  it('still cancels tied numbers first', () => {
    const game = play({ p1: 3, p2: 3, p3: 8 }, true);
    expect(game.log.ofType('tieCancelled')[0]?.players).toEqual(['p1', 'p2']);
    expect(game.log.ofType('win')[0]?.player).toBe('p3');
  });

  it('never lets a number of 0 win, however low it is', () => {
    const game = play({ p1: 0, p2: 6, p3: 9 }, true);
    expect(game.log.ofType('claimDropped')[0]).toMatchObject({ player: 'p1', reason: 'zero' });
    expect(game.log.ofType('win')[0]?.player).toBe('p2');
  });

  it('announces the flip in the log', () => {
    const game = play({ p1: 4, p2: 9, p3: 7 }, true);
    expect(game.log.ofType('comparisonSet')[0]).toMatchObject({
      source: 'lowestWins',
      direction: 'lowest',
    });
  });
});
