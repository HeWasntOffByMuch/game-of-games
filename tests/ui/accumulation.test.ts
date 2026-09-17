import { describe, expect, it } from 'vitest';
import { PlaytestLog, type PlaytestEvent } from '../../src/playtest/log';
import { Session } from '../../src/ui/session';

function clock(): () => number {
  let time = 1_700_000_000_000;
  return () => (time += 1000);
}

function seats(count: number): Array<{ id: string; name: string }> {
  return Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
}

/** Plays a whole round: every turn, every seat, answering whatever is asked. */
function playRound(session: Session): void {
  session.beginPlay();
  while (session.screen !== 'results') {
    const seat = session.currentSeat;
    if (!seat) break;
    session.takeSeat();
    for (const field of session.round!.specFor(seat.id).prepare) {
      if (!field.enabled) continue;
      session.applyPrepare(field.mechanic, field.kind === 'pickOne' ? (field.choices?.[0]?.value ?? 0) : false);
    }
    const spec = session.round!.specFor(seat.id);
    const values: Record<string, number> = {};
    for (const field of spec.commit) values[field.mechanic] = field.min ?? 0;
    session.commit({ prize: spec.prizes.find((o) => o.reachable)?.prize.id ?? null, values });
    if (session.screen === 'reveal') session.next();
  }
}

function typesOf(log: PlaytestLog): string[] {
  return log.all().map((event) => event.t);
}

function of<T extends PlaytestEvent['t']>(log: PlaytestLog, t: T): Array<Extract<PlaytestEvent, { t: T }>> {
  return log.all().filter((event): event is Extract<PlaytestEvent, { t: T }> => event.t === t);
}

describe('the playtest log accumulates across a whole sitting', () => {
  /** Two players, one game, a mutation, then three players on a different game. */
  function sitting(): PlaytestLog {
    const log = new PlaytestLog({ sessionId: 'sit', now: clock() });
    const session = new Session({ seed: 'sit', now: clock(), log });

    session.start(seats(2), ['dice', 'market', 'threeOfAKind'], 2);
    playRound(session);
    session.rate({ fun: 'down', clarity: 3 });

    session.openMutations();
    session.applyMutation(session.mutations().find((o) => o.label === 'Add Lowest Wins')!);
    playRound(session);
    session.rate({ fun: 'up' });

    // A different game, and a different number of players.
    session.returnToSetup();
    session.start(seats(3), ['pot', 'bidding'], 2);
    playRound(session);

    return log;
  }

  it('keeps everything from the whole sitting in one log', () => {
    const log = sitting();
    expect(typesOf(log).filter((t) => t === 'gameStart')).toHaveLength(2);
    expect(of(log, 'roundStart')).toHaveLength(3);
    expect(of(log, 'roundEnd')).toHaveLength(3);
    expect(of(log, 'turn')).toHaveLength(6);
    expect(of(log, 'mutation')).toHaveLength(1);
    expect(of(log, 'rating')).toHaveLength(2);
    expect(of(log, 'gameEnd')).toHaveLength(1);
  });

  it('is not cleared by a round ending, a mutation, a new game or setup', () => {
    const log = sitting();
    expect(log.summary).toEqual({ games: 2, rounds: 3, turns: 6 });
    expect(log.all()[0]?.t).toBe('sessionStart');
  });

  it('survives being downloaded', () => {
    const log = sitting();
    const before = log.size;
    expect(log.toJsonl().split('\n')).toHaveLength(before);
    expect(log.size).toBe(before);
  });

  it('stays in chronological order', () => {
    const log = sitting();
    const seqs = log.all().map((event) => event.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  describe('what can be reconstructed afterwards', () => {
    it('the session start and each game with its player count', () => {
      const games = of(sitting(), 'gameStart');
      expect(games.map((game) => game.players)).toEqual([2, 3]);
      expect(games.map((game) => game.gameName)).toEqual([
        'Dice + Market + Three of a Kind',
        'Pot + Bidding',
      ]);
      expect(games[1]?.minRecommendedPlayers).toBe(3);
    });

    it('the mechanics active for every round', () => {
      expect(of(sitting(), 'roundStart').map((round) => round.mechanics)).toEqual([
        ['dice', 'market', 'threeOfAKind'],
        ['dice', 'market', 'threeOfAKind', 'lowestWins'],
        ['pot', 'bidding'],
      ]);
    });

    it('what each mutation changed', () => {
      expect(of(sitting(), 'mutation')[0]).toMatchObject({
        mutation: { op: 'add', mechanic: 'lowestWins' },
        label: 'Add Lowest Wins',
        fromMechanics: ['dice', 'market', 'threeOfAKind'],
        toMechanics: ['dice', 'market', 'threeOfAKind', 'lowestWins'],
        added: ['lowestWins'],
        gone: [],
      });
    });

    it('every player input for every turn', () => {
      const turns = of(sitting(), 'turn');
      const first = turns[0];
      expect(first?.players).toHaveLength(2);
      // Which die each player took is a prepare answer.
      expect(Object.keys(first?.players[0]?.prepare ?? {})).toEqual(['dice']);
      expect(first?.players[0]).toMatchObject({ player: 'p1', name: 'P1' });

      // A bid is a commit answer, revealed with everyone else's.
      const bidding = turns.filter((turn) => turn.players.some((p) => 'bidding' in p.commit));
      expect(bidding.length).toBeGreaterThan(0);
    });

    it('the outcome of every turn, from the frame itself', () => {
      const turn = of(sitting(), 'turn')[0];
      const kinds = new Set((turn?.events ?? []).map((event) => event.t));
      expect(kinds.has('prizeOffered')).toBe(true);
      expect(kinds.has('number')).toBe(true);
      expect(turn?.standings).toHaveLength(2);
    });

    it('turn count, real duration and final standings per round', () => {
      const ends = of(sitting(), 'roundEnd');
      for (const end of ends) {
        expect(end.turnsPlayed).toBe(2);
        expect(end.durationMs).toBeGreaterThan(0);
        expect(end.standings.length).toBeGreaterThan(0);
        expect(end.endedBecause).toBe('turnCap');
      }
    });

    it('ratings, tied to the round they were given for', () => {
      const log = sitting();
      const ratings = of(log, 'rating');
      const rounds = new Set(of(log, 'roundEnd').map((round) => round.roundId));
      expect(ratings[0]).toMatchObject({ fun: 'down', clarity: 3 });
      expect(ratings[1]).toMatchObject({ fun: 'up' });
      for (const rating of ratings) expect(rounds.has(rating.roundId)).toBe(true);
    });

    it('ids that group rounds and turns back under their game', () => {
      const log = sitting();
      const gameIds = new Set(of(log, 'gameStart').map((game) => game.gameId));
      expect(gameIds.size).toBe(2);
      for (const turn of of(log, 'turn')) {
        expect(gameIds.has(turn.gameId)).toBe(true);
        expect(turn.roundId.startsWith(turn.gameId)).toBe(true);
      }
    });
  });

  it('returning to setup keeps the log and starts the next game cleanly', () => {
    const log = new PlaytestLog({ sessionId: 'back', now: clock() });
    const session = new Session({ seed: 'back', now: clock(), log });
    session.start(seats(2), ['pot', 'bidding'], 1);
    playRound(session);
    const before = log.size;

    session.returnToSetup();
    expect(session.screen).toBe('setup');
    expect(log.size).toBeGreaterThan(before);

    session.start(seats(4), ['pot', 'bidding'], 1);
    expect(of(log, 'gameStart').map((game) => game.players)).toEqual([2, 4]);
  });
});
