import type { MechanicMeta } from '../../grammar/ports';

export const biddingMeta: MechanicMeta = {
  id: 'bidding',
  name: 'Bidding',
  teach: 'Secretly bid points. Only the winner pays their bid.',
  tip: 'Bid just enough. Big wins can cost more than they pay.',
  roles: ['contest'],
  provides: [{ type: 'number', attrs: { chosen: true, hidden: true } }],
  numberNoun: 'bid',
  consumes: [{ type: 'points', use: 'spend', required: true }],
  hooks: ['turnStart', 'onWin'],
  input: { kind: 'pickAmount', phase: 'commit', hidden: true },
  // Bidding costs something, so passing with a bid of 0 is a real choice.
  costlyEntry: true,
  // Two players read each other too easily; the first playtest went solvable.
  minRecommendedPlayers: 3,
  conflicts: [],
  priority: 20,
};
