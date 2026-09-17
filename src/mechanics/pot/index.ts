import { defineMechanic } from '../../frame/mechanic';
import { potMeta } from './meta';

export interface PotParams {
  start: number;
  growth: number;
}

interface PotState {
  value: number;
  wonThisTurn: boolean;
}

/**
 * A single growing prize. It punishes crowding without any rule about
 * crowding: every turn nobody wins - because everyone cancelled, say - the
 * pot is worth more to whoever breaks the pattern next.
 */
export const pot = defineMechanic<PotParams, PotState>({
  meta: potMeta,
  defaultParams: { start: 2, growth: 1 },
  createState: (params) => ({ value: params.start, wonThisTurn: false }),
  hooks: {
    turnStart(ctx) {
      ctx.state.wonThisTurn = false;
      ctx.verbs.offerPrize({
        label: `Pot ${ctx.state.value}`,
        value: ctx.state.value,
        payload: { kind: 'points', amount: ctx.state.value },
      });
    },

    onWin(ctx, win) {
      if (win.prize.source !== ctx.id || win.prize.payload.kind !== 'points') return;
      ctx.verbs.gain(win.player, win.prize.payload.amount, 'pot');
      ctx.state.value = ctx.params.start;
      ctx.state.wonThisTurn = true;
    },

    turnEnd(ctx) {
      if (ctx.state.wonThisTurn) return;
      ctx.state.value += ctx.params.growth;
      ctx.note(`Pot grows to ${ctx.state.value}`);
    },
  },
});
