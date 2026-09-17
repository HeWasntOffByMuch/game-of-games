import type { MechanicMeta } from '../../grammar/ports';

export const diceMeta: MechanicMeta = {
  id: 'dice',
  name: 'Dice',
  teach: 'Roll two dice. Choose one as your number.',
  tip: 'The bigger die is not always the better one.',
  roles: ['contest'],
  provides: [{ type: 'number', attrs: { random: true } }],
  consumes: [],
  hooks: ['turnStart'],
  // The roll is random; the number is chosen. That is the whole point of the
  // mechanic after the first playtest (finding 1).
  input: { kind: 'pickOne', phase: 'prepare', hidden: false },
  numberNoun: 'die',
  conflicts: [],
  priority: 10,
};
