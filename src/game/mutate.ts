import { assemble, type AssembledGame } from '../assembler/assemble';
import { teachDelta, type TeachDelta } from '../assembler/teach';
import type { MechanicMeta } from '../grammar/ports';

/**
 * One change to a game between rounds. v3 also has `remove`; the prototype
 * offers add, replace and keep, which is enough to test whether mutating is
 * itself entertaining (docs/DECISIONS.md D13).
 */
export type Mutation =
  | { op: 'add'; mechanic: string }
  | { op: 'replace'; from: string; to: string }
  | { op: 'keep' };

/** A replacement takes the old mechanic's place, so the rules strip keeps its reading order. */
export function applyMutation(ids: readonly string[], mutation: Mutation): string[] {
  switch (mutation.op) {
    case 'keep':
      return [...ids];
    case 'add':
      return [...ids, mutation.mechanic];
    case 'replace':
      return ids.map((id) => (id === mutation.from ? mutation.to : id));
    default: {
      const exhaustive: never = mutation;
      return exhaustive;
    }
  }
}

export interface MutationOption {
  mutation: Mutation;
  ids: string[];
  game: AssembledGame;
  delta: TeachDelta;
  /** One line for the option card, e.g. "Add Reroll". */
  label: string;
}

export function describeMutation(mutation: Mutation, catalogue: readonly MechanicMeta[]): string {
  const name = (id: string): string => catalogue.find((m) => m.id === id)?.name ?? id;
  switch (mutation.op) {
    case 'keep':
      return 'Same game, one more round';
    case 'add':
      return `Add ${name(mutation.mechanic)}`;
    case 'replace':
      return `${name(mutation.from)} out, ${name(mutation.to)} in`;
    default: {
      const exhaustive: never = mutation;
      return exhaustive;
    }
  }
}

/**
 * Every mutation that produces a valid game, with the rule delta it would
 * teach. The assembler decides what is offerable, so the mutate screen never
 * has to know anything about particular games.
 */
export function legalMutations(
  ids: readonly string[],
  catalogue: readonly MechanicMeta[],
  options: { includeKeep?: boolean } = {},
): MutationOption[] {
  const current = assemble(ids, catalogue);
  const selected = new Set(ids);
  const candidates: Mutation[] = [];

  for (const meta of catalogue) {
    if (selected.has(meta.id)) continue;
    candidates.push({ op: 'add', mechanic: meta.id });
    for (const from of ids) candidates.push({ op: 'replace', from, to: meta.id });
  }

  const found: MutationOption[] = [];
  for (const mutation of candidates) {
    const nextIds = applyMutation(ids, mutation);
    const result = assemble(nextIds, catalogue);
    if (!result.ok) continue;
    found.push({
      mutation,
      ids: nextIds,
      game: result.game,
      delta: teachDelta(
        { metas: current.ok ? current.game.metas : [] },
        { metas: result.game.metas, edges: result.game.edges },
      ),
      label: describeMutation(mutation, catalogue),
    });
  }

  if (options.includeKeep && current.ok) {
    found.push({
      mutation: { op: 'keep' },
      ids: [...ids],
      game: current.game,
      delta: { gone: [], added: [], changed: [] },
      label: describeMutation({ op: 'keep' }, catalogue),
    });
  }

  return found;
}
