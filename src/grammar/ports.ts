/**
 * The capability grammar: what mechanics declare about themselves so the
 * assembler can work out how they connect.
 *
 * This is deliberately the subset the prototype's seven mechanics need.
 * v3 describes more port types (`speed`, `square`, `end`, and the reserved
 * `info`/`coins`); they are absent here because nothing would provide or
 * consume them. See docs/DECISIONS.md D4.
 */

export type PortType =
  | 'number'
  | 'points'
  | 'card'
  | 'prize'
  | 'win'
  | 'lose'
  | 'tie'
  | 'modifier';

/** What a `modifier` port changes. */
export type ModifierTarget = 'number' | 'comparison';

/**
 * Attribute requirements make consumers precise: Three of a Kind wants
 * `card` with a `symbol`, Reroll wants a `number` that is `random`.
 */
export interface PortAttrs {
  /** The value is drawn by the engine rather than chosen by the player. */
  random?: boolean;
  /** The player chooses the value. */
  chosen?: boolean;
  /** Other players must not see it before the reveal. */
  hidden?: boolean;
  /** The card or square carries a matchable symbol. */
  symbol?: boolean;
  /** For `modifier` ports only. */
  target?: ModifierTarget;
}

/** How a consumer uses the port it reads. */
export type PortUse = 'strength' | 'price' | 'spend' | 'read';

export interface PortDecl {
  /** An array means "any of these". */
  type: PortType | PortType[];
  attrs?: PortAttrs;
  /** Consumes only: the game is invalid without a provider (R1). */
  required?: boolean;
  /** Provides only: may go unconsumed, e.g. event streams (R2). */
  optional?: boolean;
  use?: PortUse;
}

/**
 * Hook points the prototype actually dispatches. v3 lists ten; the other five
 * have no subscriber among these mechanics (docs/DECISIONS.md D6).
 */
export type HookPoint = 'turnStart' | 'beforeResolve' | 'onWin' | 'afterResolve' | 'turnEnd';

export const HOOK_ORDER: readonly HookPoint[] = [
  'turnStart',
  'beforeResolve',
  'onWin',
  'afterResolve',
  'turnEnd',
];

/**
 * Structural roles. Internal validation only - never shown to players and
 * never a ballot category. `end` is omitted because the prototype has no
 * ending mechanic; the frame's turn cap always applies.
 */
export type Role = 'stakes' | 'contest' | 'score';

export const ROLES: readonly Role[] = ['stakes', 'contest', 'score'];

export type InputKind = 'toggle' | 'pickAmount';

export interface PlayerInputDecl {
  kind: InputKind;
  /** `prepare` resolves immediately so the player sees the result before committing. */
  phase: 'prepare' | 'commit';
  hidden: boolean;
}

export interface MechanicMeta {
  id: string;
  /** Player-facing. Never changes between combinations - mastery lives here. */
  name: string;
  /** One sentence, <= 12 words. */
  teach: string;
  /** One line of strategy, <= 12 words. */
  tip: string;
  roles: Role[];
  provides: PortDecl[];
  consumes: PortDecl[];
  hooks: HookPoint[];
  input: PlayerInputDecl | null;
  /** Entering a contest costs something, so passing is a real decision (R7). */
  costlyEntry?: boolean;
  /**
   * Prize mechanics only: whether this offers more than one prize a turn, so
   * that picking between them is itself a decision (R7).
   */
  multiplePrizes?: boolean;
  /**
   * A line for the delta screen when this mechanic is removed and a frame rule
   * quietly goes back to normal, e.g. "Highest number wins again."
   */
  onRemoveLine?: string;
  /**
   * Number providers only: what players call the value, e.g. "dice" or "bid".
   * Used when two providers combine and the teach text has to say so.
   */
  numberNoun?: string;
  conflicts: string[];
  /** Order within a hook point; lower runs first. */
  priority: number;
}

/** Normalises `type: 'number' | ['number','points']` to an array. */
export function portTypes(decl: PortDecl): PortType[] {
  return Array.isArray(decl.type) ? decl.type : [decl.type];
}

/**
 * A provider satisfies a consumer when their port types overlap and the
 * provider carries every attribute the consumer asked for.
 */
export function portMatches(provide: PortDecl, consume: PortDecl): boolean {
  const provided = portTypes(provide);
  const wanted = portTypes(consume);
  if (!wanted.some((type) => provided.includes(type))) return false;

  const need = consume.attrs;
  if (!need) return true;
  const have = provide.attrs ?? {};
  return (Object.keys(need) as Array<keyof PortAttrs>).every((key) => have[key] === need[key]);
}
