import { assemble, assembleOrThrow, type AssembledGame } from '../assembler/assemble';
import { teachDelta, type TeachDelta } from '../assembler/teach';
import type { Round } from '../frame/round';
import type { GameEvent } from '../frame/events';
import type { Standing } from '../frame/ranking';
import type { InputValue, PlayerId, TurnInput } from '../frame/types';
import { createGame } from '../game/createGame';
import { legalMutations, type Mutation, type MutationOption } from '../game/mutate';
import { CATALOGUE } from '../mechanics/catalogue';
import { PlaytestLog, type TurnPlayerRecord } from '../playtest/log';

export type Screen =
  | 'setup'
  /** Rules strip, before the first turn of a game. */
  | 'teach'
  /** "Pass the laptop to Ada" - nobody should be looking at the previous panel. */
  | 'handoff'
  /** One player's private decision. */
  | 'commit'
  | 'reveal'
  | 'results'
  | 'mutate';

export interface SessionOptions {
  seed?: string;
  now?: () => number;
  /**
   * The accumulating playtest record. It outlives games, mutations and trips
   * back to setup: only the tester clears it.
   */
  log?: PlaytestLog;
}

/** Just enough of the round just played for the results screen to render. */
export interface RoundSummary {
  gameId: string;
  roundId: string;
  gameName: string;
  turnsPlayed: number;
  durationMs: number;
  endedBecause: 'turnCap' | 'stopped';
  standings: Standing[];
  winners: PlayerId[];
  fun?: 'up' | 'down';
  clarity?: number;
}

export interface PlayerSeat {
  id: PlayerId;
  name: string;
}

/**
 * The hot-seat session: several people round one screen. It owns the screen
 * transitions and the playtest record, and knows nothing about the DOM, so
 * the flow can be tested without a browser.
 *
 * Hidden information is preserved by taking commits one at a time behind a
 * handoff screen, rather than by giving everyone a device
 * (docs/DECISIONS.md D14).
 */
export class Session {
  screen: Screen = 'setup';
  seats: PlayerSeat[] = [];
  ids: string[] = [];
  roundNumber = 0;
  maxTurns = 8;
  game: AssembledGame | null = null;
  round: Round | null = null;
  /** What the last mutation changed, shown instead of the whole rules strip. */
  delta: TeachDelta | null = null;
  lastMutation: Mutation | null = null;
  lastRound: RoundSummary | null = null;
  readonly log: PlaytestLog;

  private readonly seed: string;
  private readonly now: () => number;
  private seatIndex = 0;
  private roundStartedAt = 0;
  private turnStartedAt = 0;
  private turnDurations: number[] = [];
  private gameId = '';
  private roundId = '';
  private gameCount = 0;
  private pendingMutation: Mutation | null = null;
  private turnInputs = new Map<PlayerId, { prepare: Record<string, InputValue>; commit: Record<string, InputValue> }>();
  private choices = new Map<PlayerId, string | null>();
  private logMark = 0;

  constructor(options: SessionOptions = {}) {
    this.seed = options.seed ?? `s${Date.now()}`;
    this.now = options.now ?? (() => Date.now());
    this.log = options.log ?? new PlaytestLog({ now: this.now });
    if (this.log.size === 0) this.log.add({ t: 'sessionStart' });
  }

