import { deriveEdges, type Edge } from '../grammar/edges';
import type { MechanicMeta, Role } from '../grammar/ports';
import { coveredRoles, validate, type RuleFailure } from './rules';
import { measure, teachBlocks, type TeachBlock, type TeachBudget } from './teach';

export interface AssembledGame {
  /** Mechanic ids in the order they entered the game. Teach order follows this. */
  ids: string[];
  metas: MechanicMeta[];
  edges: Edge[];
  /** Hook dispatch order: by declared priority, then by entry order. */
  order: string[];
  roles: Record<Role, string[]>;
  teach: TeachBlock[];
  budget: TeachBudget;
  name: string;
}

export type AssembleResult =
  | { ok: true; game: AssembledGame }
  | { ok: false; failures: RuleFailure[] };

/**
 * Turns a list of mechanic ids into a validated game: derived edges, hook
 * order and teach text. Nothing here knows about any particular game - the
 * three worked examples come out of the same function as everything else.
 */
export function assemble(
  ids: readonly string[],
  catalogue: readonly MechanicMeta[],
): AssembleResult {
  const byId = new Map(catalogue.map((meta) => [meta.id, meta]));
  const failures: RuleFailure[] = [];
  const metas: MechanicMeta[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      failures.push({ rule: 'R12', message: `${id} selected twice` });
      continue;
    }
    seen.add(id);
    const meta = byId.get(id);
    if (!meta) {
      failures.push({ rule: 'R0', message: `Unknown mechanic: ${id}` });
      continue;
    }
    metas.push(meta);
  }
  if (failures.length > 0) return { ok: false, failures };

  const edges = deriveEdges(metas);
  const ruleFailures = validate(metas, catalogue, edges);
  if (ruleFailures.length > 0) return { ok: false, failures: ruleFailures };

  const teach = teachBlocks(metas, edges);
  return {
    ok: true,
    game: {
      ids: metas.map((m) => m.id),
      metas,
      edges,
      order: hookOrder(metas),
      roles: coveredRoles(metas),
      teach,
      budget: measure(teach),
      name: metas.map((m) => m.name).join(' + '),
    },
  };
}

/** Stable: declared priority first, entry order as the tie-break. */
export function hookOrder(metas: readonly MechanicMeta[]): string[] {
  return metas
    .map((meta, index) => ({ meta, index }))
    .sort((a, b) => a.meta.priority - b.meta.priority || a.index - b.index)
    .map((entry) => entry.meta.id);
}

/** Convenience for tests and callers that expect a game or a thrown error. */
export function assembleOrThrow(
  ids: readonly string[],
  catalogue: readonly MechanicMeta[],
): AssembledGame {
  const result = assemble(ids, catalogue);
  if (!result.ok) {
    const reasons = result.failures.map((f) => `${f.rule}: ${f.message}`).join('; ');
    throw new Error(`Invalid game [${ids.join(', ')}] - ${reasons}`);
  }
  return result.game;
}
