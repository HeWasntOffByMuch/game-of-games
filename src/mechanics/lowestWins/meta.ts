import type { MechanicMeta } from '../../grammar/ports';

export const lowestWinsMeta: MechanicMeta = {
  id: 'lowestWins',
  name: 'Lowest Wins',
  teach: 'The lowest number wins a prize instead of the highest.',
  tip: "Pick numbers others won't.",
  roles: [],
  provides: [{ type: 'modifier', attrs: { target: 'comparison' } }],
  consumes: [{ type: 'number', use: 'strength', required: true }],
  hooks: ['beforeResolve'],
  input: null,
  // Removing it puts a frame rule back without any teach text of its own.
  onRemoveLine: 'Highest number wins again.',
  // Avoiding one opponent's number is a guess; avoiding three is a game.
  minRecommendedPlayers: 3,
  conflicts: [],
  priority: 50,
};
