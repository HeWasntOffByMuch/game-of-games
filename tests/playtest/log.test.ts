import { describe, expect, it } from 'vitest';
import { PlaytestLog, type PlaytestEvent } from '../../src/playtest/log';

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

function log(): PlaytestLog {
  let time = 1_700_000_000_000;
  return new PlaytestLog({ sessionId: 'test', now: () => (time += 1000) });
}

describe('playtest log', () => {
  it('numbers events so chronological order survives equal timestamps', () => {
    const playtest = log();
    playtest.add({ t: 'sessionStart' });
    playtest.add({ t: 'gameEnd', gameId: 'g1', reason: 'newGame' });
    expect(playtest.all().map((event) => event.seq)).toEqual([1, 2]);
    expect(playtest.all().every((event) => event.sessionId === 'test')).toBe(true);
    expect(playtest.all()[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('writes one JSON object per line', () => {
    const playtest = log();
    playtest.add({ t: 'sessionStart' });
    playtest.add({ t: 'gameEnd', gameId: 'g1', reason: 'newGame' });
    const lines = playtest.toJsonl().split('\n');
    expect(lines).toHaveLength(2);
    expect((JSON.parse(lines[1] as string) as PlaytestEvent).t).toBe('gameEnd');
  });

  it('counts games, rounds and turns for the tester', () => {
    const playtest = log();
    playtest.add({ t: 'sessionStart' });
    playtest.add({ t: 'gameStart', gameId: 'g1', gameNumber: 1, gameName: 'X', mechanics: ['pot'], players: 3, playerNames: ['a', 'b', 'c'], maxTurns: 8, minRecommendedPlayers: 3 });
    playtest.add({ t: 'turn', gameId: 'g1', roundId: 'g1r1', turn: 1, durationMs: 10, players: [], events: [], standings: [] });
    playtest.add({ t: 'roundEnd', gameId: 'g1', roundId: 'g1r1', turnsPlayed: 1, durationMs: 10, endedBecause: 'turnCap', standings: [], winners: [] });
    expect(playtest.summary).toEqual({ games: 1, rounds: 1, turns: 1 });
  });

  it('is emptied only when asked', () => {
    const playtest = log();
    playtest.add({ t: 'sessionStart' });
    playtest.add({ t: 'gameEnd', gameId: 'g1', reason: 'newGame' });
    expect(playtest.size).toBe(2);
    playtest.clear();
    expect(playtest.size).toBe(0);
    expect(playtest.toJsonl()).toBe('');
  });

  it('picks the same sitting back up after a refresh', () => {
    const storage = memoryStorage();
    const first = log();
    first.add({ t: 'sessionStart' });
    first.add({ t: 'gameEnd', gameId: 'g1', reason: 'newGame' });
    first.save(storage);

    const restored = PlaytestLog.restore(storage);
    expect(restored?.sessionId).toBe('test');
    expect(restored?.size).toBe(2);

    // And keeps counting up rather than reusing sequence numbers.
    restored?.add({ t: 'sessionStart' });
    expect(restored?.all().at(-1)?.seq).toBe(3);
  });

  it('forgets the stored copy when the tester clears it', () => {
    const storage = memoryStorage();
    const playtest = log();
    playtest.add({ t: 'sessionStart' });
    playtest.save(storage);
    PlaytestLog.forget(storage);
    expect(PlaytestLog.restore(storage)).toBeNull();
  });

  it('never interrupts a playtest when storage is unavailable', () => {
    const broken = memoryStorage(true);
    const playtest = log();
    playtest.add({ t: 'sessionStart' });
    expect(() => playtest.save(broken)).not.toThrow();
    expect(PlaytestLog.restore(broken)).toBeNull();
  });

  it('ignores a corrupted stored copy rather than throwing', () => {
    const storage = memoryStorage();
    storage.setItem('house-rules.playtest', '{not json');
    expect(PlaytestLog.restore(storage)).toBeNull();
  });
});
