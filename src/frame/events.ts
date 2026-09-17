import type { Card, Claim, MechanicId, PlayerId, Prize, PrizeId } from './types';

/**
 * The event log is the game's record: the UI renders from it, the golden tests
 * snapshot it, and determinism is defined as two runs producing the same log.
 *
 * Every event that a mechanic caused carries `source`, so a reader can see
 * which mechanic did what. v3's full provenance chains are deferred
 * (docs/DECISIONS.md D11); one tag is enough for the prototype.
 */
export type GameEvent =
  | { t: 'roundStart'; mechanics: MechanicId[]; players: PlayerId[]; seed: string }
  | { t: 'turnStart'; turn: number }
  | { t: 'prizeOffered'; turn: number; source: MechanicId; prize: Prize }
  | { t: 'number'; turn: number; source: MechanicId; player: PlayerId; value: number; parts: number[] }
  | { t: 'numberChanged'; turn: number; source: MechanicId; player: PlayerId; from: number; to: number; parts: number[]; note?: string }
  | { t: 'comparisonSet'; turn: number; source: MechanicId; direction: 'highest' | 'lowest' }
  | { t: 'pass'; turn: number; player: PlayerId }
  | { t: 'claim'; turn: number; player: PlayerId; prize: PrizeId; strength: number }
  | { t: 'claimDropped'; turn: number; player: PlayerId; prize: PrizeId; strength: number; reason: 'zero' | 'belowRequirement' }
  | { t: 'tieCancelled'; turn: number; prize: PrizeId; strength: number; players: PlayerId[] }
  | { t: 'win'; turn: number; player: PlayerId; prize: PrizeId; strength: number }
  | { t: 'lose'; turn: number; player: PlayerId; prize: PrizeId }
  | { t: 'noWinner'; turn: number; prize: PrizeId; reason: 'noClaims' | 'allCancelled' | 'allDropped' }
  | { t: 'points'; turn: number; source: MechanicId; player: PlayerId; delta: number; total: number; note?: string }
  | { t: 'cardGained'; turn: number; source: MechanicId; player: PlayerId; card: Card }
  | { t: 'cardsSpent'; turn: number; source: MechanicId; player: PlayerId; cards: Card[] }
  | { t: 'note'; turn: number; source: MechanicId; text: string }
  | { t: 'turnEnd'; turn: number }
  | { t: 'roundEnd'; turn: number; reason: 'turnCap' | 'stopped'; standings: Array<{ player: PlayerId; points: number; rank: number }> };

export type GameEventType = GameEvent['t'];

export class EventLog {
  private readonly entries: GameEvent[] = [];

  add(event: GameEvent): void {
    this.entries.push(event);
  }

  all(): readonly GameEvent[] {
    return this.entries;
  }

  /** Events emitted since a marker, for rendering just the latest turn. */
  since(index: number): readonly GameEvent[] {
    return this.entries.slice(index);
  }

  get length(): number {
    return this.entries.length;
  }

  ofType<T extends GameEventType>(type: T): Array<Extract<GameEvent, { t: T }>> {
    return this.entries.filter((e): e is Extract<GameEvent, { t: T }> => e.t === type);
  }
}

/** Claims as the frame saw them, before any filtering. Used by resolution. */
export type ClaimSet = readonly Claim[];
