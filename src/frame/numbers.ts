import type { MechanicId, PlayerId } from './types';

/**
 * A fresh draw from a random number provider.
 *
 * `parts` are the components the value was built from - Dice returns its two
 * faces. Reroll reads `parts` to decide whether a redraw busted ("all parts
 * matched"), which lets it stay a general rule about random numbers instead of
 * a rule about dice. No mechanic ever imports another.
 */
export interface NumberDraw {
  value: number;
  parts: number[];
}

export interface NumberContribution {
  id: string;
  player: PlayerId;
  source: MechanicId;
  value: number;
  parts: number[];
  random: boolean;
  hidden: boolean;
  /** Present when the provider can draw again, e.g. Dice. Reroll needs this. */
  redraw?: () => NumberDraw;
  /** Mechanics that have changed this contribution, in order. */
  modifiedBy: MechanicId[];
}

export interface PublishNumberOptions {
  player: PlayerId;
  source: MechanicId;
  value: number;
  parts?: number[];
  random?: boolean;
  hidden?: boolean;
  redraw?: () => NumberDraw;
}

/**
 * The `number` port at runtime.
 *
 * Combine rule from the grammar: several providers sum per player, and then
 * modifiers apply. An override (a Reroll bust) replaces the total outright.
 */
export interface NumberListener {
  published(contribution: NumberContribution): void;
  replaced(contribution: NumberContribution, from: number, by: MechanicId): void;
  overridden(player: PlayerId, from: number, to: number, by: MechanicId, note?: string): void;
}

export class NumberPort {
  private contributions: NumberContribution[] = [];
  private overrides = new Map<PlayerId, { value: number; source: MechanicId }>();
  private nextId = 0;
  /** The frame listens so every change reaches the event log. */
  listener: NumberListener | null = null;

  clear(): void {
    this.contributions = [];
    this.overrides.clear();
    this.nextId = 0;
  }

  publish(options: PublishNumberOptions): NumberContribution {
    const contribution: NumberContribution = {
      id: `n${this.nextId++}`,
      player: options.player,
      source: options.source,
      value: options.value,
      parts: options.parts ?? [],
      random: options.random ?? false,
      hidden: options.hidden ?? false,
      modifiedBy: [],
      ...(options.redraw ? { redraw: options.redraw } : {}),
    };
    this.contributions.push(contribution);
    this.listener?.published(contribution);
    return contribution;
  }

  forPlayer(player: PlayerId): NumberContribution[] {
    return this.contributions.filter((c) => c.player === player);
  }

  /** Contributions a modifier is allowed to touch, filtered by attribute. */
  matching(player: PlayerId, attrs: { random?: boolean }): NumberContribution[] {
    return this.forPlayer(player).filter(
      (c) => attrs.random === undefined || c.random === attrs.random,
    );
  }

  /** Replaces one contribution's value, recording which mechanic did it. */
  replace(contribution: NumberContribution, draw: NumberDraw, by: MechanicId): void {
    const from = contribution.value;
    contribution.value = draw.value;
    contribution.parts = draw.parts;
    contribution.modifiedBy.push(by);
    this.listener?.replaced(contribution, from, by);
  }

  /** Overrides a player's whole number, e.g. a bust setting it to 0. */
  override(player: PlayerId, value: number, by: MechanicId, note?: string): void {
    const from = this.total(player);
    this.overrides.set(player, { value, source: by });
    this.listener?.overridden(player, from, value, by, note);
  }

  total(player: PlayerId): number {
    const override = this.overrides.get(player);
    if (override) return override.value;
    return this.forPlayer(player).reduce((sum, c) => sum + c.value, 0);
  }

  /** Whether any mechanic provided a number for this player this turn. */
  has(player: PlayerId): boolean {
    return this.overrides.has(player) || this.contributions.some((c) => c.player === player);
  }
}
