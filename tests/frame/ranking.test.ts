import { describe, expect, it } from 'vitest';
import { leaders, rank } from '../../src/frame/ranking';
import type { PlayerState } from '../../src/frame/types';

const player = (id: string, points: number): PlayerState => ({ id, name: id, points, cards: [] });

describe('ranking', () => {
  it('orders by points, highest first', () => {
    const standings = rank([player('a', 3), player('b', 9), player('c', 5)]);
    expect(standings.map((s) => s.player)).toEqual(['b', 'c', 'a']);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it('shares a rank on equal points', () => {
    const standings = rank([player('a', 4), player('b', 4), player('c', 1)]);
    expect(standings.map((s) => s.rank)).toEqual([1, 1, 3]);
  });

  it('reports every leader when the round is drawn', () => {
    expect(leaders([player('a', 4), player('b', 4), player('c', 1)])).toEqual(['a', 'b']);
  });

  it('is valid with no points scored yet', () => {
    expect(rank([player('a', 0), player('b', 0)]).every((s) => s.rank === 1)).toBe(true);
  });
});
