import type { Rng } from '../frame/rng';
import type { InputSpec, InputValue, PlayerId, TurnInput } from '../frame/types';

/**
 * A policy turns "what this player can see" into "what they do". It exists so
 * a round can be played without a person: the headless CLI uses one, and tests
 * use one to reach a particular situation.
 *
 * These are not bots in v3's sense. Lookahead, TipBot and trivial-policy
 * analysis are deliberately not built (docs/DECISIONS.md D2).
 */
export interface Policy {
  /** Prepare choices are applied immediately, before the player commits. */
  prepare?(spec: InputSpec, player: PlayerId): Record<string, InputValue>;
  commit(spec: InputSpec, player: PlayerId): TurnInput;
}

function reachable(spec: InputSpec): InputSpec['prizes'] {
  return spec.prizes.filter((option) => option.reachable);
}

/** Answers every prepare question a mechanic asks, picking by one rule. */
function prepareWith(
  spec: InputSpec,
  choose: (values: number[]) => number,
): Record<string, InputValue> {
  const values: Record<string, InputValue> = {};
  for (const field of spec.prepare) {
    if (!field.enabled) continue;
    if (field.kind === 'pickOne' && field.choices && field.choices.length > 0) {
      values[field.mechanic] = choose(field.choices.map((choice) => choice.value));
    } else if (field.kind === 'toggle') {
      values[field.mechanic] = false;
    } else {
      values[field.mechanic] = field.min ?? 0;
    }
  }
  return values;
}

function best(spec: InputSpec, better: (a: number, b: number) => boolean): TurnInput {
  const options = reachable(spec);
  let chosen = options[0] ?? null;
  for (const option of options) {
    if (chosen && better(option.prize.value, chosen.prize.value)) chosen = option;
  }
  return { prize: chosen?.prize.id ?? null, values: {} };
}

export const cheapestReachable: Policy = {
  prepare: (spec) => prepareWith(spec, (values) => Math.min(...values)),
  commit: (spec) => best(spec, (a, b) => a < b),
};

export const dearestReachable: Policy = {
  prepare: (spec) => prepareWith(spec, (values) => Math.max(...values)),
  commit: (spec) => best(spec, (a, b) => a > b),
};

export const alwaysPass: Policy = {
  commit: () => ({ prize: null, values: {} }),
};

/** Picks uniformly among reachable prizes and legal amounts. */
export function randomPolicy(rng: Rng): Policy {
  return {
    prepare(spec) {
      const values: Record<string, InputValue> = {};
      for (const field of spec.prepare) {
        if (!field.enabled) continue;
        if (field.kind === 'pickOne' && field.choices && field.choices.length > 0) {
          values[field.mechanic] = rng.pick(field.choices).value;
        } else if (field.kind === 'toggle') {
          values[field.mechanic] = rng.next() < 0.5;
        } else {
          values[field.mechanic] = rng.int(field.min ?? 0, field.max ?? 0);
        }
      }
      return values;
    },
    commit(spec) {
      const options = reachable(spec);
      const values: Record<string, InputValue> = {};
      for (const field of spec.commit) {
        if (!field.enabled) continue;
        values[field.mechanic] = rng.int(field.min ?? 0, field.max ?? 0);
      }
      // Passing is always allowed, and is sometimes the right move.
      const pick = rng.int(0, options.length);
      return { prize: options[pick]?.prize.id ?? null, values };
    },
  };
}
