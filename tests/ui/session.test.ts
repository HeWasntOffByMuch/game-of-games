import { describe, expect, it } from 'vitest';
import { Session } from '../../src/ui/session';

const SEATS = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Bo' },
  { id: 'p3', name: 'Cy' },
];

function clock(): () => number {
  let time = 0;
  return () => (time += 1000);
}

function started(ids = ['dice', 'market', 'threeOfAKind'], maxTurns = 2): Session {
  const session = new Session({ seed: 'ui-test', now: clock() });
  session.start(SEATS, ids, maxTurns);
  return session;
}

/** Plays one whole turn, passing the screen between seats. */
function playTurn(session: Session): void {
  for (let i = 0; i < SEATS.length; i += 1) {
    expect(session.screen).toBe('handoff');
    session.takeSeat();
    expect(session.screen).toBe('commit');
    const seat = session.currentSeat!;

    for (const field of session.round!.specFor(seat.id).prepare) {
      if (!field.enabled) continue;
      const first = field.choices?.[0]?.value;
      session.applyPrepare(field.mechanic, field.kind === 'pickOne' ? (first ?? 0) : false);
    }

    const spec = session.round!.specFor(seat.id);
    const values: Record<string, number | boolean> = {};
    for (const field of spec.commit) values[field.mechanic] = field.min ?? 0;
    session.commit({ prize: spec.prizes.find((o) => o.reachable)?.prize.id ?? null, values });
  }
}

describe('hot-seat session', () => {
  it('offers only openers that assemble', () => {
    const openers = Session.openers();
    expect(openers.length).toBeGreaterThan(0);
    expect(openers.every((game) => game.ids.length >= 2 && game.ids.length <= 3)).toBe(true);
    expect(openers.map((g) => g.ids.join('+'))).toContain('dice+market+threeOfAKind');
    expect(openers.map((g) => g.ids.join('+'))).toContain('pot+bidding');
  });

  it('never offers an opener with a dead end', () => {
    expect(Session.openers().map((g) => g.ids.join('+'))).not.toContain('dice+market');
  });

  it('teaches the game before the first turn', () => {
    const session = started();
    expect(session.screen).toBe('teach');
    expect(session.isFirstRound).toBe(true);
    expect(session.game?.teach.map((b) => b.heading)).toEqual(['DICE', 'MARKET', 'THREE OF A KIND']);
  });

  it('passes the screen from seat to seat, then reveals', () => {
    const session = started();
    session.beginPlay();
    expect(session.currentSeat?.name).toBe('Ada');

    session.takeSeat();
    session.commit({ prize: null, values: {} });
    expect(session.screen).toBe('handoff');
    expect(session.currentSeat?.name).toBe('Bo');

    session.takeSeat();
    session.commit({ prize: null, values: {} });
    session.takeSeat();
    session.commit({ prize: null, values: {} });
    expect(session.screen).toBe('reveal');
  });

  it('runs to the turn cap and then shows the result', () => {
    const session = started(['dice', 'market', 'threeOfAKind'], 2);
    session.beginPlay();
    playTurn(session);
    session.next();
    playTurn(session);
    session.next();
    expect(session.screen).toBe('results');
    expect(session.round?.isOver).toBe(true);
  });

  it('summarises the round just played for the results screen', () => {
    const session = started(['dice', 'market', 'threeOfAKind'], 1);
    session.beginPlay();
    playTurn(session);
    session.next();

    expect(session.lastRound).toMatchObject({
      gameName: 'Dice + Market + Three of a Kind',
      turnsPlayed: 1,
      endedBecause: 'turnCap',
    });
    expect(session.lastRound?.durationMs).toBeGreaterThan(0);
  });

  it('keeps optional ratings against the round just played', () => {
    const session = started(['dice', 'market', 'threeOfAKind'], 1);
    session.beginPlay();
    playTurn(session);
    session.next();
    session.rate({ fun: 'up', clarity: 4 });
    expect(session.lastRound).toMatchObject({ fun: 'up', clarity: 4 });
  });

  it('can be stopped early and still produce a result', () => {
    const session = started(['dice', 'market', 'threeOfAKind'], 8);
    session.beginPlay();
    playTurn(session);
    session.stop();
    expect(session.screen).toBe('results');
    expect(session.lastRound?.endedBecause).toBe('stopped');
  });

  describe('mutating between rounds', () => {
    it('offers keeping the game as well as changing it', () => {
      const session = started();
      const labels = session.mutations().map((option) => option.label);
      expect(labels).toContain('Same game, one more round');
      expect(labels).toContain('Add Reroll');
    });

    it('teaches only the delta after a change', () => {
      const session = started(['dice', 'market', 'threeOfAKind'], 1);
      session.beginPlay();
      playTurn(session);
      session.next();

      session.openMutations();
      const addReroll = session.mutations().find((o) => o.label === 'Add Reroll');
      session.applyMutation(addReroll!);

      expect(session.screen).toBe('teach');
      expect(session.isFirstRound).toBe(false);
      expect(session.ids).toEqual(['dice', 'market', 'threeOfAKind', 'reroll']);
      expect(session.delta?.added.map((b) => b.heading)).toEqual(['REROLL']);
    });

    it('shows no delta when the group keeps the same game', () => {
      const session = started(['dice', 'market', 'threeOfAKind'], 1);
      session.beginPlay();
      playTurn(session);
      session.next();

      const keep = session.mutations().find((o) => o.mutation.op === 'keep');
      session.applyMutation(keep!);
      expect(session.delta).toBeNull();
      expect(session.ids).toEqual(['dice', 'market', 'threeOfAKind']);
    });

    it('records which mutation produced each round', () => {
      const session = started(['dice', 'market', 'threeOfAKind'], 1);
      session.beginPlay();
      playTurn(session);
      session.next();
      session.applyMutation(session.mutations().find((o) => o.label === 'Add Reroll')!);
      session.beginPlay();
      playTurn(session);
      session.next();

      const starts = session.log.all().filter((event) => event.t === 'roundStart');
      expect(starts.map((event) => (event.t === 'roundStart' ? event.mutation : null))).toEqual([
        null,
        { op: 'add', mechanic: 'reroll' },
      ]);
    });

    it('gives each round its own seed, so a repeat is a new game', () => {
      const session = started(['dice', 'market', 'threeOfAKind'], 1);
      session.beginPlay();
      playTurn(session);
      session.next();
      session.applyMutation(session.mutations().find((o) => o.mutation.op === 'keep')!);
      session.beginPlay();
      playTurn(session);
      session.next();

      const seeds = session.log
        .all()
        .flatMap((event) => (event.t === 'roundStart' ? [event.seed] : []));
      expect(new Set(seeds).size).toBe(seeds.length);
    });
  });

  it('plays Lowest Unique Bid with a single decision per player', () => {
    const session = started(['pot', 'bidding', 'lowestWins'], 1);
    session.beginPlay();
    session.takeSeat();
    const spec = session.round!.specFor('p1');
    expect(spec.autoClaim).toBe(true);
    expect(spec.commit.map((f) => f.label)).toEqual(['Bid']);
  });
});
