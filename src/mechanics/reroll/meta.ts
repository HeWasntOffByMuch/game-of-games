import type { MechanicMeta } from '../../grammar/ports';

export const rerollMeta: MechanicMeta = {
  id: 'reroll',
  name: 'Reroll',
  teach: 'You may reroll once. Doubles on a reroll bust.',
  tip: "Reroll when your roll can't win anything anyway.",
  roles: [],
  provides: [{ type: 'modifier', attrs: { target: 'number' } }],
  consumes: [{ type: 'number', attrs: { random: true }, required: true }],
  hooks: [],
  input: { kind: 'toggle', phase: 'prepare', hidden: false },
  costlyEntry: true,
  conflicts: [],
  // Asked before the number providers it modifies: rerolling replaces the
  // dice a player would otherwise be choosing between. Reroll has no hooks,
  // so this priority only orders the questions.
  priority: 5,
};
