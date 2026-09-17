import type { TurnInput } from '../frame/types';
import { PlaytestLog } from '../playtest/log';
import { Session } from './session';
import {
  commitView,
  handoffView,
  mutateView,
  resultsView,
  revealView,
  setupView,
  teachView,
  type Draft,
  type SetupDraft,
} from './views';

const root = document.getElementById('app');
if (!root) throw new Error('No #app element');

// One accumulating record for the whole sitting. It survives a refresh, and
// nothing but the tester's own "Clear" ever empties it.
const log = PlaytestLog.restore(localStorage) ?? new PlaytestLog();
const session = new Session({ log });
const openers = Session.openers();

let confirmClear = false;

const setup: SetupDraft = {
  names: ['Ada', 'Bo', 'Cy'],
  maxTurns: 8,
  opener: openers[0]?.ids.join(',') ?? '',
};

let draft: Draft = emptyDraft();

function emptyDraft(): Draft {
  return { prize: null, pass: false, amounts: {}, prepared: {} };
}

function render(): void {
  if (!root) return;
  switch (session.screen) {
    case 'setup':
      root.innerHTML = setupView(setup, openers, log.summary, confirmClear);
      break;
    case 'teach':
      root.innerHTML = teachView(session);
      break;
    case 'handoff':
      root.innerHTML = handoffView(session);
      break;
    case 'commit':
      root.innerHTML = commitView(session, draft);
      break;
    case 'reveal':
      root.innerHTML = revealView(session);
      break;
    case 'results':
      root.innerHTML = resultsView(session);
      break;
    case 'mutate':
      root.innerHTML = mutateView(session, session.mutations());
      break;
    default:
      root.innerHTML = '';
  }
}

function currentInput(): TurnInput {
  const seat = session.currentSeat;
  const round = session.round;
  if (!seat || !round) return { prize: null, values: {} };
  const spec = round.specFor(seat.id);
  const values: Record<string, number | boolean> = {};
  for (const field of spec.commit) {
    if (!field.enabled) continue;
    values[field.mechanic] = draft.amounts[field.mechanic] ?? field.min ?? 0;
  }
  return { prize: draft.pass ? null : draft.prize, values };
}

/** Downloading never clears the log: an accidental download must not lose data. */
function downloadLog(): void {
  const body = log.toJsonl();
  if (!body) return;
  const url = URL.createObjectURL(new Blob([body], { type: 'application/x-ndjson' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `house-rules-${log.sessionId}.jsonl`;
  link.click();
  URL.revokeObjectURL(url);
}

const actions: Record<string, (target: HTMLElement) => void> = {
  'add-player': () => {
    setup.names = [...setup.names, `P${setup.names.length + 1}`];
  },
  'remove-player': () => {
    setup.names = setup.names.slice(0, -1);
  },
  turns: (target) => {
    setup.maxTurns = Number(target.dataset.turns);
  },
  opener: (target) => {
    setup.opener = target.dataset.ids ?? '';
  },
  start: () => {
    const seats = setup.names.map((name, index) => ({ id: `p${index + 1}`, name: name.trim() || `P${index + 1}` }));
    session.start(seats, setup.opener.split(','), setup.maxTurns);
  },
  play: () => {
    draft = emptyDraft();
    session.beginPlay();
  },
  'take-seat': () => {
    draft = emptyDraft();
    session.takeSeat();
  },
  prepare: (target) => {
    const mechanic = target.dataset.mechanic ?? '';
    const raw = target.dataset.value ?? '';
    const value: number | boolean =
      raw === 'yes' ? true : raw === 'no' ? false : Number(raw);
    session.applyPrepare(mechanic, value);
    draft.prepared[mechanic] = value;
    // The number just changed, so any earlier pick may no longer be reachable.
    draft.prize = null;
    draft.pass = false;
  },
  pick: (target) => {
    const prize = target.dataset.prize ?? '';
    draft.pass = prize === '';
    draft.prize = prize === '' ? null : prize;
  },
  'lock-in': () => {
    session.commit(currentInput());
    draft = emptyDraft();
  },
  'next-turn': () => {
    session.next();
  },
  stop: () => {
    session.stop();
  },
  fun: (target) => {
    session.rate({ fun: target.dataset.value === 'up' ? 'up' : 'down' });
  },
  clarity: (target) => {
    session.rate({ clarity: Number(target.dataset.value) });
  },
  mutate: () => {
    session.openMutations();
  },
  setup: () => {
    session.returnToSetup();
  },
  'apply-mutation': (target) => {
    const option = session.mutations()[Number(target.dataset.index)];
    if (option) session.applyMutation(option);
  },
  'download-log': downloadLog,
  // Two taps, so a mis-click cannot destroy a sitting's evidence.
  'clear-log': () => {
    if (!confirmClear) {
      confirmClear = true;
      return;
    }
    confirmClear = false;
    log.clear();
    PlaytestLog.forget(localStorage);
  },
};

root.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
  if (!target || target.hasAttribute('disabled')) return;
  const action = actions[target.dataset.action ?? ''];
  if (!action) return;
  if (target.dataset.action !== 'clear-log') confirmClear = false;
  action(target);
  // A playtest is worth more than a tidy save path: keep the record current
  // after every action, so closing the laptop loses nothing.
  if (log.size > 0) log.save(localStorage);
  render();
});

root.addEventListener('input', (event) => {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;
  if (target.dataset.amount) {
    draft.amounts[target.dataset.amount] = Number(target.value);
  }
  if (target.dataset.nameIndex) {
    setup.names[Number(target.dataset.nameIndex)] = target.value;
  }
});

render();
