import {
  isConnected,
  mechanicEdges,
  reachableFrom,
  RANKING,
  type Edge,
} from '../grammar/edges';
import { portTypes, ROLES, type MechanicMeta, type PortDecl, type Role } from '../grammar/ports';

export interface RuleFailure {
  /** The rule id from v3, e.g. "R2". */
  rule: string;
  /** Developer-facing and specific. */
  message: string;
  /** Catalogue mechanics that would fix it. This is what makes ADD options possible. */
  candidates?: string[];
}

/** Developer-facing, and specific: "R2: market.card has no consumer (candidates: threeOfAKind)". */
export function describeFailure(failure: RuleFailure): string {
  const candidates =
    failure.candidates && failure.candidates.length > 0
      ? ` (candidates: ${failure.candidates.join(', ')})`
      : '';
  return `${failure.rule}: ${failure.message}${candidates}`;
}

export const MIN_MECHANICS = 2;
export const MAX_MECHANICS = 6;

/**
 * The static composition rules the prototype enforces.
 *
 * v3 lists R1-R12. R9 (as cycle detection), R10 (payoff latency) and R11 (as a
 * build gate) are deferred, and R8 is reduced to its conflicts half - see
 * docs/DECISIONS.md D7. Each rule kept here rejects something a player could
 * actually build out of the seven prototype mechanics.
 */
export function validate(
  selected: readonly MechanicMeta[],
  catalogue: readonly MechanicMeta[],
  edges: readonly Edge[],
): RuleFailure[] {
  const failures: RuleFailure[] = [];
  const ids = selected.map((m) => m.id);
  const between = mechanicEdges(edges);

  // R12: size.
  if (selected.length < MIN_MECHANICS || selected.length > MAX_MECHANICS) {
    failures.push({
      rule: 'R12',
      message: `A game needs ${MIN_MECHANICS}-${MAX_MECHANICS} mechanics, got ${selected.length}`,
    });
  }

  // R1: every required consume has a provider among the others.
  for (const meta of selected) {
    for (const consume of meta.consumes) {
      if (!consume.required) continue;
      const provider = selected.find(
        (other) => other.id !== meta.id && other.provides.some((p) => matches(p, consume)),
      );
      if (!provider) {
        failures.push({
          rule: 'R1',
          message: `${meta.id} needs ${describe(consume)} and nothing provides it`,
          candidates: candidateProviders(catalogue, ids, consume),
        });
      }
    }
  }

  // R2: every non-optional provide has a consumer.
  for (const meta of selected) {
    for (const provide of meta.provides) {
      if (provide.optional) continue;
      const types = portTypes(provide);
      // `prize` is consumed by the players picking one; `points` reaches the ranking.
      if (types.includes('prize') || types.includes('points')) continue;
      if (types.includes('modifier')) {
        if (!between.some((edge) => edge.kind === 'modifies' && edge.from === meta.id)) {
          failures.push({
            rule: 'R2',
            message: `${meta.id} modifies nothing in this game`,
          });
        }
        continue;
      }
      const consumer = selected.find(
        (other) => other.id !== meta.id && other.consumes.some((c) => matches(provide, c)),
      );
      if (!consumer) {
        failures.push({
          rule: 'R2',
          message: `${meta.id}.${types.join('|')} has no consumer`,
          candidates: candidateConsumers(catalogue, ids, provide),
        });
      }
    }
  }

  // R3: every mechanic has a directed path to the ranking.
  for (const meta of selected) {
    if (!reachableFrom(edges, meta.id).has(RANKING)) {
      failures.push({ rule: 'R3', message: `${meta.id} never reaches the score` });
    }
  }

  // R4: the mechanics, with both terminals removed, form one connected graph.
  if (ids.length > 1 && !isConnected(ids, between)) {
    failures.push({
      rule: 'R4',
      message: `Parallel games: ${ids.join(', ')} do not all touch each other`,
    });
  }

  // R5: no mechanic sits on its own.
  for (const meta of selected) {
    const touches = between.some((edge) => edge.from === meta.id || edge.to === meta.id);
    if (ids.length > 1 && !touches) {
      failures.push({ rule: 'R5', message: `${meta.id} has no edge to another mechanic` });
    }
  }

  // R6: every structural role is covered.
  const roles = coveredRoles(selected);
  for (const role of ROLES) {
    if ((roles[role] ?? []).length === 0) {
      failures.push({
        rule: 'R6',
        message: `No mechanic covers the ${role} role`,
        candidates: catalogue.filter((m) => !ids.includes(m.id) && m.roles.includes(role)).map((m) => m.id),
      });
    }
  }

  // R7: there is something to decide.
  if (!hasDecision(selected)) {
    failures.push({
      rule: 'R7',
      message: 'No decision: one prize, no mechanic input, and passing costs nothing',
    });
  }

  // R8 (conflicts half): declared conflicts are respected.
  for (const meta of selected) {
    for (const conflict of meta.conflicts) {
      if (ids.includes(conflict)) {
        failures.push({ rule: 'R8', message: `${meta.id} conflicts with ${conflict}` });
      }
    }
  }

  return failures;
}

/**
 * A game has a decision when a player can change the outcome: choosing between
 * prizes, an input of their own, or passing when entering costs something.
 */
export function hasDecision(selected: readonly MechanicMeta[]): boolean {
  if (selected.some((m) => m.input !== null)) return true;
  if (selected.some((m) => m.multiplePrizes)) return true;
  return selected.some((m) => m.costlyEntry);
}

export function coveredRoles(selected: readonly MechanicMeta[]): Record<Role, string[]> {
  const roles: Record<Role, string[]> = { stakes: [], contest: [], score: [] };
  for (const meta of selected) {
    for (const role of meta.roles) roles[role].push(meta.id);
  }
  return roles;
}

function matches(provide: PortDecl, consume: PortDecl): boolean {
  const provided = portTypes(provide);
  const wanted = portTypes(consume);
  if (!wanted.some((type) => provided.includes(type))) return false;
  const need = consume.attrs;
  if (!need) return true;
  const have = provide.attrs ?? {};
  return Object.entries(need).every(([key, value]) => have[key as keyof typeof have] === value);
}

function describe(decl: PortDecl): string {
  const types = portTypes(decl).join('|');
  const attrs = decl.attrs ? Object.keys(decl.attrs).join(',') : '';
  const suffix = attrs ? `{${attrs}}` : '';
  return decl.use ? `${types}${suffix} (${decl.use})` : `${types}${suffix}`;
}

function candidateProviders(
  catalogue: readonly MechanicMeta[],
  selected: readonly string[],
  consume: PortDecl,
): string[] {
  return catalogue
    .filter((m) => !selected.includes(m.id) && m.provides.some((p) => matches(p, consume)))
    .map((m) => m.id);
}

function candidateConsumers(
  catalogue: readonly MechanicMeta[],
  selected: readonly string[],
  provide: PortDecl,
): string[] {
  return catalogue
    .filter((m) => !selected.includes(m.id) && m.consumes.some((c) => matches(provide, c)))
    .map((m) => m.id);
}
