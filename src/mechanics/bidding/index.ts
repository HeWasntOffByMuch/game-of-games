import { defineMechanic } from '../../frame/mechanic';
import type { PlayerId } from '../../frame/types';
import { biddingMeta } from './meta';

export interface BiddingParams {
  startingPoints: number;
}

interface BiddingState {
  bids: Record<PlayerId, number>;
}

/**
 * Your bid is your number and your price. Only the winner pays, so a bid is
 * a guess about everyone else rather than a purchase.
 */
export const bidding = defineMechanic<BiddingParams, BiddingState>({
  meta: biddingMeta,
  defaultParams: { startingPoints: 5 },
  createState: () => ({ bids: {} }),

  setup(ctx) {
    for (const player of ctx.players) {
      ctx.verbs.gain(player.id, ctx.params.startingPoints, 'starting points');
    }
  },

  hooks: {
    turnStart(ctx) {
      ctx.state.bids = {};
    },

    onWin(ctx, win) {
      const bid = ctx.state.bids[win.player];
      if (bid === undefined || bid === 0) return;
      ctx.verbs.spend(win.player, bid, 'bid');
    },
  },

  inputFields(ctx, player) {
    const points = ctx.player(player).points;
    return [
      {
        mechanic: ctx.id,
        kind: 'pickAmount',
        phase: 'commit',
        label: 'Bid',
        hidden: true,
        min: 0,
        max: points,
        enabled: points > 0,
        ...(points > 0 ? {} : { note: 'No points to bid' }),
      },
    ];
  },

  applyInput(ctx, player, _field, value) {
    const points = ctx.player(player).points;
    const bid = Math.max(0, Math.min(Number(value), points));
    ctx.state.bids[player] = bid;
    ctx.numbers.publish({ player, source: ctx.id, value: bid, hidden: true });
  },
});
