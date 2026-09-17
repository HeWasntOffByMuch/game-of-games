import type { MechanicMeta } from '../../grammar/ports';

export const marketMeta: MechanicMeta = {
  id: 'market',
  name: 'Market',
  teach: "Cards for sale each turn. Your number must reach a card's price.",
  tip: 'Cheap cards nobody wants are free wins.',
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
  hooks: ['turnStart', 'onWin'],
  input: null,
  multiplePrizes: true,
  conflicts: [],
  priority: 30,
};
