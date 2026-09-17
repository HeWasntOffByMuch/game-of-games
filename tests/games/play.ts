import type { Policy } from '../../src/game/policies';
import type { InputSpec, InputValue, PlayerId } from '../../src/frame/types';

export { playGame } from '../../src/game/autoplay';
export { alwaysPass, cheapestReachable, dearestReachable, randomPolicy } from '../../src/game/policies';
export type { Policy } from '../../src/game/policies';

export interface ScriptedTurn {
  /** Index into this turn's prize list, or null to pass. */
  prize?: number | null;
  values?: Record<string, InputValue>;
  prepare?: Record<string, InputValue>;
}

/** Plays a fixed list of decisions, one per turn, then passes. */
export function scripted(turns: ScriptedTurn[]): Policy {
  return {
    prepare(spec) {
      return turns[spec.turn - 1]?.prepare ?? {};
    },
    commit(spec) {
      const turn = turns[spec.turn - 1];
      if (!turn || turn.prize === null || turn.prize === undefined) {
        return { prize: null, values: turn?.values ?? {} };
      }
      const option = spec.prizes[turn.prize];
      if (!option) throw new Error(`Turn ${spec.turn}: no prize at index ${turn.prize}`);
      return { prize: option.prize.id, values: turn.values ?? {} };
    },
  };
}

/**
 * Plays the way the mechanics ask to be played: pick a die that reaches the
 * symbol you are collecting, and buy that symbol when you can. A policy that
 * ignores symbols never completes a set, which says nothing about Three of a
 * Kind.
 */
export function collector(targets: Record<PlayerId, string>): Policy {
  const wanted = (spec: InputSpec, player: PlayerId): number | undefined =>
    spec.prizes.find((option) => option.prize.label === targets[player])?.prize.minStrength;

  return {
    prepare(spec, player) {
      const values: Record<string, InputValue> = {};
      for (const field of spec.prepare) {
        if (!field.enabled) continue;
        if (field.kind !== 'pickOne') {
          values[field.mechanic] = false;
          continue;
        }
        const faces = (field.choices ?? []).map((choice) => choice.value);
        const price = wanted(spec, player) ?? 0;
        // The smallest face that still reaches the price, else the largest.
        const fits = faces.filter((face) => face >= price).sort((a, b) => a - b)[0];
        values[field.mechanic] = fits ?? Math.max(...faces);
      }
      return values;
    },
    commit(spec, player) {
      const mine = spec.prizes.find(
        (option) => option.reachable && option.prize.label === targets[player],
      );
      const any = spec.prizes.find((option) => option.reachable);
      return { prize: (mine ?? any)?.prize.id ?? null, values: {} };
    },
  };
}
