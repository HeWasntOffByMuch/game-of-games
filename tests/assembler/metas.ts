import type { MechanicMeta } from '../../src/grammar/ports';

/**
 * Synthetic metas that mirror the shape of the real catalogue, so assembler
 * tests exercise the rules rather than any particular game. The real three
 * games are tested against the real catalogue.
 */
export function meta(over: Partial<MechanicMeta> & { id: string }): MechanicMeta {
  return {
    name: over.id,
    teach: 'Teach line.',
    tip: 'Tip line.',
    roles: [],
    provides: [],
    consumes: [],
    hooks: [],
    input: null,
    conflicts: [],
    priority: 0,
    ...over,
  };
}

export const numProvider = meta({
  id: 'numProvider',
  name: 'Numbers',
  roles: ['contest'],
  provides: [{ type: 'number', attrs: { random: true } }],
  priority: 10,
});

export const prizeShop = meta({
  id: 'prizeShop',
  name: 'Shop',
  roles: ['stakes'],
  provides: [
    { type: 'prize' },
    { type: 'card', attrs: { symbol: true } },
    { type: ['win', 'lose', 'tie'], optional: true },
  ],
  consumes: [
    { type: 'number', use: 'strength', required: true },
    { type: 'number', use: 'price', required: true },
  ],
  multiplePrizes: true,
  priority: 30,
});

export const matcher = meta({
  id: 'matcher',
  name: 'Matcher',
  roles: ['score'],
  provides: [{ type: 'points' }],
  consumes: [{ type: 'card', attrs: { symbol: true }, use: 'spend', required: true }],
  priority: 60,
});

export const potLike = meta({
  id: 'potLike',
  name: 'Pot Like',
  roles: ['stakes', 'score'],
  provides: [{ type: 'prize' }, { type: 'points' }, { type: ['win', 'tie'], optional: true }],
  consumes: [{ type: 'number', use: 'strength', required: true }],
  priority: 30,
});

export const bidder = meta({
  id: 'bidder',
  name: 'Bidder',
  roles: ['contest'],
  provides: [{ type: 'number', attrs: { chosen: true, hidden: true } }],
  consumes: [{ type: 'points', use: 'spend', required: true }],
  input: { kind: 'pickAmount', phase: 'commit', hidden: true },
  costlyEntry: true,
  priority: 20,
});

export const redraw = meta({
  id: 'redraw',
  name: 'Redraw',
  provides: [{ type: 'modifier', attrs: { target: 'number' } }],
  consumes: [{ type: 'number', attrs: { random: true }, required: true }],
  input: { kind: 'toggle', phase: 'prepare', hidden: false },
  priority: 40,
});

export const flip = meta({
  id: 'flip',
  name: 'Flip',
  provides: [{ type: 'modifier', attrs: { target: 'comparison' } }],
  consumes: [{ type: 'number', use: 'strength', required: true }],
  onRemoveLine: 'Highest number wins again.',
  priority: 50,
});

/** Provides a prize and points but needs nothing: an island in every game. */
export const island = meta({
  id: 'island',
  name: 'Island',
  roles: ['stakes', 'score'],
  provides: [{ type: 'prize' }, { type: 'points' }],
  multiplePrizes: true,
  priority: 30,
});

export const CATALOGUE: MechanicMeta[] = [
  numProvider,
  prizeShop,
  matcher,
  potLike,
  bidder,
  redraw,
  flip,
  island,
];
