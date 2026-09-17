import type { MechanicId } from './ids';

export type { MechanicId } from './ids';

export type PlayerId = string;
export type PrizeId = string;
export type CardId = string;

export interface Card {
  id: CardId;
  /** The matchable thing. Three of a Kind cares about nothing else. */
  symbol: string;
}

export type PrizePayload =
  | { kind: 'card'; card: Card }
  | { kind: 'points'; amount: number };

export interface Prize {
  id: PrizeId;
  /** The mechanic that offered it, and the one that hands it over on a win. */
  source: MechanicId;
  /** Player-facing, e.g. "Moon - price 8". */
  label: string;
  /** What it is worth. Read by the UI (and by Freeze, later). */
  value: number;
  /**
   * A claim below this does not qualify. Market sets it to the card's price;
   * Pot leaves it undefined. Filtering happens before comparison, which is
   * exactly why Lowest Wins + Market means "lowest total that still reaches
   * the price" rather than "lowest total".
   */
  minStrength?: number;
  payload: PrizePayload;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  points: number;
  cards: Card[];
}

export interface Claim {
  player: PlayerId;
  prize: PrizeId;
  strength: number;
}

/** Highest wins by default; Lowest Wins flips it. */
export type Comparison = 'highest' | 'lowest';

export type InputValue = number | boolean;

/** One thing a player is asked for this turn, besides picking a prize. */
export interface InputField {
  mechanic: MechanicId;
  kind: 'toggle' | 'pickAmount';
  phase: 'prepare' | 'commit';
  /** Player-facing, e.g. "Reroll?" or "Bid". */
  label: string;
  hidden: boolean;
  /** pickAmount only. */
  min?: number;
  max?: number;
  /** False when the mechanic has nothing to offer this player this turn. */
  enabled: boolean;
  /** Shown when disabled, e.g. "No points to bid". */
  note?: string;
}

export interface PrizeOption {
  prize: Prize;
  /** Whether this player can currently reach the prize's requirement. */
  reachable: boolean;
  note?: string;
}

/** Everything one player needs to make this turn's decision. */
export interface InputSpec {
  player: PlayerId;
  turn: number;
  /** This player's current number, and where it came from. */
  strength: number;
  strengthParts: Array<{ source: MechanicId; value: number; parts: number[] }>;
  prizes: PrizeOption[];
  prepare: InputField[];
  commit: InputField[];
}

/** One player's decision for one turn. */
export interface TurnInput {
  /** null = pass. */
  prize: PrizeId | null;
  /** Keyed by mechanic id. */
  values: Record<MechanicId, InputValue>;
}

export const PASS: TurnInput = Object.freeze({ prize: null, values: {} });
