import type { MechanicMeta } from '../../grammar/ports';

export const potMeta: MechanicMeta = {
  id: 'pot',
  name: 'Pot',
  teach: 'A pot of points grows every turn until someone wins it.',
  tip: 'Let others fight over it while it grows.',
  roles: ['stakes', 'score'],
  provides: [
    { type: 'prize' },
    { type: 'points' },
    { type: ['win', 'lose', 'tie'], optional: true },
  ],
  consumes: [{ type: 'number', use: 'strength', required: true }],
  hooks: ['turnStart', 'onWin', 'turnEnd'],
  input: null,
  // One prize a turn, so on its own it gives players nothing to decide (R7).
  multiplePrizes: false,
  conflicts: [],
  priority: 30,
};
