import { defineMechanic } from '../../frame/mechanic';
import { rerollMeta } from './meta';

export interface RerollParams {
  /** A redraw whose parts all match sets your number to 0. */
  bustOnMatchingParts: boolean;
}

/**
 * Draws a random number again. It never learns what produced that number:
 * it asks the port for contributions marked `random` and calls the `redraw`
 * the provider supplied. Dice happens to be the only such provider today.
 *
 * The bust is Reroll's rule, not the number provider's, so "doubles" is read
 * generically as "every part of the redraw matched".
 */
export const reroll = defineMechanic<RerollParams, Record<string, never>>({
  meta: rerollMeta,
  defaultParams: { bustOnMatchingParts: true },
  createState: () => ({}),
  hooks: {},

  inputFields(ctx, player) {
    const available = ctx.numbers.matching(player, { random: true }).some((c) => c.redraw);
    return [
      {
        mechanic: ctx.id,
        kind: 'toggle',
        phase: 'prepare',
        label: 'Reroll?',
        hidden: false,
        enabled: available,
        ...(available ? {} : { note: 'Nothing to reroll' }),
      },
    ];
  },

  applyInput(ctx, player, _field, value) {
    if (value !== true) return;
    let busted = false;
    for (const contribution of ctx.numbers.matching(player, { random: true })) {
      if (!contribution.redraw) continue;
      const draw = contribution.redraw();
      ctx.numbers.replace(contribution, draw, ctx.id);
      if (
        ctx.params.bustOnMatchingParts &&
        draw.parts.length > 1 &&
        new Set(draw.parts).size === 1
      ) {
        busted = true;
      }
    }
    if (busted) ctx.numbers.override(player, 0, ctx.id, 'bust');
  },
});
