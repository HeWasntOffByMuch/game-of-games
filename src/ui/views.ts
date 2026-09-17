import type { AssembledGame } from '../assembler/assemble';
import { FRAME_LINES, type TeachDelta } from '../assembler/teach';
import type { GameEvent } from '../frame/events';
import type { InputField, InputSpec, InputValue, Prize } from '../frame/types';
import type { PrizeResolution } from '../frame/resolve';
import type { MutationOption } from '../game/mutate';
import { classes, escape, html, list, seconds } from './dom';
import type { Session } from './session';

export interface Draft {
  prize: string | null;
  pass: boolean;
  amounts: Record<string, number>;
  /** Answered prepare questions: a die face, or yes/no. */
  prepared: Record<string, InputValue>;
}

export interface SetupDraft {
  names: string[];
  maxTurns: number;
  opener: string;
}

/* ------------------------------------------------------------------ setup */

export function setupView(
  draft: SetupDraft,
  openers: AssembledGame[],
  log: { games: number; rounds: number; turns: number },
  confirmClear = false,
): string {
  return html`
    <section class="screen screen--setup">
      <h1>House Rules</h1>
      <p class="lede">Build a small game together, play it, then change one rule and play again.</p>

      <div class="panel">
        <h2>Who is playing?</h2>
        <div class="names">
          ${draft.names.map(
            (name, index) => html`
              <input class="name" data-name-index="${index}" value="${escape(name)}"
                     maxlength="12" aria-label="Player ${index + 1}" />
            `,
          )}
        </div>
        <div class="row">
          <button data-action="remove-player" ${draft.names.length <= 2 ? 'disabled' : ''}>Fewer</button>
          <button data-action="add-player" ${draft.names.length >= 6 ? 'disabled' : ''}>More</button>
        </div>
      </div>

      <div class="panel">
        <h2>How long?</h2>
        <div class="row">
          ${[6, 8, 10, 12].map(
            (turns) => html`
              <button class="${classes('chip', draft.maxTurns === turns && 'chip--on')}"
                      data-action="turns" data-turns="${turns}">${turns} turns</button>
            `,
          )}
        </div>
        <p class="hint">
          Enough turns to work the game out matters more than hitting two minutes.
          You can call time early at any point.
        </p>
      </div>

      <div class="panel">
        <h2>Pick a game to start with</h2>
        <div class="options">
          ${openers.map(
            (game) => html`
              <button class="${classes('option', draft.opener === game.ids.join(',') && 'option--on')}"
                      data-action="opener" data-ids="${game.ids.join(',')}">
                <span class="option__name">${escape(game.name)}</span>
                ${game.minRecommendedPlayers > draft.names.length
                  ? html`<span class="option__note">Played better with ${game.minRecommendedPlayers}+ so far</span>`
                  : ''}
                <span class="option__lines">
                  ${game.teach.map((block) => html`<span>${escape(block.teach)}</span>`)}
                </span>
              </button>
            `,
          )}
        </div>
      </div>

      <button class="primary" data-action="start">Start</button>

      <div class="panel panel--log">
        <h2>Playtest log</h2>
        <p class="hint">
          ${log.games} game${log.games === 1 ? '' : 's'}, ${log.rounds} round${log.rounds === 1 ? '' : 's'},
          ${log.turns} turn${log.turns === 1 ? '' : 's'} recorded so far. It keeps going across games,
          mutations and player counts until you clear it.
        </p>
        <div class="row">
          <button data-action="download-log" ${log.turns === 0 ? 'disabled' : ''}>Download</button>
          <button class="danger" data-action="clear-log" ${log.turns === 0 ? 'disabled' : ''}>
            ${confirmClear ? 'Really clear it?' : 'Clear'}
          </button>
        </div>
      </div>
    </section>
  `;
}

/* ------------------------------------------------------------------ teach */

