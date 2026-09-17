import type { MechanicMeta } from '../grammar/ports';
import { biddingMeta } from './bidding/meta';
import { diceMeta } from './dice/meta';
import { lowestWinsMeta } from './lowestWins/meta';
import { marketMeta } from './market/meta';
import { potMeta } from './pot/meta';
import { rerollMeta } from './reroll/meta';
import { threeOfAKindMeta } from './threeOfAKind/meta';

/**
 * Metadata only, so the assembler and the mutation screen can reason about
 * games without loading any mechanic's implementation.
 *
 * Seven of v3's sixteen mechanics, chosen because they are the minimum that
 * produces the three target games (docs/DECISIONS.md D1).
 */
export const CATALOGUE: readonly MechanicMeta[] = [
  diceMeta,
  marketMeta,
  threeOfAKindMeta,
  rerollMeta,
  lowestWinsMeta,
  potMeta,
  biddingMeta,
];

export function metaFor(id: string): MechanicMeta {
  const meta = CATALOGUE.find((entry) => entry.id === id);
  if (!meta) throw new Error(`Unknown mechanic: ${id}`);
  return meta;
}
