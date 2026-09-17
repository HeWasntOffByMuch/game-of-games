import type { GameEvent } from '../frame/events';
import type { Standing } from '../frame/ranking';
import type { InputValue, PlayerId, PrizeId } from '../frame/types';
import type { Mutation } from '../game/mutate';

/**
 * One accumulating record of a whole playtest sitting.
 *
 * It is an append-only event stream rather than a list of rounds, because a
 * sitting is not a list of rounds: it is several games, each mutating over
 * several rounds, with the player count changing in between. Chronological
 * events with ids on them can be grouped afterwards; a nested structure
 * cannot be un-nested.
 *
 * Nothing here draws conclusions. It captures raw evidence for a person to
 * read (playtest finding 4).
 */

/** One player's whole decision for one turn. */
export interface TurnPlayerRecord {
  player: PlayerId;
  name: string;
  /** Answers applied immediately, e.g. which die, whether to reroll. */
  prepare: Record<string, InputValue>;
  /** Answers revealed with everyone else's, e.g. a bid. */
  commit: Record<string, InputValue>;
  prize: PrizeId | null;
  prizeLabel: string | null;
  /** The number the frame compared. */
  strength: number;
  /** Points after the turn resolved. */
  points: number;
}

interface Envelope {
  /** Monotonic within a session. Chronological order, even at equal timestamps. */
  seq: number;
  at: string;
  sessionId: string;
}

export type PlaytestBody =
  | { t: 'sessionStart' }
  | {
      t: 'gameStart';
      gameId: string;
      gameNumber: number;
      gameName: string;
      mechanics: string[];
      players: number;
      playerNames: string[];
      maxTurns: number;
      minRecommendedPlayers: number;
    }
  | { t: 'gameEnd'; gameId: string; reason: 'newGame' }
  | {
      t: 'roundStart';
      gameId: string;
      roundId: string;
      roundNumber: number;
      gameName: string;
      mechanics: string[];
      seed: string;
      /** How this round's mechanics came about. null for a game's first round. */
      mutation: Mutation | null;
    }
  | {
      t: 'turn';
      gameId: string;
      roundId: string;
      turn: number;
      durationMs: number;
      players: TurnPlayerRecord[];
      /** The frame's own events for this turn: offers, claims, ties, wins, points. */
      events: GameEvent[];
      standings: Standing[];
    }
  | {
      t: 'roundEnd';
      gameId: string;
      roundId: string;
      turnsPlayed: number;
      durationMs: number;
      endedBecause: 'turnCap' | 'stopped';
      standings: Standing[];
      winners: string[];
    }
  | {
      t: 'mutation';
      gameId: string;
      mutation: Mutation;
      label: string;
      fromMechanics: string[];
      toMechanics: string[];
      added: string[];
      gone: string[];
      changed: string[];
    }
  | { t: 'rating'; gameId: string; roundId: string; fun?: 'up' | 'down'; clarity?: number };

export type PlaytestEvent = Envelope & PlaytestBody;

const STORAGE_KEY = 'house-rules.playtest';

interface Stored {
  sessionId: string;
  seq: number;
  events: PlaytestEvent[];
}

export class PlaytestLog {
  readonly sessionId: string;
  private events: PlaytestEvent[] = [];
  private seq = 0;
  private readonly now: () => number;

  constructor(options: { sessionId?: string; now?: () => number } = {}) {
    this.now = options.now ?? (() => Date.now());
    this.sessionId = options.sessionId ?? new Date(this.now()).toISOString().replace(/[-:.]/g, '').slice(0, 15);
  }

  add(body: PlaytestBody): PlaytestEvent {
    const event = {
      seq: (this.seq += 1),
      at: new Date(this.now()).toISOString(),
      sessionId: this.sessionId,
      ...body,
    } as PlaytestEvent;
    this.events.push(event);
    return event;
  }

  all(): readonly PlaytestEvent[] {
    return this.events;
  }

  get size(): number {
    return this.events.length;
  }

  /** How many games and rounds are in the log, for the tester's own reassurance. */
  get summary(): { games: number; rounds: number; turns: number } {
    return {
      games: this.events.filter((event) => event.t === 'gameStart').length,
      rounds: this.events.filter((event) => event.t === 'roundEnd').length,
      turns: this.events.filter((event) => event.t === 'turn').length,
    };
  }

  /** One JSON object per line, in the order things happened. */
  toJsonl(): string {
    return this.events.map((event) => JSON.stringify(event)).join('\n');
  }

  /**
   * Only ever called because a tester explicitly asked. Nothing in the flow of
   * play clears the log - not a round ending, a mutation, a new game, or a
   * download.
   */
  clear(): void {
    this.events = [];
    this.seq = 0;
  }

  save(storage: Storage): void {
    try {
      const stored: Stored = { sessionId: this.sessionId, seq: this.seq, events: this.events };
      storage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // A full or blocked store must never interrupt a playtest.
    }
  }

  /** Picks the sitting back up after a refresh, rather than starting a new one. */
  static restore(storage: Storage, now?: () => number): PlaytestLog | null {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const stored = JSON.parse(raw) as Stored;
      if (!stored?.sessionId || !Array.isArray(stored.events)) return null;
      const log = new PlaytestLog({
        sessionId: stored.sessionId,
        ...(now ? { now } : {}),
      });
      log.events = stored.events;
      log.seq = stored.seq ?? stored.events.length;
      return log;
    } catch {
      return null;
    }
  }

  static forget(storage: Storage): void {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // As above.
    }
  }
}
