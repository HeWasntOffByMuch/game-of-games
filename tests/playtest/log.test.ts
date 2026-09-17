import { describe, expect, it } from 'vitest';
import { load, newSession, save, toJsonl, type RoundRecord, type SessionRecord } from '../../src/playtest/log';

function record(over: Partial<RoundRecord> = {}): RoundRecord {
  return {
    round: 1,
    seed: 's-r1',
    mechanics: ['dice', 'market', 'threeOfAKind'],
    gameName: 'Dice + Market + Three of a Kind',
    players: 3,
    mutation: null,
    turnsPlayed: 8,
    endedBecause: 'turnCap',
    durationMs: 132_000,
    turnDurationsMs: [16_000, 15_000],
    standings: [{ player: 'p1', points: 10, rank: 1 }],
    winners: ['p1'],
    ...over,
  };
}

/** Enough of the Storage interface to test against, including a failing one. */
function memoryStorage(broken = false): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => {
      if (broken) throw new Error('blocked');
      return map.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (broken) throw new Error('full');
      map.set(key, value);
    },
    removeItem: (key: string) => void map.delete(key),
  } as Storage;
}

describe('playtest log', () => {
  it('records one line per round, so sessions can be concatenated', () => {
    const session: SessionRecord = { ...newSession(['Ada']), rounds: [record(), record({ round: 2 })] };
    const lines = toJsonl(session).split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      sessionId: session.sessionId,
      round: 1,
      gameName: 'Dice + Market + Three of a Kind',
      durationMs: 132_000,
    });
  });

  it('keeps what a mutation changed, so round-to-round reads as a story', () => {
    const session: SessionRecord = {
      ...newSession(['Ada']),
      rounds: [record(), record({ round: 2, mutation: { op: 'add', mechanic: 'reroll' }, fun: 'up', clarity: 4 })],
    };
    const second = JSON.parse(toJsonl(session).split('\n')[1] as string);
    expect(second).toMatchObject({ mutation: { op: 'add', mechanic: 'reroll' }, fun: 'up', clarity: 4 });
  });

  it('round-trips through storage, keeping earlier sessions', () => {
    const storage = memoryStorage();
    const first: SessionRecord = { ...newSession(['Ada']), sessionId: 'one', rounds: [record()] };
    const second: SessionRecord = { ...newSession(['Bo']), sessionId: 'two', rounds: [record()] };
    save(first, storage);
    save(second, storage);
    expect(load(storage).map((s) => s.sessionId)).toEqual(['one', 'two']);
  });

  it('replaces a session rather than duplicating it as rounds are added', () => {
    const storage = memoryStorage();
    const session: SessionRecord = { ...newSession(['Ada']), sessionId: 'one', rounds: [record()] };
    save(session, storage);
    save({ ...session, rounds: [record(), record({ round: 2 })] }, storage);
    const loaded = load(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.rounds).toHaveLength(2);
  });

  it('never interrupts a playtest when storage is unavailable', () => {
    const broken = memoryStorage(true);
    expect(() => save({ ...newSession(['Ada']), rounds: [record()] }, broken)).not.toThrow();
    expect(load(broken)).toEqual([]);
  });

  it('starts empty', () => {
    expect(newSession(['Ada', 'Bo']).rounds).toEqual([]);
    expect(toJsonl(newSession(['Ada']))).toBe('');
  });
});
