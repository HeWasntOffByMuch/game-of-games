import { describe, expect, it } from 'vitest';
import { escape, list, seconds } from '../../src/ui/dom';
import { Session } from '../../src/ui/session';
import {
  commitView,
  handoffView,
  mutateView,
  resultsView,
  revealView,
  setupView,
  teachView,
  type Draft,
} from '../../src/ui/views';

const SEATS = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Bo' },
  { id: 'p3', name: 'Cy' },
];

const emptyDraft = (): Draft => ({ prize: null, pass: false, amounts: {}, prepared: {} });

/** HTML collapses whitespace; assertions should too. */
const flat = (markup: string): string => markup.replace(/\s+/g, ' ');

function session(ids = ['dice', 'market', 'threeOfAKind'], maxTurns = 2, seed = 'views'): Session {
  let time = 0;
  const made = new Session({ seed, now: () => (time += 1000) });
  made.start(SEATS, ids, maxTurns);
  return made;
}

describe('helpers', () => {
  it('escapes anything a player typed', () => {
    expect(escape('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;');
  });

  it('reads a list of names the way a person would', () => {
    expect(list(['Ada'])).toBe('Ada');
    expect(list(['Ada', 'Bo'])).toBe('Ada and Bo');
    expect(list(['Ada', 'Bo', 'Cy'])).toBe('Ada, Bo and Cy');
  });

  it('shows a round length in plain units', () => {
    expect(seconds(45_000)).toBe('45s');
    expect(seconds(135_000)).toBe('2m 15s');
  });
});

describe('screens', () => {
  it('escapes a player name rather than rendering it as markup', () => {
    const made = new Session({ seed: 'x' });
    made.start([{ id: 'p1', name: '<b>Ada' }, { id: 'p2', name: 'Bo' }], ['pot', 'bidding'], 2);
    made.beginPlay();
    expect(handoffView(made)).toContain('&lt;b&gt;Ada');
    expect(handoffView(made)).not.toContain('<b>Ada');
  });

  it('shows the house rules only in the first round', () => {
    const made = session();
    expect(teachView(made)).toContain('House rules');
    expect(teachView(made)).toContain('Tied numbers cancel out');
  });

  it('teaches the delta and the whole game after a mutation', () => {
    const made = session(['dice', 'market', 'threeOfAKind'], 1);
    made.beginPlay();
    for (const _ of SEATS) {
      made.takeSeat();
      made.commit({ prize: null, values: {} });
    }
    made.next();
    made.applyMutation(made.mutations().find((o) => o.label === 'Add Reroll')!);

    const view = teachView(made);
    expect(view).toContain('What changed');
    expect(view).toContain('NEW: REROLL');
    expect(view).not.toContain('House rules');
  });

  describe('the private commit panel', () => {
    it('will not let a player pick before answering every prepare question', () => {
      const made = session(['dice', 'market', 'threeOfAKind', 'reroll'], 2);
      made.beginPlay();
      made.takeSeat();

      // Reroll is asked first, because it replaces the dice being chosen from.
      const spec = made.round!.specFor('p1');
      expect(spec.prepare.map((field) => field.mechanic)).toEqual(['reroll', 'dice']);

      const before = commitView(made, emptyDraft());
      expect(before).toContain('Reroll?');
      expect(before).toContain('On offer this turn');
      expect(before).not.toContain('Pick a prize');
      expect(flat(before)).toContain('data-action="lock-in" disabled');

      // Answering only the reroll is not enough: the die is still unchosen.
      const half = commitView(made, { ...emptyDraft(), prepared: { reroll: false } });
      expect(half).toContain('Which die is your number?');
      expect(half).not.toContain('Pick a prize');

      const face = spec.prepare[1]?.choices?.[0]?.value as number;
      made.applyPrepare('dice', face);
      const after = commitView(made, { ...emptyDraft(), prepared: { reroll: false, dice: face } });
      expect(after).toContain('Pick a prize');
      expect(after).toContain(`Taking ${face}.`);
    });

    it('offers each rolled face as its own button', () => {
      const made = session(['dice', 'market', 'threeOfAKind'], 2);
      made.beginPlay();
      made.takeSeat();
      const faces = made.round!.specFor('p1').prepare[0]?.choices ?? [];
      const view = flat(commitView(made, emptyDraft()));
      expect(faces).toHaveLength(2);
      for (const face of faces) {
        expect(view).toContain(`data-action="prepare" data-mechanic="dice" data-value="${face.value}"`);
      }
      // The roll is shown, but it is not a number until one is chosen.
      expect(view).toContain('Your roll');
      expect(view).not.toContain('Your number');
      // And the prizes are visible while choosing, or the choice is blind.
      const prices = made.round!.specFor('p1').prizes.map((o) => o.prize.minStrength);
      for (const price of prices) expect(view).toContain(`needs ${price}`);
    });

    it('marks a prize the player cannot reach as unpickable', () => {
      // Find a roll that cannot afford everything on offer; with a low die and
      // prices up to six, that is common but not guaranteed at any one seed.
      let made = session();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        made = session(['dice', 'market', 'threeOfAKind'], 2, `reach${attempt}`);
        made.beginPlay();
        made.takeSeat();
        const faces = made.round!.specFor('p1').prepare[0]?.choices ?? [];
        made.applyPrepare('dice', Math.min(...faces.map((choice) => choice.value)));
        if (made.round!.specFor('p1').prizes.some((option) => !option.reachable)) break;
      }
      const face = made.round!.specFor('p1').strength;

      const spec = made.round!.specFor('p1');
      const view = flat(commitView(made, { ...emptyDraft(), prepared: { dice: face } }));
      const unreachable = spec.prizes.filter((option) => !option.reachable);
      expect(unreachable.length).toBeGreaterThan(0);
      for (const option of unreachable) {
        expect(view).toContain(`data-prize="${option.prize.id}" disabled`);
      }
      for (const option of spec.prizes.filter((o) => o.reachable)) {
        expect(view).toContain(`data-prize="${option.prize.id}" >`);
      }
    });

    it('asks for one decision only when there is a single prize', () => {
      const made = session(['pot', 'bidding'], 2);
      made.beginPlay();
      made.takeSeat();
      const view = commitView(made, emptyDraft());
      expect(view).toContain('Bid');
      expect(view).not.toContain('Pick a prize');
      expect(view).toContain('There is only one prize');
    });
  });

  it('shows cancelled claims as cancelled on the reveal', () => {
    const made = session(['pot', 'bidding'], 1);
    made.beginPlay();
    for (const bid of [2, 2, 5]) {
      made.takeSeat();
      made.commit({ prize: null, values: { bidding: bid } });
    }
    const view = flat(revealView(made));
    expect(view).toContain('claim--tied');
    expect(view).toContain('Ada and Bo both played 2, so they cancel.');
    expect(view).toContain('claim--win');
  });

  it('names every winner when a round is drawn', () => {
    const made = session(['dice', 'market', 'threeOfAKind'], 1);
    made.beginPlay();
    for (const _ of SEATS) {
      made.takeSeat();
      made.commit({ prize: null, values: {} });
    }
    made.next();
    expect(resultsView(made)).toContain('Ada, Bo and Cy draw');
  });

  it('previews every mutation with what it would teach', () => {
    const made = session();
    const view = mutateView(made, made.mutations());
    expect(view).toContain('Add Reroll');
    expect(view).toContain('You may reroll once');
    expect(view).toContain('Same game, one more round');
  });

  it('lists only openers that assemble on the setup screen', () => {
    const view = setupView(
      { names: ['Ada', 'Bo'], maxTurns: 8, opener: 'pot,bidding' },
      Session.openers(),
      { games: 0, rounds: 0, turns: 0 },
    );
    expect(view).toContain('data-ids="pot,bidding"');
    expect(view).not.toContain('data-ids="dice,market"');
  });

  it('warns when an opener wants more players than are seated', () => {
    const view = setupView(
      { names: ['Ada', 'Bo'], maxTurns: 8, opener: 'pot,bidding' },
      Session.openers(),
      { games: 0, rounds: 0, turns: 0 },
    );
    expect(view).toContain('Played better with 3+ so far');
  });

  it('shows what the playtest log holds, and offers to clear it separately', () => {
    const view = flat(
      setupView(
        { names: ['Ada', 'Bo'], maxTurns: 8, opener: 'pot,bidding' },
        Session.openers(),
        { games: 2, rounds: 5, turns: 34 },
      ),
    );
    expect(view).toContain('2 games, 5 rounds, 34 turns recorded so far');
    expect(view).toContain('data-action="download-log"');
    expect(view).toContain('data-action="clear-log"');
  });

  it('asks twice before clearing', () => {
    const draft = { names: ['Ada', 'Bo'], maxTurns: 8, opener: 'pot,bidding' };
    const log = { games: 1, rounds: 1, turns: 4 };
    expect(flat(setupView(draft, Session.openers(), log, false))).toContain('> Clear <');
    expect(setupView(draft, Session.openers(), log, true)).toContain('Really clear it?');
  });
});
