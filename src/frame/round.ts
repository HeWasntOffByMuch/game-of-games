import { HOOK_ORDER, type HookPoint } from '../grammar/ports';
import { EventLog, type GameEvent } from './events';
import { type AnyMechanic, type MechanicContext, type PrizeSpec, type Verbs, type WinInfo } from './mechanic';
import { NumberPort } from './numbers';
import { rank, type Standing } from './ranking';
import { resolvePrize, type PrizeResolution } from './resolve';
import { createRng, type Rng } from './rng';
import type {
  Card,
  Claim,
  Comparison,
  InputField,
  InputSpec,
  InputValue,
  MechanicId,
  PlayerId,
  PlayerState,
  Prize,
  PrizeId,
  PrizeOption,
  TurnInput,
} from './types';

export interface PlayerSeed {
  id: PlayerId;
  name: string;
}

export interface RoundOptions {
  seed: string;
  /** Hook-ordered; the assembler produces this list. */
  mechanics: AnyMechanic[];
  players: PlayerSeed[];
  /** Shallow overrides per mechanic id, merged onto that mechanic's defaults. */
  params?: Record<MechanicId, Record<string, unknown>>;
  /** The frame's default ending (docs/DECISIONS.md D12). */
  maxTurns?: number;
}

export type RoundPhase = 'setup' | 'input' | 'revealed' | 'over';

export const DEFAULT_MAX_TURNS = 8;

interface MechanicSlot {
  mechanic: AnyMechanic;
  params: Record<string, unknown>;
  state: unknown;
  rng: Rng;
}

/**
 * One round of one game.
 *
 * Driven from outside rather than by a callback loop, so the browser UI can
 * step it one private commit at a time while tests and the CLI step it in a
 * tight loop. The engine itself is synchronous, headless and deterministic.
 */
export class Round {
  readonly log = new EventLog();
  readonly players: PlayerState[];
  readonly maxTurns: number;
  readonly numbers = new NumberPort();

  private readonly slots: MechanicSlot[];
  private readonly byId = new Map<MechanicId, MechanicSlot>();
  private readonly seed: string;

  private phaseValue: RoundPhase = 'setup';
  private turnValue = 0;
  private prizeList: Prize[] = [];
  private comparisonValue: Comparison = 'highest';
  private inputs = new Map<PlayerId, TurnInput>();
  private appliedPrepare = new Set<string>();
  private prizeCounter = 0;
  private current: MechanicSlot | null = null;
  private lastResolutions: PrizeResolution[] = [];
  private endReason: 'turnCap' | 'stopped' = 'turnCap';

  constructor(options: RoundOptions) {
    this.seed = options.seed;
    this.maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
    this.players = options.players.map((seed) => ({
      id: seed.id,
      name: seed.name,
      points: 0,
      cards: [],
    }));

    const root = createRng(options.seed);
    this.slots = options.mechanics.map((mechanic) => {
      const params = { ...(mechanic.defaultParams as Record<string, unknown>), ...(options.params?.[mechanic.meta.id] ?? {}) };
      const slot: MechanicSlot = {
        mechanic,
        params,
        state: mechanic.createState(params),
        rng: root.derive(mechanic.meta.id),
      };
      this.byId.set(mechanic.meta.id, slot);
      return slot;
    });
  }

  get phase(): RoundPhase {
    return this.phaseValue;
  }

  get turn(): number {
    return this.turnValue;
  }

  get prizes(): readonly Prize[] {
    return this.prizeList;
  }

  get comparison(): Comparison {
    return this.comparisonValue;
  }

  get mechanicIds(): MechanicId[] {
    return this.slots.map((slot) => slot.mechanic.meta.id);
  }

  get resolutions(): readonly PrizeResolution[] {
    return this.lastResolutions;
  }

  get isOver(): boolean {
    return this.phaseValue === 'over';
  }

  /** Runs setup hooks and opens the first turn for input. */
  begin(): void {
    if (this.phaseValue !== 'setup') throw new Error('Round already begun');
    this.emit({
      t: 'roundStart',
      mechanics: this.mechanicIds,
      players: this.players.map((p) => p.id),
      seed: this.seed,
    });
    for (const slot of this.slots) {
      this.withMechanic(slot, () => slot.mechanic.setup?.(this.contextFor(slot)));
    }
    this.beginTurn();
  }

  private beginTurn(): void {
    this.turnValue += 1;
    this.prizeList = [];
    this.prizeCounter = 0;
    this.numbers.clear();
    this.comparisonValue = 'highest';
    this.inputs.clear();
    this.appliedPrepare.clear();
    this.lastResolutions = [];
    this.emit({ t: 'turnStart', turn: this.turnValue });
    this.dispatch('turnStart');
    this.phaseValue = 'input';
  }

