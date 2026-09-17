import { describe, expect, it } from 'vitest';
import { resolvePrize } from '../../src/frame/resolve';
import type { Claim, Prize } from '../../src/frame/types';

const prize = (over: Partial<Prize> = {}): Prize => ({
  id: 'p1',
  source: 'test',
  label: 'Prize',
  value: 1,
  payload: { kind: 'points', amount: 1 },
  ...over,
});

const claims = (...pairs: Array<[string, number]>): Claim[] =>
  pairs.map(([player, strength]) => ({ player, prize: 'p1', strength }));

describe('resolution', () => {
  it('gives the prize to the highest claim', () => {
    const result = resolvePrize(prize(), claims(['a', 4], ['b', 9], ['c', 7]), 'highest');
    expect(result.winner?.player).toBe('b');
    expect(result.losers).toEqual(['a', 'c']);
  });

  it('gives the prize to the lowest claim when comparison is flipped', () => {
    const result = resolvePrize(prize(), claims(['a', 4], ['b', 9], ['c', 7]), 'lowest');
    expect(result.winner?.player).toBe('a');
  });

  describe('tie cancellation', () => {
    it('cancels a two-way tie so the next best claim wins', () => {
      const result = resolvePrize(prize(), claims(['a', 10], ['b', 10], ['c', 8]), 'highest');
      expect(result.cancelled).toEqual([{ strength: 10, players: ['a', 'b'] }]);
      expect(result.winner?.player).toBe('c');
    });

    it('cancels a three-way tie', () => {
      const result = resolvePrize(prize(), claims(['a', 5], ['b', 5], ['c', 5], ['d', 2]), 'highest');
      expect(result.cancelled).toEqual([{ strength: 5, players: ['a', 'b', 'c'] }]);
      expect(result.winner?.player).toBe('d');
    });

    it('cancels two separate tied groups independently', () => {
      const result = resolvePrize(
        prize(),
        claims(['a', 9], ['b', 9], ['c', 6], ['d', 6], ['e', 3]),
        'highest',
      );
      expect(result.cancelled).toEqual([
        { strength: 6, players: ['c', 'd'] },
        { strength: 9, players: ['a', 'b'] },
      ]);
      expect(result.winner?.player).toBe('e');
    });

    it('leaves nobody winning when every claim cancels', () => {
      const result = resolvePrize(prize(), claims(['a', 4], ['b', 4]), 'highest');
      expect(result.winner).toBeNull();
      expect(result.noWinnerReason).toBe('allCancelled');
    });

    it('needs no tie-break rule: the winner never depends on claim order', () => {
      const forward = resolvePrize(prize(), claims(['a', 7], ['b', 7], ['c', 5]), 'highest');
      const reversed = resolvePrize(prize(), claims(['c', 5], ['b', 7], ['a', 7]), 'highest');
      expect(forward.winner?.player).toBe(reversed.winner?.player);
    });
  });

  describe('dropped claims', () => {
    it('drops a claim of 0 - pass, bust and a zero bid are all the same rule', () => {
      const result = resolvePrize(prize(), claims(['a', 0], ['b', 3]), 'highest');
      expect(result.dropped).toEqual([
        { claim: { player: 'a', prize: 'p1', strength: 0 }, reason: 'zero' },
      ]);
      expect(result.winner?.player).toBe('b');
    });

    it('drops a claim of 0 even when lowest wins', () => {
      const result = resolvePrize(prize(), claims(['a', 0], ['b', 3]), 'lowest');
      expect(result.winner?.player).toBe('b');
    });

    it('drops claims below the requirement before comparing', () => {
      const result = resolvePrize(prize({ minStrength: 8 }), claims(['a', 7], ['b', 9]), 'highest');
      expect(result.dropped.map((d) => d.reason)).toEqual(['belowRequirement']);
      expect(result.winner?.player).toBe('b');
    });

    it('filters by requirement first, so lowest wins means lowest that still qualifies', () => {
      // This is the whole of "Just Enough": the price is a target, not a hurdle.
      const result = resolvePrize(
        prize({ minStrength: 8 }),
        claims(['a', 6], ['b', 8], ['c', 11]),
        'lowest',
      );
      expect(result.winner?.player).toBe('b');
      expect(result.winner?.strength).toBe(8);
    });

    it('reports when every claim failed the requirement', () => {
      const result = resolvePrize(prize({ minStrength: 10 }), claims(['a', 4], ['b', 5]), 'highest');
      expect(result.winner).toBeNull();
      expect(result.noWinnerReason).toBe('allDropped');
    });

    it('reports when nobody claimed at all', () => {
      const result = resolvePrize(prize(), [], 'highest');
      expect(result.winner).toBeNull();
      expect(result.noWinnerReason).toBe('noClaims');
    });
  });

  it('ignores claims aimed at another prize', () => {
    const other: Claim = { player: 'z', prize: 'p2', strength: 99 };
    const result = resolvePrize(prize(), [...claims(['a', 3]), other], 'highest');
    expect(result.claims).toHaveLength(1);
    expect(result.winner?.player).toBe('a');
  });

  it('emerges as lowest-unique-bid when ties cancel and lowest wins', () => {
    // Nothing here mentions uniqueness. Three players play it safe on 1 and
    // cancel each other out; the only unique bid takes the prize.
    const result = resolvePrize(prize(), claims(['a', 1], ['b', 1], ['c', 1], ['d', 7]), 'lowest');
    expect(result.winner?.player).toBe('d');
    expect(result.winner?.strength).toBe(7);
  });
});