function rulesStrip(game: AssembledGame): string {
  return html`
    <div class="strip">
      ${game.teach.map(
        (block) => html`
          <div class="card">
            <h3>${escape(block.heading)}</h3>
            <p>${escape(block.teach)}</p>
            ${block.connection ? html`<p class="card__link">${escape(block.connection)}</p>` : ''}
          </div>
        `,
      )}
    </div>
  `;
}

function deltaView(delta: TeachDelta): string {
  return html`
    <div class="delta">
      ${delta.gone.map((block) => html`<div class="card card--gone"><h3>GONE: ${escape(block.heading)}</h3></div>`)}
      ${delta.added.map(
        (block) => html`
          <div class="card card--new">
            <h3>NEW: ${escape(block.heading)}</h3>
            <p>${escape(block.teach)}</p>
            ${block.connection ? html`<p class="card__link">${escape(block.connection)}</p>` : ''}
          </div>
        `,
      )}
      ${delta.changed.map((line) => html`<div class="card card--changed"><h3>CHANGED</h3><p>${escape(line)}</p></div>`)}
    </div>
  `;
}

export function teachView(session: Session): string {
  const game = session.game;
  if (!game) return '';
  return html`
    <section class="screen">
      <p class="eyebrow">Round ${session.roundNumber}</p>
      <h1>${escape(game.name)}</h1>

      ${session.isFirstRound
        ? html`
            <div class="panel panel--frame">
              <h2>House rules</h2>
              <ul>${FRAME_LINES.map((line) => html`<li>${escape(line)}</li>`)}</ul>
              <p class="hint">These never change, whatever game you build.</p>
            </div>
          `
        : ''}

      ${session.delta ? html`<h2>What changed</h2>${deltaView(session.delta)}` : ''}

      <h2>${session.delta ? 'The whole game' : 'This game'}</h2>
      ${rulesStrip(game)}

      <button class="primary" data-action="play">
        ${session.isFirstRound ? 'Start the round' : 'Play again'}
      </button>
    </section>
  `;
}

/* ---------------------------------------------------------------- handoff */

export function handoffView(session: Session): string {
  const seat = session.currentSeat;
  if (!seat || !session.round) return '';
  return html`
    <section class="screen screen--handoff">
      <p class="eyebrow">Turn ${session.round.turn} of ${session.maxTurns}</p>
      <h1>Pass to ${escape(seat.name)}</h1>
      <p class="lede">Everyone else, look away. What ${escape(seat.name)} does is secret until the reveal.</p>
      <button class="primary" data-action="take-seat">I'm ${escape(seat.name)}</button>
      ${standingsStrip(session)}
    </section>
  `;
}

/* ----------------------------------------------------------------- commit */

function turnEvents(session: Session): GameEvent[] {
  const round = session.round;
  if (!round) return [];
  return round.log.all().filter((event) => 'turn' in event && event.turn === round.turn);
}

function prepareAnswer(field: InputField, value: InputValue | undefined): string {
  if (field.kind === 'pickOne') return `Taking ${String(value)}.`;
  return value ? 'Done.' : 'Kept.';
}

