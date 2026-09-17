import type { MechanicMeta } from '../grammar/ports';
import type { Rng } from './rng';
import type { NumberPort } from './numbers';
import type {
  Card,
  Comparison,
  InputField,
  InputValue,
  MechanicId,
  PlayerId,
  PlayerState,
  Prize,
  PrizeId,
} from './types';

/** A prize as a mechanic offers it; the frame assigns the id and the source. */
export interface PrizeSpec {
  label: string;
  value: number;
  minStrength?: number;
  payload: Prize['payload'];
}

/**
 * The only way a mechanic changes the world. Every call records the mechanic
 * that made it, so the event log says who did what.
 */
export interface Verbs {
  offerPrize(spec: PrizeSpec): Prize;
  gain(player: PlayerId, amount: number, note?: string): void;
  spend(player: PlayerId, amount: number, note?: string): void;
  addHolding(player: PlayerId, card: Card): void;
  removeHolding(player: PlayerId, cardIds: readonly string[]): Card[];
  setComparison(direction: Comparison): void;
}

export interface MechanicContext<P, S> {
  readonly id: MechanicId;
  readonly turn: number;
  /** A stream derived for this mechanic, so its draws never shift another's. */
  readonly rng: Rng;
  readonly players: readonly PlayerState[];
  readonly prizes: readonly Prize[];
  readonly numbers: NumberPort;
  readonly params: P;
  /** Per-round scratch space, private to this mechanic. */
  readonly state: S;
  readonly verbs: Verbs;
  player(id: PlayerId): PlayerState;
  /** Which prize this player picked this turn, once they have committed. */
  choiceOf(player: PlayerId): PrizeId | null;
  note(text: string): void;
}

export interface WinInfo {
  player: PlayerId;
  prize: Prize;
  strength: number;
}

/**
 * Hook points, typed. v3 lists ten; these are the five the prototype's
 * mechanics subscribe to (docs/DECISIONS.md D6).
 */
export interface HookHandlers<P, S> {
  turnStart?(ctx: MechanicContext<P, S>): void;
  beforeResolve?(ctx: MechanicContext<P, S>): void;
  /** Fired for every win, to every mechanic. Each one decides if it cares. */
  onWin?(ctx: MechanicContext<P, S>, win: WinInfo): void;
  afterResolve?(ctx: MechanicContext<P, S>): void;
  turnEnd?(ctx: MechanicContext<P, S>): void;
}

export interface Mechanic<P, S> {
  meta: MechanicMeta;
  defaultParams: P;
  createState(params: P): S;
  /** Once per round, before the first turn. */
  setup?(ctx: MechanicContext<P, S>): void;
  hooks: HookHandlers<P, S>;
  /**
   * What this mechanic asks this player for, this turn. Must be pure: the
   * frame calls it whenever it needs the current input spec.
   */
  inputFields?(ctx: MechanicContext<P, S>, player: PlayerId): InputField[];
  /**
   * Applies one of this mechanic's own input values. `prepare` fields are
   * applied the moment the player chooses, so they see the result before
   * committing; `commit` fields are applied when the player commits.
   */
  applyInput?(
    ctx: MechanicContext<P, S>,
    player: PlayerId,
    field: InputField,
    value: InputValue,
  ): void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyMechanic = Mechanic<any, any>;

/** Identity helper that keeps params and state inferred inside a mechanic file. */
export function defineMechanic<P, S>(mechanic: Mechanic<P, S>): Mechanic<P, S> {
  return mechanic;
}

export type { MechanicMeta };
