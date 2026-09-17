import { portMatches, portTypes, type MechanicMeta, type PortType, type PortUse } from './ports';

/** The two graph terminals. Neither is a mechanic. */
export const PLAYERS = 'Players';
export const RANKING = 'Ranking';

export type NodeId = string;

/**
 * v3 also defines `competes` (two mechanics using the same resource, one
 * spending it). None of the prototype's three games produces one, so it is
 * deferred - see docs/DECISIONS.md D5. Adding it means extending this union
 * and the derivation below.
 */
export type EdgeKind = 'feeds' | 'modifies';

export interface Edge {
  kind: EdgeKind;
  from: NodeId;
  to: NodeId;
  port: PortType;
  /** How the consumer uses it. Several uses collapse into one edge. */
  uses: PortUse[];
  /** For the graph and the rules panel, e.g. "number: strength + price". */
  label: string;
}

function edgeKey(edge: Omit<Edge, 'label'>): string {
  return `${edge.kind}|${edge.from}|${edge.to}|${edge.port}`;
}

function label(port: PortType, uses: PortUse[]): string {
  return uses.length === 0 ? port : `${port}: ${uses.join(' + ')}`;
}

/**
 * Derives the dependency graph from declared ports alone. Mechanics never
 * name each other, so every connection here is a consequence of the grammar.
 */
export function deriveEdges(metas: readonly MechanicMeta[]): Edge[] {
  const collected = new Map<string, { edge: Omit<Edge, 'label'>; uses: Set<PortUse> }>();

  const record = (edge: Omit<Edge, 'label' | 'uses'>, use?: PortUse): void => {
    const key = edgeKey({ ...edge, uses: [] });
    const existing = collected.get(key);
    if (existing) {
      if (use) existing.uses.add(use);
      return;
    }
    collected.set(key, {
      edge: { ...edge, uses: [] },
      uses: new Set(use ? [use] : []),
    });
  };

  // feeds: a provider's port satisfies a consumer's port.
  for (const provider of metas) {
    for (const consumer of metas) {
      if (provider.id === consumer.id) continue;
      for (const provide of provider.provides) {
        if (portTypes(provide).includes('modifier')) continue;
        for (const consume of consumer.consumes) {
          if (!portMatches(provide, consume)) continue;
          const port = portTypes(consume).find((type) => portTypes(provide).includes(type));
          if (!port) continue;
          record({ kind: 'feeds', from: provider.id, to: consumer.id, port }, consume.use);
        }
      }
    }
  }

  // modifies: a modifier reaches the mechanic whose port or resolution it changes.
  for (const modifier of metas) {
    for (const provide of modifier.provides) {
      if (!portTypes(provide).includes('modifier')) continue;
      const target = provide.attrs?.target;
      if (target === 'number') {
        // Reroll -> Dice: whichever number provider matches what it consumes.
        for (const other of metas) {
          if (other.id === modifier.id) continue;
          const matches = other.provides.some((otherProvide) =>
            modifier.consumes.some(
              (consume) =>
                portTypes(consume).includes('number') && portMatches(otherProvide, consume),
            ),
          );
          if (matches) record({ kind: 'modifies', from: modifier.id, to: other.id, port: 'number' });
        }
      } else if (target === 'comparison') {
        // Lowest Wins -> every prize mechanic, because it changes how prizes resolve.
        for (const other of metas) {
          if (other.id === modifier.id) continue;
          if (other.provides.some((p) => portTypes(p).includes('prize'))) {
            record({ kind: 'modifies', from: modifier.id, to: other.id, port: 'prize' });
          }
        }
      }
    }
  }

  const edges: Edge[] = [];
  for (const { edge, uses } of collected.values()) {
    const useList = [...uses];
    edges.push({ ...edge, uses: useList, label: label(edge.port, useList) });
  }

  // Terminals: players decide, and points reach the ranking.
  for (const meta of metas) {
    if (meta.input) {
      edges.push({ kind: 'feeds', from: PLAYERS, to: meta.id, port: 'number', uses: [], label: meta.input.kind });
    }
    if (meta.provides.some((p) => portTypes(p).includes('prize'))) {
      edges.push({ kind: 'feeds', from: PLAYERS, to: meta.id, port: 'prize', uses: [], label: 'pick prize' });
    }
    if (meta.provides.some((p) => portTypes(p).includes('points'))) {
      edges.push({ kind: 'feeds', from: meta.id, to: RANKING, port: 'points', uses: [], label: 'points' });
    }
  }

  return sortEdges(edges);
}

function sortEdges(edges: Edge[]): Edge[] {
  return [...edges].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.port.localeCompare(b.port),
  );
}

/** Edges between selected mechanics only - terminals removed (R4, R5). */
export function mechanicEdges(edges: readonly Edge[]): Edge[] {
  return edges.filter((edge) => edge.from !== PLAYERS && edge.to !== RANKING);
}

export function hasEdge(
  edges: readonly Edge[],
  from: NodeId,
  to: NodeId,
  port?: PortType,
): boolean {
  return edges.some(
    (edge) => edge.from === from && edge.to === to && (port === undefined || edge.port === port),
  );
}

/** Mechanic ids reachable from `start` by following directed edges. */
export function reachableFrom(edges: readonly Edge[], start: NodeId): Set<NodeId> {
  const out = new Map<NodeId, NodeId[]>();
  for (const edge of edges) {
    const list = out.get(edge.from);
    if (list) list.push(edge.to);
    else out.set(edge.from, [edge.to]);
  }
  const seen = new Set<NodeId>();
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.pop();
    if (node === undefined || seen.has(node)) continue;
    seen.add(node);
    for (const next of out.get(node) ?? []) queue.push(next);
  }
  seen.delete(start);
  return seen;
}

/** Whether the given nodes form one connected component, ignoring direction. */
export function isConnected(nodes: readonly NodeId[], edges: readonly Edge[]): boolean {
  if (nodes.length <= 1) return true;
  const neighbours = new Map<NodeId, Set<NodeId>>();
  for (const node of nodes) neighbours.set(node, new Set());
  for (const edge of edges) {
    const a = neighbours.get(edge.from);
    const b = neighbours.get(edge.to);
    if (!a || !b) continue;
    a.add(edge.to);
    b.add(edge.from);
  }
  const start = nodes[0];
  if (start === undefined) return true;
  const seen = new Set<NodeId>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.pop();
    if (node === undefined) continue;
    for (const next of neighbours.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size === nodes.length;
}