function numberPanel(session: Session, spec: InputSpec, pending: boolean): string {
  if (spec.strengthParts.length === 0 && spec.strength === 0) return '';
  const changes = turnEvents(session).filter(
    (event): event is Extract<GameEvent, { t: 'numberChanged' }> =>
      event.t === 'numberChanged' && event.player === spec.player,
  );
  const busted = changes.some((change) => change.note === 'bust');

  const rolled = spec.strengthParts.filter((part) => part.parts.length > 1);

  return html`
    <div class="${classes('panel', 'panel--number', busted && 'panel--bust')}">
      <p class="label">${pending && !busted ? 'Your roll' : 'Your number'}</p>
      ${pending && !busted
        ? html`<p class="big">${rolled.flatMap((part) => part.parts).join(' &middot; ')}</p>`
        : html`<p class="big">${spec.strength}</p>`}
      ${pending || rolled.length === 0
        ? ''
        : rolled.map(
            (part) => html`<p class="hint">${escape(session.mechanicName(part.source))} of ${part.parts.join(', ')}</p>`,
          )}
      ${busted
        ? html`<p class="bust">Doubles. You're out of this turn.</p>`
        : changes.length > 0
          ? html`<p class="hint">Changed from ${changes[0]?.from}.</p>`
          : ''}
    </div>
  `;
}

function prizeLine(prize: Prize): string {
  return prize.minStrength === undefined
    ? escape(prize.label)
    : `${escape(prize.label)} <span class="price">needs ${prize.minStrength}</span>`;
}

export function commitView(session: Session, draft: Draft): string {
  const seat = session.currentSeat;
  const round = session.round;
  if (!seat || !round) return '';
  const spec = round.specFor(seat.id);
  const points = round.players.find((p) => p.id === seat.id)?.points ?? 0;
  const cards = round.players.find((p) => p.id === seat.id)?.cards ?? [];

  // Prepare choices change your number, so they have to be settled before you
  // pick what to go for - otherwise a reroll could make your pick unreachable.
  const pending = spec.prepare.filter(
    (field) => field.enabled && draft.prepared[field.mechanic] === undefined,
  );
  const ready = pending.length === 0 && (draft.pass || draft.prize !== null || spec.autoClaim);

  return html`
    <section class="screen screen--commit">
      <p class="eyebrow">Turn ${round.turn} of ${session.maxTurns} &middot; ${points} points</p>
      <h1>${escape(seat.name)}</h1>

      ${numberPanel(session, spec, pending.length > 0)}

      ${cards.length > 0
        ? html`<p class="holdings">You hold: ${cards.map((card) => html`<span class="pill">${escape(card.symbol)}</span>`)}</p>`
        : ''}

      ${spec.prepare.map(
        (field) => html`
          <div class="panel">
            <p class="label">${escape(field.label)}</p>
            ${!field.enabled
              ? html`<p class="hint">${escape(field.note ?? 'Not available')}</p>`
              : draft.prepared[field.mechanic] !== undefined
                ? html`<p class="hint">${prepareAnswer(field, draft.prepared[field.mechanic])}</p>`
                : field.kind === 'pickOne'
                  ? html`
                      <div class="row">
                        ${(field.choices ?? []).map(
                          (choice, index) => html`
                            <button class="die" data-action="prepare" data-mechanic="${field.mechanic}"
                                    data-value="${choice.value}" data-index="${index}">
                              ${escape(choice.label)}
                            </button>
                          `,
                        )}
                      </div>
                    `
                  : html`
                      <div class="row">
                        <button data-action="prepare" data-mechanic="${field.mechanic}" data-value="yes">Yes</button>
                        <button data-action="prepare" data-mechanic="${field.mechanic}" data-value="no">No</button>
                      </div>
                    `}
          </div>
        `,
      )}

      ${pending.length > 0
        ? html`
            <div class="panel panel--offers">
              <p class="label">On offer this turn</p>
              <ul class="offers">
                ${spec.prizes.map((option) => html`<li>${prizeLine(option.prize)}</li>`)}
              </ul>
              <p class="hint">Answer the question above, then pick.</p>
            </div>
          `
        : ''}

      ${pending.length > 0 ? '' : spec.commit.map(
        (field) => html`
          <div class="panel">
            <label class="label" for="amount-${field.mechanic}">${escape(field.label)}</label>
            ${field.enabled
              ? html`
                  <input id="amount-${field.mechanic}" class="amount" type="number" inputmode="numeric"
                         data-amount="${field.mechanic}"
                         min="${field.min ?? 0}" max="${field.max ?? 0}"
                         value="${draft.amounts[field.mechanic] ?? field.min ?? 0}" />
                  <p class="hint">${field.min ?? 0} to ${field.max ?? 0}. 0 sits this turn out.</p>
                `
              : html`<p class="hint">${escape(field.note ?? 'Not available')}</p>`}
          </div>
        `,
      )}

      ${pending.length > 0
        ? ''
        : spec.autoClaim
        ? html`<p class="hint">There is only one prize: ${prizeLine(spec.prizes[0]?.prize as Prize)}.</p>`
        : html`
            <div class="panel">
              <p class="label">Pick a prize</p>
              <div class="options">
                ${spec.prizes.map(
                  (option) => html`
                    <button class="${classes('option', draft.prize === option.prize.id && 'option--on')}"
                            data-action="pick" data-prize="${option.prize.id}"
                            ${option.reachable ? '' : 'disabled'}>
                      <span class="option__name">${prizeLine(option.prize)}</span>
                      ${option.note ? html`<span class="option__note">${escape(option.note)}</span>` : ''}
                    </button>
                  `,
                )}
                <button class="${classes('option', 'option--pass', draft.pass && 'option--on')}"
                        data-action="pick" data-prize="">Pass</button>
              </div>
            </div>
          `}

      <button class="primary" data-action="lock-in" ${ready ? '' : 'disabled'}>Lock it in</button>
    </section>
  `;
}

/* ----------------------------------------------------------------- reveal */

function resolutionView(session: Session, resolution: PrizeResolution): string {
  const name = (id: string): string => escape(session.nameOf(id));
  const cancelled = new Set(resolution.cancelled.flatMap((group) => group.players));
  const dropped = new Map(resolution.dropped.map((drop) => [drop.claim.player, drop.reason]));

  return html`
    <div class="resolution">
      <h3>${prizeLine(resolution.prize)}</h3>
      ${resolution.claims.length === 0
        ? html`<p class="hint">Nobody went for it.</p>`
        : html`
            <ul class="claims">
              ${resolution.claims.map((claim) => {
                const drop = dropped.get(claim.player);
                const state = resolution.winner?.player === claim.player
                  ? 'claim--win'
                  : drop
                    ? 'claim--out'
                    : cancelled.has(claim.player)
                      ? 'claim--tied'
                      : '';
                const note = resolution.winner?.player === claim.player
                  ? 'wins'
                  : drop === 'zero'
                    ? 'sat out'
                    : drop === 'belowRequirement'
                      ? "didn't reach it"
                      : cancelled.has(claim.player)
                        ? 'cancelled'
                        : 'beaten';
                return html`
                  <li class="${classes('claim', state)}">
                    <span>${name(claim.player)}</span>
                    <span class="claim__value">${claim.strength}</span>
                    <span class="claim__note">${note}</span>
                  </li>
                `;
              })}
            </ul>
          `}
      ${resolution.cancelled.map(
        (group) => html`
          <p class="cancelled">
            ${list(group.players.map(name))} ${group.players.length > 2 ? 'all' : 'both'}
            played ${group.strength}, so they cancel.
          </p>
        `,
      )}
      ${resolution.winner === null && resolution.claims.length > 0
        ? html`<p class="hint">Nobody wins it.</p>`
        : ''}
    </div>
  `;
}

export function revealView(session: Session): string {
  const round = session.round;
  if (!round) return '';
  const scores = turnEvents(session).filter(
    (event): event is Extract<GameEvent, { t: 'points' }> => event.t === 'points',
  );
  const notes = turnEvents(session).filter(
    (event): event is Extract<GameEvent, { t: 'note' }> => event.t === 'note',
  );
  const lastTurn = round.turn >= session.maxTurns;

  return html`
    <section class="screen">
      <p class="eyebrow">Turn ${round.turn} of ${session.maxTurns}</p>
      <h1>Reveal</h1>
      ${round.comparison === 'lowest' ? html`<p class="lede">Lowest number wins this turn.</p>` : ''}
      ${round.resolutions.map((resolution) => resolutionView(session, resolution))}

      ${scores.length > 0
        ? html`
            <div class="panel">
              <h2>Points</h2>
              <ul>
                ${scores.map(
                  (score) => html`
                    <li>${escape(session.nameOf(score.player))}
                      ${score.delta > 0 ? '+' : ''}${score.delta}
                      ${score.note ? html`<span class="hint">(${escape(score.note)})</span>` : ''}
                    </li>
                  `,
                )}
              </ul>
            </div>
          `
        : ''}
      ${notes.map((note) => html`<p class="hint">${escape(note.text)}</p>`)}

      ${standingsStrip(session)}

      <div class="row">
        <button class="primary" data-action="next-turn">${lastTurn ? 'See the result' : 'Next turn'}</button>
        <button data-action="stop">Call time</button>
      </div>
    </section>
  `;
}

/* ---------------------------------------------------------------- results */

function standingsStrip(session: Session): string {
  const round = session.round;
  if (!round) return '';
  return html`
    <ul class="standings">
      ${round.standings().map(
        (standing) => html`
          <li><span class="standings__rank">${standing.rank}</span>
            ${escape(session.nameOf(standing.player))}
            <span class="standings__points">${standing.points}</span>
          </li>
        `,
      )}
    </ul>
  `;
}

export function resultsView(session: Session): string {
  const record = session.lastRound;
  const round = session.round;
  if (!record || !round) return '';
  const winners = record.winners.map((id: string) => session.nameOf(id));

  return html`
    <section class="screen">
      <p class="eyebrow">${escape(record.gameName)}</p>
      <h1>${winners.length === 1 ? `${escape(winners[0] as string)} wins` : `${escape(list(winners))} draw`}</h1>
      ${standingsStrip(session)}
      <p class="hint">${record.turnsPlayed} turns in ${seconds(record.durationMs)}.</p>

      <div class="panel">
        <h2>Was that fun?</h2>
        <div class="row">
          <button class="${classes('chip', record.fun === 'up' && 'chip--on')}" data-action="fun" data-value="up">Yes</button>
          <button class="${classes('chip', record.fun === 'down' && 'chip--on')}" data-action="fun" data-value="down">Not really</button>
        </div>
        <h2>Did the rules make sense?</h2>
        <div class="row">
          ${[1, 2, 3, 4, 5].map(
            (score) => html`
              <button class="${classes('chip', record.clarity === score && 'chip--on')}"
                      data-action="clarity" data-value="${score}">${score}</button>
            `,
          )}
        </div>
        <p class="hint">1 = lost, 5 = obvious. Skip it if you'd rather.</p>
      </div>

      <button class="primary" data-action="mutate">Change the game</button>
      <button class="quiet" data-action="setup">Start a different game</button>
    </section>
  `;
}

/* ----------------------------------------------------------------- mutate */

export function mutateView(session: Session, options: MutationOption[]): string {
  return html`
    <section class="screen">
      <p class="eyebrow">Round ${session.roundNumber + 1}</p>
      <h1>Change one thing</h1>
      <p class="lede">Everything here still makes a game that works. Agree on one.</p>
      <div class="options options--mutations">
        ${options.map(
          (option, index) => html`
            <button class="option" data-action="apply-mutation" data-index="${index}">
              <span class="option__name">${escape(option.label)}</span>
              ${option.game.minRecommendedPlayers > session.seats.length
                ? html`<span class="option__note">Played better with ${option.game.minRecommendedPlayers}+ so far</span>`
                : ''}
              <span class="option__lines">
                ${option.delta.gone.map((block) => html`<span class="gone">GONE: ${escape(block.heading)}</span>`)}
                ${option.delta.added.map(
                  (block) => html`
                    <span>${escape(block.teach)}</span>
                    ${block.connection ? html`<span class="card__link">${escape(block.connection)}</span>` : ''}
                  `,
                )}
                ${option.delta.changed.map((line) => html`<span class="changed">${escape(line)}</span>`)}
              </span>
            </button>
          `,
        )}
      </div>
      <button class="quiet" data-action="setup">Start a different game instead</button>
    </section>
  `;
}