  /** Everything this player needs to decide, and nothing they should not see. */
  specFor(player: PlayerId): InputSpec {
    const contributions = this.numbers.forPlayer(player);
    const strength = this.numbers.total(player);
    const prizes: PrizeOption[] = this.prizeList.map((prize) => {
      if (prize.minStrength === undefined) return { prize, reachable: true };
      const reachable = strength >= prize.minStrength;
      return reachable
        ? { prize, reachable }
        : { prize, reachable, note: `Needs ${prize.minStrength}` };
    });

    const prepare: InputField[] = [];
    const commit: InputField[] = [];
    for (const slot of this.slots) {
      if (!slot.mechanic.inputFields) continue;
      const fields = this.withMechanic(slot, () =>
        slot.mechanic.inputFields?.(this.contextFor(slot), player) ?? [],
      );
      for (const field of fields) {
        if (field.phase === 'prepare') prepare.push(field);
        else commit.push(field);
      }
    }

    return {
      player,
      turn: this.turnValue,
      strength,
      strengthParts: contributions.map((c) => ({ source: c.source, value: c.value, parts: c.parts })),
      prizes,
      prepare,
      commit,
    };
  }

  /**
   * Applies a `prepare` choice straight away. Reroll has to resolve here: you
   * must see the new roll before you pick a card, or the decision is blind.
   */
  applyPrepare(player: PlayerId, mechanicId: MechanicId, value: InputValue): void {
    this.requirePhase('input');
    const key = `${player}:${mechanicId}`;
    if (this.appliedPrepare.has(key)) throw new Error(`${mechanicId} already prepared for ${player}`);
    const slot = this.slotFor(mechanicId);
    const field = this.specFor(player).prepare.find((f) => f.mechanic === mechanicId);
    if (!field) throw new Error(`${mechanicId} has no prepare field for ${player}`);
    this.appliedPrepare.add(key);
    this.withMechanic(slot, () =>
      slot.mechanic.applyInput?.(this.contextFor(slot), player, field, value),
    );
  }

  commit(player: PlayerId, input: TurnInput): void {
    this.requirePhase('input');
    if (this.inputs.has(player)) throw new Error(`${player} already committed`);
    if (input.prize !== null && !this.prizeList.some((p) => p.id === input.prize)) {
      throw new Error(`No such prize: ${input.prize}`);
    }
    this.inputs.set(player, input);

    const spec = this.specFor(player);
    for (const field of spec.commit) {
      const slot = this.slotFor(field.mechanic);
      const value = input.values[field.mechanic];
      if (value === undefined) continue;
      this.withMechanic(slot, () =>
        slot.mechanic.applyInput?.(this.contextFor(slot), player, field, value),
      );
    }
  }

  pendingPlayers(): PlayerId[] {
    return this.players.filter((p) => !this.inputs.has(p.id)).map((p) => p.id);
  }

  /** Resolves the turn: claims, drops, tie cancellation, wins, scoring. */
  reveal(): void {
    this.requirePhase('input');
    if (this.pendingPlayers().length > 0) {
      throw new Error(`Still waiting on: ${this.pendingPlayers().join(', ')}`);
    }

    this.dispatch('beforeResolve');

    const claims: Claim[] = [];
    for (const player of this.players) {
      const input = this.inputs.get(player.id);
      if (!input || input.prize === null) {
        this.emit({ t: 'pass', turn: this.turnValue, player: player.id });
        continue;
      }
      const strength = this.numbers.total(player.id);
      claims.push({ player: player.id, prize: input.prize, strength });
      this.emit({ t: 'claim', turn: this.turnValue, player: player.id, prize: input.prize, strength });
    }

    this.lastResolutions = [];
    for (const prize of this.prizeList) {
      const resolution = resolvePrize(prize, claims, this.comparisonValue);
      this.lastResolutions.push(resolution);
      this.recordResolution(resolution);
      if (resolution.winner) {
        const win: WinInfo = {
          player: resolution.winner.player,
          prize,
          strength: resolution.winner.strength,
        };
        for (const slot of this.slots) {
          this.withMechanic(slot, () => slot.mechanic.hooks.onWin?.(this.contextFor(slot), win));
        }
      }
    }

    this.dispatch('afterResolve');
    this.dispatch('turnEnd');
    this.emit({ t: 'turnEnd', turn: this.turnValue });
    this.phaseValue = 'revealed';
  }

  /** Opens the next turn, or ends the round when the turn cap is reached. */
  next(): void {
    this.requirePhase('revealed');
    if (this.turnValue >= this.maxTurns) {
      this.finish('turnCap');
      return;
    }
    this.beginTurn();
  }

  /** Ends the round early, e.g. a facilitator calling time during a playtest. */
  stop(): void {
    if (this.phaseValue === 'over') return;
    this.finish('stopped');
  }

  private finish(reason: 'turnCap' | 'stopped'): void {
    this.endReason = reason;
    this.phaseValue = 'over';
    this.emit({
      t: 'roundEnd',
      turn: this.turnValue,
      reason,
      standings: this.standings(),
    });
  }

  get endedBecause(): 'turnCap' | 'stopped' {
    return this.endReason;
  }

  standings(): Standing[] {
    return rank(this.players);
  }

