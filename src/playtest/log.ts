import type { Standing } from '../frame/ranking';
import type { Mutation } from '../game/mutate';

/**
 * Playtest instrumentation, kept deliberately thin: enough to answer "how
 * long did that take, what did they build, did they enjoy it", and nothing
 * that pretends to measure quality automatically (docs/DECISIONS.md D2).
 */
export interface RoundRecord {
  round: number;
  seed: string;
  mechanics: string[];
  gameName: string;
  players: number;
  /** How the game got here. null for the opener. */
  mutation: Mutation | null;
  turnsPlayed: number;
  endedBecause: 'turnCap' | 'stopped';
  /** Wall clock, from the first commit to the last reveal. */
  durationMs: number;
  /** Per turn, from the first private commit to the reveal. */
  turnDurationsMs: number[];
  standings: Standing[];
  winners: string[];
  /** Optional taps on the results screen. */
  fun?: 'up' | 'down';
  clarity?: number;
}

export interface SessionRecord {
  sessionId: string;
  startedAt: string;
  playerNames: string[];
  rounds: RoundRecord[];
}

export function newSession(playerNames: string[], now = new Date()): SessionRecord {
  return {
    sessionId: `${now.toISOString().slice(0, 19).replace(/[:T]/g, '')}`,
    startedAt: now.toISOString(),
    playerNames,
    rounds: [],
  };
}

/** One JSON object per line, so several sessions can be concatenated. */
export function toJsonl(session: SessionRecord): string {
  return session.rounds
    .map((round) => JSON.stringify({ sessionId: session.sessionId, ...round }))
    .join('\n');
}

const STORAGE_KEY = 'house-rules.playtest';

export function save(session: SessionRecord, storage: Storage): void {
  try {
    const existing = load(storage).filter((entry) => entry.sessionId !== session.sessionId);
    storage.setItem(STORAGE_KEY, JSON.stringify([...existing, session]));
  } catch {
    // A full or blocked store must never interrupt a playtest.
  }
}

export function load(storage: Storage): SessionRecord[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionRecord[]) : [];
  } catch {
    return [];
  }
}
