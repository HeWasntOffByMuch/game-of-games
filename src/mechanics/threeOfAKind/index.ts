import { defineMechanic } from '../../frame/mechanic';
import { threeOfAKindMeta } from './meta';

export interface ThreeOfAKindParams {
  size: number;
  points: number;
}

/**
 * Turns symbols into points. It knows nothing about where the cards came
 * from - Market, or anything else that provides `card{symbol}` later.
 */
export const threeOfAKind = defineMechanic<ThreeOfAKindParams, Record<string, never>>({
  meta: threeOfAKindMeta,
  defaultParams: { size: 3, points: 5 },
  createState: () => ({}),
  hooks: {
    afterResolve(ctx) {
      for (const player of ctx.players) {
        let matched = true;
        while (matched) {
          matched = false;
          const counts = new Map<string, string[]>();
          for (const card of player.cards) {
            const ids = counts.get(card.symbol);
            if (ids) ids.push(card.id);
            else counts.set(card.symbol, [card.id]);
          }
          for (const [symbol, ids] of counts) {
            if (ids.length < ctx.params.size) continue;
            ctx.verbs.removeHolding(player.id, ids.slice(0, ctx.params.size));
            ctx.verbs.gain(player.id, ctx.params.points, `${ctx.params.size} ${symbol}`);
            matched = true;
            break;
          }
        }
      }
    },
  },
});
