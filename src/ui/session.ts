import { assemble, assembleOrThrow, type AssembledGame } from '../assembler/assemble';
import { teachDelta, type TeachDelta } from '../assembler/teach';
import type { Round } from '../frame/round';
import type { InputValue, PlayerId, TurnInput } from '../frame/types';
import { createGame } from '../game/createGame';
import { legalMutations, type Mutation, type MutationOption } from '../game/mutate';
import { CATALOGUE } from '../mechanics/catalogue';
import { newSession, type RoundRecord, type SessionRecord } from '../playtest/log';

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
  record: SessionRecord = newSession([]);

  private readonly seed: string;
  private readonly now: () => number;
  private seatIndex = 0;
  private roundStartedAt = 0;
  private turnStartedAt = 0;
  private turnDurations: number[] = [];

  constructor(options: SessionOptions = {}) {
    this.seed = options.seed ?? `s${Date.now()}`;
    this.now = options.now ?? (() => Date.now());
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
    this.record = newSession(seats.map((seat) => seat.name));
    this.delta = null;
    this.lastMutation = null;
    this.openGame();
  }

  /** Assembles the current mechanics and opens a round, then teaches it. */
  private openGame(): void {
    this.roundNumber += 1;
    this.game = assembleOrThrow(this.ids, CATALOGUE);
    const created = createGame({
      seed: `${this.seed}-r${this.roundNumber}`,
      ids: this.ids,
      players: this.seats,
      maxTurns: this.maxTurns,
    });
    this.round = created.round;
    this.round.begin();
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
  }

  commit(input: TurnInput): void {
    const seat = this.currentSeat;
    if (!seat || !this.round) return;
    this.round.commit(seat.id, input);
    this.seatIndex += 1;
    if (this.seatIndex >= this.seats.length) {
      this.round.reveal();
      this.turnDurations.push(this.now() - this.turnStartedAt);
      this.screen = 'reveal';
    } else {
      this.screen = 'handoff';
    }
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
    this.record.rounds.push({
      round: this.roundNumber,
      seed: `${this.seed}-r${this.roundNumber}`,
      mechanics: [...this.ids],
      gameName: game.name,
      players: this.seats.length,
      mutation: this.lastMutation,
      turnsPlayed: round.turn,
      endedBecause: round.endedBecause,
      durationMs: this.now() - this.roundStartedAt,
      turnDurationsMs: [...this.turnDurations],
      standings,
      winners: standings.filter((s) => s.rank === 1).map((s) => s.player),
    });
    this.screen = 'results';
  }

  rate(rating: { fun?: 'up' | 'down'; clarity?: number }): void {
    const last = this.record.rounds.at(-1);
    if (!last) return;
    if (rating.fun !== undefined) last.fun = rating.fun;
    if (rating.clarity !== undefined) last.clarity = rating.clarity;
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
    this.ids = [...option.ids];
    this.lastMutation = option.mutation;
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
