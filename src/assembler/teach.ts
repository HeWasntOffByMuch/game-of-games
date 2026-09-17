import { mechanicEdges, type Edge } from '../grammar/edges';
import { portTypes, type MechanicMeta } from '../grammar/ports';

/**
 * The Frame's rules, taught once per session. Every generated game inherits
 * them, so no combination has to explain comparison or scoring again.
 *
 * Line 4 says "turns" rather than v3's "time" because the prototype ends on a
 * turn cap (docs/DECISIONS.md D12).
 */
export const FRAME_LINES: readonly string[] = [
  'Everyone takes their turn at the same time.',
  'Pick a prize. Highest number wins it.',
  'Tied numbers cancel out. The best one left wins.',
  'Most points when the turns run out wins.',
];

export interface TeachBlock {
  mechanic: string;
  /** The card heading, e.g. "THREE OF A KIND". */
  heading: string;
  teach: string;
  /** At most one, and only when it says something the teach line does not. */
  connection?: string;
}

export interface TeachDelta {
  gone: Array<{ mechanic: string; heading: string }>;
  added: TeachBlock[];
  /** A frame rule that quietly went back to normal. v3 allows at most one. */
  changed: string[];
}

interface TemplateContext {
  has(id: string): boolean;
  feeds(from: string, to: string): boolean;
  modifies(from: string, to: string): boolean;
  feedsAnyPrize(from: string): boolean;
}

interface ConnectionTemplate {
  owner: string;
  line: string;
  applies(ctx: TemplateContext): boolean;
}

/**
 * Connection lines are chosen from the derived graph, not written per game.
 * A mechanic gets at most one, and none at all when its own teach line
 * already names the thing it connects to - which is why Market carries no
 * line ("your number" is already in its teach) but Dice does.
 *
 * Order matters: the first template whose condition holds wins.
 */
const CONNECTION_TEMPLATES: readonly ConnectionTemplate[] = [
  {
    owner: 'dice',
    line: 'Your dice total is your number.',
    applies: (ctx) => ctx.feedsAnyPrize('dice'),
  },
  {
    owner: 'bidding',
    line: 'Your bid is your number.',
    applies: (ctx) => ctx.feedsAnyPrize('bidding'),
  },
  {
    owner: 'threeOfAKind',
    line: 'Cards come from the Market.',
    applies: (ctx) => ctx.feeds('market', 'threeOfAKind'),
  },
  {
    owner: 'reroll',
    line: "A bust means you can't buy this turn.",
    applies: (ctx) => ctx.modifies('reroll', 'dice') && ctx.feeds('dice', 'market'),
  },
  {
    owner: 'lowestWins',
    line: 'The lowest bid wins, and still pays.',
    applies: (ctx) => ctx.has('bidding'),
  },
  {
    owner: 'lowestWins',
    line: 'You still need to reach the price.',
    applies: (ctx) => ctx.modifies('lowestWins', 'market'),
  },
];

function templateContext(metas: readonly MechanicMeta[], edges: readonly Edge[]): TemplateContext {
  const ids = new Set(metas.map((m) => m.id));
  const between = mechanicEdges(edges);
  const prizeMechanics = metas
    .filter((m) => m.provides.some((p) => portTypes(p).includes('prize')))
    .map((m) => m.id);

  const feeds = (from: string, to: string): boolean =>
    between.some((e) => e.kind === 'feeds' && e.from === from && e.to === to);

  return {
    has: (id) => ids.has(id),
    feeds,
    modifies: (from, to) =>
      between.some((e) => e.kind === 'modifies' && e.from === from && e.to === to),
    feedsAnyPrize: (from) => prizeMechanics.some((prize) => feeds(from, prize)),
  };
}

export function connectionLineFor(
  mechanic: string,
  metas: readonly MechanicMeta[],
  edges: readonly Edge[],
): string | undefined {
  const ctx = templateContext(metas, edges);
  return CONNECTION_TEMPLATES.find(
    (template) => template.owner === mechanic && template.applies(ctx),
  )?.line;
}

export function heading(meta: MechanicMeta): string {
  return meta.name.toUpperCase();
}

/**
 * The full rules strip, in the order mechanics entered the game. That single
 * ordering rule reproduces v3's worked examples; a role-based order does not,
 * because v3's own examples disagree about it.
 */
export function teachBlocks(metas: readonly MechanicMeta[], edges: readonly Edge[]): TeachBlock[] {
  return metas.map((meta) => {
    const connection = connectionLineFor(meta.id, metas, edges);
    return {
      mechanic: meta.id,
      heading: heading(meta),
      teach: meta.teach,
      ...(connection ? { connection } : {}),
    };
  });
}

/** Teach only the delta: what is new, what is gone, and any changed frame rule. */
export function teachDelta(
  before: { metas: readonly MechanicMeta[] },
  after: { metas: readonly MechanicMeta[]; edges: readonly Edge[] },
): TeachDelta {
  const beforeIds = new Set(before.metas.map((m) => m.id));
  const afterIds = new Set(after.metas.map((m) => m.id));

  const gone = before.metas
    .filter((meta) => !afterIds.has(meta.id))
    .map((meta) => ({ mechanic: meta.id, heading: heading(meta) }));

  const added = after.metas
    .filter((meta) => !beforeIds.has(meta.id))
    .map((meta) => {
      const connection = connectionLineFor(meta.id, after.metas, after.edges);
      return {
        mechanic: meta.id,
        heading: heading(meta),
        teach: meta.teach,
        ...(connection ? { connection } : {}),
      };
    });

  const changed = before.metas
    .filter((meta) => !afterIds.has(meta.id) && meta.onRemoveLine)
    .map((meta) => meta.onRemoveLine as string);

  return { gone, added, changed };
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export interface TeachBudget {
  lines: number;
  words: number;
}

/** Opener budget from v3: <= 6 lines, <= 60 words. Headings are not lines. */
export function measure(blocks: readonly TeachBlock[]): TeachBudget {
  const lines = blocks.flatMap((block) => (block.connection ? [block.teach, block.connection] : [block.teach]));
  return { lines: lines.length, words: lines.reduce((sum, line) => sum + countWords(line), 0) };
}