  /** Every 2-3 mechanic combination that assembles. The opener ballot. */
  static openers(): AssembledGame[] {
    const ids = CATALOGUE.map((meta) => meta.id);
    const combos: string[][] = [];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        combos.push([ids[i] as string, ids[j] as string]);
        for (let k = j + 1; k < ids.length; k += 1) {
          combos.push([ids[i] as string, ids[j] as string, ids[k] as string]);
        }
      }
    }
    return combos
      .map((combo) => assemble(combo, CATALOGUE))
      .filter((result) => result.ok)
      .map((result) => (result as { ok: true; game: AssembledGame }).game)
      .sort((a, b) => a.ids.length - b.ids.length || a.name.localeCompare(b.name));
  }

  start(seats: PlayerSeat[], ids: string[], maxTurns: number): void {
    this.seats = seats;
    this.ids = [...ids];
    this.maxTurns = maxTurns;
    this.roundNumber = 0;
    this.delta = null;
    this.lastMutation = null;
    this.lastRound = null;
    this.pendingMutation = null;
    this.gameCount += 1;
    this.gameId = `g${this.gameCount}`;

    const game = assembleOrThrow(this.ids, CATALOGUE);
    this.log.add({
      t: 'gameStart',
      gameId: this.gameId,
      gameNumber: this.gameCount,
      gameName: game.name,
      mechanics: [...this.ids],
      players: seats.length,
      playerNames: seats.map((seat) => seat.name),
      maxTurns,
      minRecommendedPlayers: game.minRecommendedPlayers,
    });
    this.openGame();
  }

  /**
   * Leaves the current game for the setup screen - a different opener, or a
   * different number of players. The playtest log keeps accumulating.
   */
  returnToSetup(): void {
    if (this.gameId) this.log.add({ t: 'gameEnd', gameId: this.gameId, reason: 'newGame' });
    this.screen = 'setup';
    this.round = null;
    this.game = null;
  }

  /** Assembles the current mechanics and opens a round, then teaches it. */
  private openGame(): void {
    this.roundNumber += 1;
    this.game = assembleOrThrow(this.ids, CATALOGUE);
    const seed = `${this.seed}-${this.gameId}r${this.roundNumber}`;
    const created = createGame({
      seed,
      ids: this.ids,
      players: this.seats,
      maxTurns: this.maxTurns,
    });
    this.round = created.round;
    // From zero, so the first turn's record includes the prizes and rolls that
    // begin() emits before anyone is asked for anything.
    this.logMark = 0;
    this.round.begin();
    this.roundId = `${this.gameId}r${this.roundNumber}`;
    this.log.add({
      t: 'roundStart',
      gameId: this.gameId,
      roundId: this.roundId,
      roundNumber: this.roundNumber,
      gameName: this.game.name,
      mechanics: [...this.ids],
      seed,
      mutation: this.pendingMutation,
    });
    this.pendingMutation = null;
    this.screen = 'teach';
  }

  get isFirstRound(): boolean {
    return this.roundNumber === 1;
  }

  beginPlay(): void {
    this.roundStartedAt = this.now();
    this.turnDurations = [];
    this.startTurn();
  }

  private startTurn(): void {
    this.seatIndex = 0;
    this.turnStartedAt = this.now();
    this.turnInputs.clear();
    this.choices.clear();
    this.screen = 'handoff';
  }

  get currentSeat(): PlayerSeat | null {
    return this.seats[this.seatIndex] ?? null;
  }

  /** The player has the screen to themselves. */
  takeSeat(): void {
    this.screen = 'commit';
  }

  applyPrepare(mechanic: string, value: InputValue): void {
    const seat = this.currentSeat;
    if (!seat || !this.round) return;
    this.round.applyPrepare(seat.id, mechanic, value);
    this.draftFor(seat.id).prepare[mechanic] = value;
  }

  private draftFor(player: PlayerId): { prepare: Record<string, InputValue>; commit: Record<string, InputValue> } {
    const existing = this.turnInputs.get(player);
    if (existing) return existing;
    const fresh = { prepare: {}, commit: {} };
    this.turnInputs.set(player, fresh);
    return fresh;
  }

  commit(input: TurnInput): void {
    const seat = this.currentSeat;
    if (!seat || !this.round) return;
    const draft = this.draftFor(seat.id);
    draft.commit = { ...input.values };
    this.choices.set(seat.id, input.prize);

    this.round.commit(seat.id, input);
    this.seatIndex += 1;
    if (this.seatIndex >= this.seats.length) {
      this.round.reveal();
      this.turnDurations.push(this.now() - this.turnStartedAt);
      this.recordTurn();
      this.screen = 'reveal';
    } else {
      this.screen = 'handoff';
    }
  }

  /** Everything that happened this turn, including what each player chose. */
  private recordTurn(): void {
    const round = this.round;
    if (!round) return;
    const prizes = new Map(round.prizes.map((prize) => [prize.id, prize]));
    const players: TurnPlayerRecord[] = this.seats.map((seat) => {
      const draft = this.turnInputs.get(seat.id);
      const prize = this.choices.get(seat.id) ?? null;
      return {
        player: seat.id,
        name: seat.name,
        prepare: { ...(draft?.prepare ?? {}) },
        commit: { ...(draft?.commit ?? {}) },
        prize,
        prizeLabel: prize === null ? null : prizes.get(prize)?.label ?? null,
        strength: round.numbers.total(seat.id),
        points: round.players.find((player) => player.id === seat.id)?.points ?? 0,
      };
    });

    this.log.add({
      t: 'turn',
      gameId: this.gameId,
      roundId: this.roundId,
      turn: round.turn,
      durationMs: this.turnDurations[this.turnDurations.length - 1] ?? 0,
      players,
      events: [...round.log.since(this.logMark)] as GameEvent[],
      standings: round.standings(),
    });
    this.logMark = round.log.length;
    this.turnInputs.clear();
    this.choices.clear();
  }

  /** After the reveal: another turn, or the result. */
  next(): void {
    if (!this.round) return;
    this.round.next();
    if (this.round.isOver) this.finishRound();
    else this.startTurn();
  }

  /** Ends the round early - a facilitator calling time. */
  stop(): void {
    if (!this.round || this.round.isOver) return;
    this.round.stop();
    this.finishRound();
  }

  private finishRound(): void {
    const round = this.round;
    const game = this.game;
    if (!round || !game) return;
    const standings = round.standings();
    const winners = standings.filter((standing) => standing.rank === 1).map((standing) => standing.player);
    const durationMs = this.now() - this.roundStartedAt;

    this.log.add({
      t: 'roundEnd',
      gameId: this.gameId,
      roundId: this.roundId,
      turnsPlayed: round.turn,
      durationMs,
      endedBecause: round.endedBecause,
      standings,
      winners,
    });

    this.lastRound = {
      gameId: this.gameId,
      roundId: this.roundId,
      gameName: game.name,
      turnsPlayed: round.turn,
      durationMs,
      endedBecause: round.endedBecause,
      standings,
      winners,
    };
    this.screen = 'results';
  }

  rate(rating: { fun?: 'up' | 'down'; clarity?: number }): void {
    const last = this.lastRound;
    if (!last) return;
    if (rating.fun !== undefined) last.fun = rating.fun;
    if (rating.clarity !== undefined) last.clarity = rating.clarity;
    this.log.add({
      t: 'rating',
      gameId: last.gameId,
      roundId: last.roundId,
      ...(rating.fun === undefined ? {} : { fun: rating.fun }),
      ...(rating.clarity === undefined ? {} : { clarity: rating.clarity }),
    });
  }

  /** Every change that would still assemble, with the delta it teaches. */
  mutations(): MutationOption[] {
    return legalMutations(this.ids, CATALOGUE, { includeKeep: true });
  }

  openMutations(): void {
    this.screen = 'mutate';
  }

  applyMutation(option: MutationOption): void {
    const before = this.game;
    const fromMechanics = [...this.ids];
    this.ids = [...option.ids];
    this.lastMutation = option.mutation;
    this.pendingMutation = option.mutation;

    this.log.add({
      t: 'mutation',
      gameId: this.gameId,
      mutation: option.mutation,
      label: option.label,
      fromMechanics,
      toMechanics: [...option.ids],
      added: option.delta.added.map((block) => block.mechanic),
      gone: option.delta.gone.map((block) => block.mechanic),
      changed: [...option.delta.changed],
    });

    this.openGame();
    const after = this.game;
    this.delta =
      before && after && option.mutation.op !== 'keep'
        ? teachDelta({ metas: before.metas }, { metas: after.metas, edges: after.edges })
        : null;
  }

  /** Name the player, not the seat id. */
  nameOf(player: PlayerId): string {
    return this.seats.find((seat) => seat.id === player)?.name ?? player;
  }

  /** Players only ever see a mechanic's name, never its id. */
  mechanicName(id: string): string {
    return this.game?.metas.find((meta) => meta.id === id)?.name ?? id;
  }
}