  private recordResolution(resolution: PrizeResolution): void {
    const turn = this.turnValue;
    for (const drop of resolution.dropped) {
      this.emit({
        t: 'claimDropped',
        turn,
        player: drop.claim.player,
        prize: resolution.prize.id,
        strength: drop.claim.strength,
        reason: drop.reason,
      });
    }
    for (const group of resolution.cancelled) {
      this.emit({
        t: 'tieCancelled',
        turn,
        prize: resolution.prize.id,
        strength: group.strength,
        players: group.players,
      });
    }
    if (resolution.winner) {
      this.emit({
        t: 'win',
        turn,
        player: resolution.winner.player,
        prize: resolution.prize.id,
        strength: resolution.winner.strength,
      });
    } else if (resolution.noWinnerReason) {
      this.emit({ t: 'noWinner', turn, prize: resolution.prize.id, reason: resolution.noWinnerReason });
    }
    for (const loser of resolution.losers) {
      this.emit({ t: 'lose', turn, player: loser, prize: resolution.prize.id });
    }
  }

  private dispatch(hook: HookPoint): void {
    if (!HOOK_ORDER.includes(hook)) throw new Error(`Unknown hook: ${hook}`);
    for (const slot of this.slots) {
      const handler = slot.mechanic.hooks[hook];
      if (hook === 'onWin' || !handler) continue;
      this.withMechanic(slot, () => (handler as (ctx: MechanicContext<unknown, unknown>) => void)(this.contextFor(slot)));
    }
  }

  private slotFor(id: MechanicId): MechanicSlot {
    const slot = this.byId.get(id);
    if (!slot) throw new Error(`Mechanic not in this game: ${id}`);
    return slot;
  }

  private withMechanic<T>(slot: MechanicSlot, run: () => T): T {
    const previous = this.current;
    this.current = slot;
    try {
      return run();
    } finally {
      this.current = previous;
    }
  }

  private sourceId(): MechanicId {
    if (!this.current) throw new Error('Verb called outside a mechanic');
    return this.current.mechanic.meta.id;
  }

  private contextFor(slot: MechanicSlot): MechanicContext<unknown, unknown> {
    return {
      id: slot.mechanic.meta.id,
      turn: this.turnValue,
      rng: slot.rng,
      players: this.players,
      prizes: this.prizeList,
      numbers: this.numbers,
      params: slot.params,
      state: slot.state,
      verbs: this.verbs,
      player: (id) => this.playerState(id),
      choiceOf: (id) => this.inputs.get(id)?.prize ?? null,
      note: (text) => this.emit({ t: 'note', turn: this.turnValue, source: slot.mechanic.meta.id, text }),
    };
  }

  private playerState(id: PlayerId): PlayerState {
    const player = this.players.find((p) => p.id === id);
    if (!player) throw new Error(`No such player: ${id}`);
    return player;
  }

  private readonly verbs: Verbs = {
    offerPrize: (spec: PrizeSpec): Prize => {
      const source = this.sourceId();
      const prize: Prize = {
        id: `t${this.turnValue}p${this.prizeCounter++}`,
        source,
        label: spec.label,
        value: spec.value,
        payload: spec.payload,
        ...(spec.minStrength === undefined ? {} : { minStrength: spec.minStrength }),
      };
      this.prizeList.push(prize);
      this.emit({ t: 'prizeOffered', turn: this.turnValue, source, prize });
      return prize;
    },

    gain: (player, amount, note) => {
      if (amount === 0) return;
      const source = this.sourceId();
      const state = this.playerState(player);
      state.points += amount;
      this.emit({
        t: 'points',
        turn: this.turnValue,
        source,
        player,
        delta: amount,
        total: state.points,
        ...(note === undefined ? {} : { note }),
      });
    },

    spend: (player, amount, note) => {
      if (amount === 0) return;
      const source = this.sourceId();
      const state = this.playerState(player);
      const paid = Math.min(amount, state.points);
      state.points -= paid;
      this.emit({
        t: 'points',
        turn: this.turnValue,
        source,
        player,
        delta: -paid,
        total: state.points,
        ...(note === undefined ? {} : { note }),
      });
    },

    addHolding: (player, card: Card) => {
      const source = this.sourceId();
      this.playerState(player).cards.push(card);
      this.emit({ t: 'cardGained', turn: this.turnValue, source, player, card });
    },

    removeHolding: (player, cardIds) => {
      const source = this.sourceId();
      const state = this.playerState(player);
      const removed: Card[] = [];
      for (const id of cardIds) {
        const index = state.cards.findIndex((card) => card.id === id);
        if (index >= 0) removed.push(...state.cards.splice(index, 1));
      }
      if (removed.length > 0) {
        this.emit({ t: 'cardsSpent', turn: this.turnValue, source, player, cards: removed });
      }
      return removed;
    },

    setComparison: (direction) => {
      const source = this.sourceId();
      this.comparisonValue = direction;
      this.emit({ t: 'comparisonSet', turn: this.turnValue, source, direction });
    },
  };

  private emit(event: GameEvent): void {
    this.log.add(event);
  }

  private requirePhase(phase: RoundPhase): void {
    if (this.phaseValue !== phase) {
      throw new Error(`Expected phase ${phase}, but the round is ${this.phaseValue}`);
    }
  }
}

export type { PrizeId, TurnInput };
