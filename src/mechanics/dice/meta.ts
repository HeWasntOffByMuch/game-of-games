import type { MechanicMeta } from '../../grammar/ports';

export const diceMeta: MechanicMeta = {
  id: 'dice',
  name: 'Dice',
  teach: 'Everyone rolls two dice at the start of each turn.',
  tip: 'Aim low rolls at prizes nobody else wants.',
  roles: ['contest'],
  provides: [{ type: 'number', attrs: { random: true } }],
  numberNoun: 'dice',
  consumes: [],
  hooks: ['turnStart'],
  input: null,
  conflicts: [],
  priority: 10,
};
