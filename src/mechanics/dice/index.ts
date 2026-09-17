import { defineMechanic } from '../../frame/mechanic';
import type { NumberContribution, NumberDraw } from '../../frame/numbers';
import type { PlayerId } from '../../frame/types';
import type { Rng } from '../../frame/rng';
import { diceMeta } from './meta';

export interface DiceParams {
  /** Two is the simplest version that creates a choice. Three is tunable. */
  count: number;
  faces: number;
}

interface DiceState {
  rolled: Record<PlayerId, number[]>;
  published: Record<PlayerId, NumberContribution>;
}

function roll(rng: Rng, params: DiceParams): number[] {
  return Array.from({ length: params.count }, () => rng.int(1, params.faces));
}

/**
 * Rolls dice and lets the player choose which one to commit.
 *
 * The first playtest found that a die that simply *is* your number replaces a
 * decision with randomness. Choosing between two faces keeps the randomness
 * but puts a decision back: against a price, under Lowest Wins, or with ties
 * cancelling, the bigger die is often the wrong one.
 *
 * Until the choice is made the number is 0, so nothing is reachable and the
 * frame drops any claim - the same rule that covers a pass and a bust.
 */
export const dice = defineMechanic<DiceParams, DiceState>({
  meta: diceMeta,
  defaultParams: { count: 2, faces: 6 },
  createState: () => ({ rolled: {}, published: {} }),

  hooks: {
    turnStart(ctx) {
      for (const player of ctx.players) {
        const faces = roll(ctx.rng, ctx.params);
        ctx.state.rolled[player.id] = faces;
        ctx.state.published[player.id] = ctx.numbers.publish({
          player: player.id,
          source: ctx.id,
          value: 0,
          parts: faces,
          random: true,
          // A redraw rolls again and clears the choice, so whoever asked for it
          // never has to know what dice are.
          redraw: (): NumberDraw => {
            const next = roll(ctx.rng, ctx.params);
            ctx.state.rolled[player.id] = next;
            return { value: 0, parts: next };
          },
        });
      }
    },
  },

  inputFields(ctx, player) {
    const faces = ctx.state.rolled[player] ?? [];
    const busted = ctx.numbers.isOverridden(player);
    return [
      {
        mechanic: ctx.id,
        kind: 'pickOne',
        phase: 'prepare',
        label: 'Which die is your number?',
        hidden: false,
        enabled: !busted && faces.length > 0,
        choices: faces.map((face) => ({ value: face, label: String(face) })),
        ...(busted ? { note: 'Busted' } : {}),
      },
    ];
  },

  applyInput(ctx, player, _field, value) {
    const faces = ctx.state.rolled[player] ?? [];
    const chosen = Number(value);
    if (!faces.includes(chosen)) throw new Error(`${chosen} is not one of ${faces.join(', ')}`);
    const contribution = ctx.state.published[player];
    if (!contribution) return;
    ctx.numbers.replace(contribution, { value: chosen, parts: faces }, ctx.id);
  },
});
