import { defineMechanic } from '../../frame/mechanic';
import { lowestWinsMeta } from './meta';

/**
 * Flips the frame's comparison, and nothing else. Everything interesting
 * comes from what that collides with: a price becomes a target rather than a
 * hurdle, and a bid of 1 becomes self-defeating once ties cancel.
 */
export const lowestWins = defineMechanic<Record<string, never>, Record<string, never>>({
  meta: lowestWinsMeta,
  defaultParams: {},
  createState: () => ({}),
  hooks: {
    beforeResolve(ctx) {
      ctx.verbs.setComparison('lowest');
    },
  },
});
