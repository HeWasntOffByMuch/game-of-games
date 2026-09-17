import { describe, expect, it } from 'vitest';
import { Round } from '../../src/frame/round';
import type { AnyMechanic } from '../../src/frame/mechanic';
import { dice } from '../../src/mechanics/dice';
import { reroll } from '../../src/mechanics/reroll';
import { pointPrizes } from '../frame/stubs';

const PLAYERS = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Bo' },
];

function round(seed = 'dice', mechanics: AnyMechanic[] = [dice, pointPrizes]): Round {
  const game = new Round({ seed, mechanics, players: PLAYERS, maxTurns: 1 });
  game.begin();
  return game;
}

function faces(game: Round, player = 'p1'): number[] {
  return game.specFor(player).prepare.find((f) => f.mechanic === 'dice')?.choices?.map((c) => c.value) ?? [];
}

describe('Dice', () => {
  it('rolls, but the roll is not yet a number', () => {
    const game = round();
    expect(faces(game)).toHaveLength(2);
    expect(game.specFor('p1').strength).toBe(0);
  });

  it('offers both faces as a choice', () => {
    const game = round();
    const field = game.specFor('p1').prepare[0];
    expect(field).toMatchObject({ mechanic: 'dice', kind: 'pickOne', enabled: true });
    expect(field?.choices?.map((c) => c.label)).toEqual(faces(game).map(String));
  });

  it('commits the face the player picks, high or low', () => {
    const high = round();
    const [a, b] = faces(high);
    high.applyPrepare('p1', 'dice', Math.max(a as number, b as number));
    expect(high.specFor('p1').strength).toBe(Math.max(a as number, b as number));

    const low = round();
    const [c, d] = faces(low);
    low.applyPrepare('p1', 'dice', Math.min(c as number, d as number));
    expect(low.specFor('p1').strength).toBe(Math.min(c as number, d as number));
  });

  it('refuses a face that was not rolled', () => {
    const game = round();
    expect(() => game.applyPrepare('p1', 'dice', 99)).toThrow(/not one of/);
  });

  it('sits a player out who never chooses', () => {
    const game = round();
    const prize = game.prizes[0]!.id;
    for (const player of PLAYERS) game.commit(player.id, { prize, values: {} });
    game.reveal();
    expect(game.log.ofType('claimDropped').map((d) => d.reason)).toEqual(['zero', 'zero']);
    expect(game.log.ofType('win')).toHaveLength(0);
  });

  it('rolls a fresh pair each turn', () => {
    const game = new Round({ seed: 'turns', mechanics: [dice, pointPrizes], players: PLAYERS, maxTurns: 3 });
    game.begin();
    const seen: string[] = [];
    for (let turn = 1; turn <= 3; turn += 1) {
      seen.push(faces(game).join(','));
      for (const player of PLAYERS) {
        game.applyPrepare(player.id, 'dice', faces(game, player.id)[0] as number);
        game.commit(player.id, { prize: game.prizes[0]!.id, values: {} });
      }
      game.reveal();
      game.next();
    }
    expect(new Set(seen).size).toBeGreaterThan(1);
  });

  describe('with Reroll', () => {
    it('is asked after Reroll, because a reroll replaces the dice on offer', () => {
      const game = round('order', [dice, reroll, pointPrizes]);
      expect(game.specFor('p1').prepare.map((f) => f.mechanic)).toEqual(['reroll', 'dice']);
    });

    it('offers the new faces once rerolled', () => {
      const game = round('redraw', [dice, reroll, pointPrizes]);
      const before = faces(game);
      game.applyPrepare('p1', 'reroll', true);
      const after = faces(game);
      expect(after).toHaveLength(2);
      // The choice is still open, on whatever came up.
      expect(game.specFor('p1').strength).toBe(0);
      game.applyPrepare('p1', 'dice', after[0] as number);
      expect(game.specFor('p1').strength).toBe(after[0]);
      expect(before.join()).not.toBe('');
    });

    it('stops asking which die when a reroll busts', () => {
      // Seeded so p1's reroll comes up doubles.
      let game = round('b0', [dice, reroll, pointPrizes]);
      let attempt = 0;
      while (attempt < 60) {
        game.applyPrepare('p1', 'reroll', true);
        if (game.numbers.isOverridden('p1')) break;
        attempt += 1;
        game = round(`b${attempt}`, [dice, reroll, pointPrizes]);
      }
      expect(game.numbers.isOverridden('p1')).toBe(true);
      expect(game.specFor('p1').prepare.find((f) => f.mechanic === 'dice')).toMatchObject({
        enabled: false,
        note: 'Busted',
      });
      expect(game.specFor('p1').strength).toBe(0);
    });
  });
});
