import type { TurnInput } from '../frame/types';
import { save, toJsonl } from '../playtest/log';
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

const session = new Session();
const openers = Session.openers();

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
      root.innerHTML = setupView(setup, openers);
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

function downloadLog(): void {
  const body = toJsonl(session.record);
  if (!body) return;
  const url = URL.createObjectURL(new Blob([body], { type: 'application/x-ndjson' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `house-rules-${session.record.sessionId}.jsonl`;
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
    const value = target.dataset.value === 'yes';
    session.applyPrepare(mechanic, value);
    draft.prepared[mechanic] = value;
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
    save(session.record, localStorage);
  },
  clarity: (target) => {
    session.rate({ clarity: Number(target.dataset.value) });
    save(session.record, localStorage);
  },
  mutate: () => {
    save(session.record, localStorage);
    session.openMutations();
  },
  'apply-mutation': (target) => {
    const option = session.mutations()[Number(target.dataset.index)];
    if (option) session.applyMutation(option);
  },
  'download-log': downloadLog,
};

root.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
  if (!target || target.hasAttribute('disabled')) return;
  const action = actions[target.dataset.action ?? ''];
  if (!action) return;
  action(target);
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
