import { defineMechanic } from '../../src/frame/mechanic';
import type { MechanicMeta } from '../../src/grammar/ports';

/** Minimal metadata, so frame tests can stay independent of the catalogue. */
export function stubMeta(over: Partial<MechanicMeta> & { id: string }): MechanicMeta {
  return {
    name: over.id,
    teach: 'A stub for testing.',
    tip: 'A stub for testing.',
    roles: [],
    provides: [],
    consumes: [],
    hooks: [],
    input: null,
    conflicts: [],
    priority: 0,
    ...over,
  };
}

/** Publishes a fixed number per player, so tests control claim strength exactly. */
export const fixedNumbers = defineMechanic<{ values: Record<string, number> }, Record<string, never>>({
  meta: stubMeta({ id: 'fixedNumbers', roles: ['contest'], hooks: ['turnStart'] }),
  defaultParams: { values: {} },
  createState: () => ({}),
  hooks: {
    turnStart(ctx) {
      for (const player of ctx.players) {
        ctx.numbers.publish({
          player: player.id,
          source: ctx.id,
          value: ctx.params.values[player.id] ?? 0,
          random: true,
          parts: [ctx.params.values[player.id] ?? 0],
          redraw: () => ({ value: 1, parts: [1] }),
        });
      }
    },
  },
});

/** Offers point prizes and pays the winner. Enough to exercise the frame. */
export const pointPrizes = defineMechanic<{ values: number[] }, Record<string, never>>({
  meta: stubMeta({ id: 'pointPrizes', roles: ['stakes', 'score'], hooks: ['turnStart', 'onWin'] }),
  defaultParams: { values: [3] },
  createState: () => ({}),
  hooks: {
    turnStart(ctx) {
      ctx.params.values.forEach((amount, index) => {
        ctx.verbs.offerPrize({
          label: `Prize ${index + 1}`,
          value: amount,
          payload: { kind: 'points', amount },
        });
      });
    },
    onWin(ctx, win) {
      if (win.prize.payload.kind !== 'points') return;
      ctx.verbs.gain(win.player, win.prize.payload.amount);
    },
  },
});

/** A prepare toggle that doubles your number the moment you choose it. */
export const doubler = defineMechanic<Record<string, never>, Record<string, never>>({
  meta: stubMeta({
    id: 'doubler',
    input: { kind: 'toggle', phase: 'prepare', hidden: false },
  }),
  defaultParams: {},
  createState: () => ({}),
  inputFields: (ctx, player) => [
    {
      mechanic: ctx.id,
      kind: 'toggle',
      phase: 'prepare',
      label: 'Double?',
      hidden: false,
      enabled: ctx.numbers.has(player),
    },
  ],
  applyInput(ctx, player, _field, value) {
    if (value !== true) return;
    for (const contribution of ctx.numbers.matching(player, { random: true })) {
      ctx.numbers.replace(contribution, { value: contribution.value * 2, parts: contribution.parts }, ctx.id);
    }
  },
  hooks: {},
});

/** A commit amount that is added to the player's number. */
export const addAmount = defineMechanic<{ max: number }, Record<string, never>>({
  meta: stubMeta({
    id: 'addAmount',
    input: { kind: 'pickAmount', phase: 'commit', hidden: true },
  }),
  defaultParams: { max: 5 },
  createState: () => ({}),
  inputFields: (ctx) => [
    {
      mechanic: ctx.id,
      kind: 'pickAmount',
      phase: 'commit',
      label: 'Add',
      hidden: true,
      min: 0,
      max: ctx.params.max,
      enabled: true,
    },
  ],
  applyInput(ctx, player, _field, value) {
    ctx.numbers.publish({ player, source: ctx.id, value: Number(value), hidden: true });
  },
  hooks: {},
});

/**
 * A number provider whose redraws are scripted, so tests can put a modifier
 * in an exact situation (a bust, a specific new total).
 */
export const scriptedNumbers = defineMechanic<
  { values: Record<string, number>; redraws: Record<string, Array<{ value: number; parts: number[] }>> },
  { used: Record<string, number> }
>({
  meta: stubMeta({ id: 'scriptedNumbers', roles: ['contest'], hooks: ['turnStart'] }),
  defaultParams: { values: {}, redraws: {} },
  createState: () => ({ used: {} }),
  hooks: {
    turnStart(ctx) {
      for (const player of ctx.players) {
        const value = ctx.params.values[player.id] ?? 0;
        ctx.numbers.publish({
          player: player.id,
          source: ctx.id,
          value,
          parts: [value],
          random: true,
          redraw: () => {
            const index = ctx.state.used[player.id] ?? 0;
            ctx.state.used[player.id] = index + 1;
            return ctx.params.redraws[player.id]?.[index] ?? { value, parts: [value] };
          },
        });
      }
    },
  },
});

/** A number provider with no redraw, so modifiers that need one find nothing. */
export const fixedChosenNumbers = defineMechanic<{ values: Record<string, number> }, Record<string, never>>({
  meta: stubMeta({ id: 'fixedChosenNumbers', roles: ['contest'], hooks: ['turnStart'] }),
  defaultParams: { values: {} },
  createState: () => ({}),
  hooks: {
    turnStart(ctx) {
      for (const player of ctx.players) {
        ctx.numbers.publish({
          player: player.id,
          source: ctx.id,
          value: ctx.params.values[player.id] ?? 0,
          random: false,
        });
      }
    },
  },
});
