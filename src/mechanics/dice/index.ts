import { defineMechanic } from '../../frame/mechanic';
import type { NumberDraw } from '../../frame/numbers';
import type { Rng } from '../../frame/rng';
import { diceMeta } from './meta';

export interface DiceParams {
  count: number;
  faces: number;
}

function roll(rng: Rng, params: DiceParams): NumberDraw {
  const parts = Array.from({ length: params.count }, () => rng.int(1, params.faces));
  return { value: parts.reduce((sum, face) => sum + face, 0), parts };
}

/**
 * Publishes a random number per player, and hands out a `redraw` so any
 * modifier can draw again without knowing what dice are.
 */
export const dice = defineMechanic<DiceParams, Record<string, never>>({
  meta: diceMeta,
  defaultParams: { count: 2, faces: 6 },
  createState: () => ({}),
  hooks: {
    turnStart(ctx) {
      for (const player of ctx.players) {
        const draw = roll(ctx.rng, ctx.params);
        ctx.numbers.publish({
          player: player.id,
          source: ctx.id,
          value: draw.value,
          parts: draw.parts,
          random: true,
          redraw: () => roll(ctx.rng, ctx.params),
        });
      }
    },
  },
});
