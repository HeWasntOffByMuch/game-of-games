import type { MechanicMeta } from '../../grammar/ports';

export const threeOfAKindMeta: MechanicMeta = {
  id: 'threeOfAKind',
  name: 'Three of a Kind',
  teach: 'Three matching symbols score 5 points, then go back.',
  tip: 'Watch what others collect, and take their third symbol.',
  roles: ['score'],
  provides: [{ type: 'points' }],
  consumes: [{ type: 'card', attrs: { symbol: true }, use: 'spend', required: true }],
  hooks: ['afterResolve'],
  input: null,
  conflicts: [],
  priority: 60,
};
