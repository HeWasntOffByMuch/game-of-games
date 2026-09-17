import type { Policy } from '../../src/game/policies';
import type { InputValue } from '../../src/frame/types';

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
