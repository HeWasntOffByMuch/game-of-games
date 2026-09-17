import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/frame/rng';

describe('rng', () => {
  it('is reproducible from the seed', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-1');
    const drawsA = Array.from({ length: 20 }, () => a.int(1, 6));
    const drawsB = Array.from({ length: 20 }, () => b.int(1, 6));
    expect(drawsA).toEqual(drawsB);
  });

  it('gives different sequences for different seeds', () => {
    const a = Array.from({ length: 20 }, (_, i) => createRng('seed-1').derive(`s${i}`).int(1, 1000));
    const b = Array.from({ length: 20 }, (_, i) => createRng('seed-2').derive(`s${i}`).int(1, 1000));
    expect(a).not.toEqual(b);
  });

  it('derives independent streams, so one mechanic cannot shift another', () => {
    const root = createRng('seed-1');
    const diceOnly = root.derive('dice');
    const before = Array.from({ length: 10 }, () => diceOnly.int(1, 6));

    // Same seed, but a second mechanic draws in between.
    const root2 = createRng('seed-1');
    const dice2 = root2.derive('dice');
    const market = root2.derive('market');
    const after: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      market.int(1, 100);
      after.push(dice2.int(1, 6));
    }

    expect(after).toEqual(before);
  });

  it('stays inside its bounds', () => {
    const rng = createRng('bounds');
    for (let i = 0; i < 500; i += 1) {
      const value = rng.int(2, 5);
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThanOrEqual(5);
    }
  });

  it('refuses an empty range or an empty pick', () => {
    const rng = createRng('errors');
    expect(() => rng.int(3, 2)).toThrow(/empty range/);
    expect(() => rng.pick([])).toThrow(/empty array/);
  });
});
