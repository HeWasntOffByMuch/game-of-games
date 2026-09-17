import type { AnyMechanic } from '../frame/mechanic';
import { dice } from './dice';
import { lowestWins } from './lowestWins';
import { market } from './market';
import { reroll } from './reroll';
import { threeOfAKind } from './threeOfAKind';

/** Implementations, keyed by id. Mechanics never import each other. */
export const MECHANICS: Record<string, AnyMechanic> = {
  [dice.meta.id]: dice,
  [market.meta.id]: market,
  [threeOfAKind.meta.id]: threeOfAKind,
  [reroll.meta.id]: reroll,
  [lowestWins.meta.id]: lowestWins,
};

export function mechanicFor(id: string): AnyMechanic {
  const mechanic = MECHANICS[id];
  if (!mechanic) throw new Error(`No implementation for mechanic: ${id}`);
  return mechanic;
}

export function mechanicsFor(ids: readonly string[]): AnyMechanic[] {
  return ids.map(mechanicFor);
}
