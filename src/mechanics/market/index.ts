import { defineMechanic } from '../../frame/mechanic';
import type { Rng } from '../../frame/rng';
import { marketMeta } from './meta';

export interface MarketParams {
  /** Cards on offer each turn. */
  offers: number;
  /**
   * Hand-tuned against the 2d6 distribution rather than derived from the
   * combined number distribution as v3 describes - that needs the simulator
   * we deliberately have not built (docs/DECISIONS.md D15).
   */
  prices: number[];
  symbols: string[];
}

/** Picks `count` distinct items, deterministically, without mutating the input. */
function sampleDistinct<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const taken: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const index = rng.int(0, pool.length - 1);
    taken.push(...pool.splice(index, 1));
  }
  return taken;
}

/**
 * Offers cards with prices. The price is a requirement on the claim, so the
 * frame drops anyone who cannot reach it before comparing - which is why
 * adding Lowest Wins turns the price from a hurdle into a target.
 */
export const market = defineMechanic<MarketParams, Record<string, never>>({
  meta: marketMeta,
  defaultParams: {
    offers: 3,
    // Retuned for a chosen die (1-6) rather than a 2d6 total. A price is
    // something you can hit exactly, which is what makes Lowest Wins bite.
    prices: [2, 3, 4, 5, 6],
    // Three symbols and three offers means every symbol is on sale every
    // turn, at a price that changes. That makes the denial race legible -
    // you can always see which card someone needs - and makes Three of a
    // Kind reachable inside a short round.
    symbols: ['Moon', 'Star', 'Leaf'],
  },
  createState: () => ({}),
  hooks: {
    turnStart(ctx) {
      const prices = sampleDistinct(ctx.rng, ctx.params.prices, ctx.params.offers);
      const symbols = sampleDistinct(ctx.rng, ctx.params.symbols, ctx.params.offers);
      prices.forEach((price, index) => {
        const symbol = symbols[index] ?? ctx.params.symbols[0] ?? 'Moon';
        ctx.verbs.offerPrize({
          label: symbol,
          value: price,
          minStrength: price,
          payload: { kind: 'card', card: { id: `c${ctx.turn}-${index}`, symbol } },
        });
      });
    },

    onWin(ctx, win) {
      if (win.prize.source !== ctx.id || win.prize.payload.kind !== 'card') return;
      ctx.verbs.addHolding(win.player, win.prize.payload.card);
    },
  },
});
