import { describe, expect, it } from 'vitest';
import { Round } from '../../src/frame/round';
import type { AnyMechanic } from '../../src/frame/mechanic';
import { reroll } from '../../src/mechanics/reroll';
import { fixedChosenNumbers, pointPrizes, scriptedNumbers } from '../frame/stubs';

const PLAYERS = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Bo' },
];

function round(params: Record<string, Record<string, unknown>>, numbers: AnyMechanic = scriptedNumbers): Round {
  const game = new Round({
    seed: 'reroll',
    mechanics: [numbers, reroll, pointPrizes],
    players: PLAYERS,
    params,
    maxTurns: 1,
  });
  game.begin();
  return game;
}

describe('Reroll', () => {
  it('draws again without knowing what produced the number', () => {
    const game = round({
      scriptedNumbers: { values: { p1: 5, p2: 5 }, redraws: { p1: [{ value: 11, parts: [5, 6] }] } },
    });
    expect(game.specFor('p1').strength).toBe(5);
    game.applyPrepare('p1', 'reroll', true);
    expect(game.specFor('p1').strength).toBe(11);
  });

  it('leaves the number alone when the player declines', () => {
    const game = round({
      scriptedNumbers: { values: { p1: 5, p2: 5 }, redraws: { p1: [{ value: 11, parts: [5, 6] }] } },
    });
    game.applyPrepare('p1', 'reroll', false);
    expect(game.specFor('p1').strength).toBe(5);
  });

  it('busts to 0 when every part of the redraw matches', () => {
    const game = round({
      scriptedNumbers: { values: { p1: 5, p2: 5 }, redraws: { p1: [{ value: 8, parts: [4, 4] }] } },
    });
    game.applyPrepare('p1', 'reroll', true);
    expect(game.specFor('p1').strength).toBe(0);
  });

  it('does not bust on a single-part redraw', () => {
    const game = round({
      scriptedNumbers: { values: { p1: 5, p2: 5 }, redraws: { p1: [{ value: 4, parts: [4] }] } },
    });
    game.applyPrepare('p1', 'reroll', true);
    expect(game.specFor('p1').strength).toBe(4);
  });

  it('costs a player the prize when they bust', () => {
    const game = round({
      scriptedNumbers: { values: { p1: 9, p2: 3 }, redraws: { p1: [{ value: 6, parts: [3, 3] }] } },
    });
    game.applyPrepare('p1', 'reroll', true);
    const prize = game.prizes[0]!.id;
    game.commit('p1', { prize, values: {} });
    game.commit('p2', { prize, values: {} });
    game.reveal();

    expect(game.log.ofType('claimDropped')[0]).toMatchObject({ player: 'p1', reason: 'zero' });
    expect(game.log.ofType('win')[0]?.player).toBe('p2');
  });

  it('records the change and the bust in the log', () => {
    const game = round({
      scriptedNumbers: { values: { p1: 9, p2: 3 }, redraws: { p1: [{ value: 6, parts: [3, 3] }] } },
    });
    game.applyPrepare('p1', 'reroll', true);
    const changes = game.log.ofType('numberChanged');
    expect(changes.map((c) => [c.from, c.to, c.note ?? ''])).toEqual([
      [9, 6, ''],
      [6, 0, 'bust'],
    ]);
    expect(changes.every((c) => c.source === 'reroll')).toBe(true);
  });

  it('is offered only when something can actually be redrawn', () => {
    const withRedraw = round({ scriptedNumbers: { values: { p1: 5, p2: 5 }, redraws: {} } });
    expect(withRedraw.specFor('p1').prepare[0]?.enabled).toBe(true);

    const withoutRedraw = round({ fixedChosenNumbers: { values: { p1: 5, p2: 5 } } }, fixedChosenNumbers);
    expect(withoutRedraw.specFor('p1').prepare[0]).toMatchObject({
      enabled: false,
      note: 'Nothing to reroll',
    });
  });

  it('can only be used once a turn', () => {
    const game = round({ scriptedNumbers: { values: { p1: 5, p2: 5 }, redraws: {} } });
    game.applyPrepare('p1', 'reroll', true);
    expect(() => game.applyPrepare('p1', 'reroll', true)).toThrow(/already prepared/);
  });
});
