import type { Claim, Comparison, PlayerId, Prize } from './types';

export interface DroppedClaim {
  claim: Claim;
  reason: 'zero' | 'belowRequirement';
}

export interface CancelledGroup {
  strength: number;
  players: PlayerId[];
}

export interface PrizeResolution {
  prize: Prize;
  /** Claims in the order they were made. */
  claims: Claim[];
  dropped: DroppedClaim[];
  cancelled: CancelledGroup[];
  winner: Claim | null;
  /** Everyone who claimed and did not win. */
  losers: PlayerId[];
  noWinnerReason: 'noClaims' | 'allDropped' | 'allCancelled' | null;
}

/**
 * Frame resolution, per prize. The order of these steps is the whole game:
 *
 *   1. collect claims
 *   2. drop claims that fail the requirement, and claims of 0
 *   3. compare strength (highest, or lowest when a mechanic flipped it)
 *   4. remove every group of tied claims
 *   5. the best remaining claim wins
 *
 * Step 2 before step 3 is what makes Lowest Wins + Market mean "the lowest
 * total that still reaches the price". Step 4 before step 5 is what makes
 * Bidding + Lowest Wins a lowest-*unique*-bid game, without anything in the
 * catalogue mentioning uniqueness.
 *
 * Because tied claims are removed rather than broken, there is no tie-break
 * rule anywhere in the engine, and resolution needs no ordering of players.
 */
export function resolvePrize(
  prize: Prize,
  claims: readonly Claim[],
  comparison: Comparison,
): PrizeResolution {
  const forPrize = claims.filter((claim) => claim.prize === prize.id);

  const dropped: DroppedClaim[] = [];
  const qualifying: Claim[] = [];
  for (const claim of forPrize) {
    if (claim.strength === 0) {
      // Covers passing, a Reroll bust, and a bid of 0, with one rule.
      dropped.push({ claim, reason: 'zero' });
    } else if (prize.minStrength !== undefined && claim.strength < prize.minStrength) {
      dropped.push({ claim, reason: 'belowRequirement' });
    } else {
      qualifying.push(claim);
    }
  }

  const byStrength = new Map<number, Claim[]>();
  for (const claim of qualifying) {
    const group = byStrength.get(claim.strength);
    if (group) group.push(claim);
    else byStrength.set(claim.strength, [claim]);
  }

  const cancelled: CancelledGroup[] = [];
  const survivors: Claim[] = [];
  for (const [strength, group] of byStrength) {
    if (group.length > 1) {
      cancelled.push({ strength, players: group.map((claim) => claim.player) });
    } else if (group[0]) {
      survivors.push(group[0]);
    }
  }
  cancelled.sort((a, b) => a.strength - b.strength);

  let winner: Claim | null = null;
  for (const claim of survivors) {
    if (winner === null) {
      winner = claim;
    } else if (comparison === 'highest' ? claim.strength > winner.strength : claim.strength < winner.strength) {
      winner = claim;
    }
  }

  const winningPlayer: PlayerId | null = winner === null ? null : winner.player;

  let noWinnerReason: PrizeResolution['noWinnerReason'] = null;
  if (winningPlayer === null) {
    if (forPrize.length === 0) noWinnerReason = 'noClaims';
    else if (cancelled.length > 0) noWinnerReason = 'allCancelled';
    else noWinnerReason = 'allDropped';
  }

  const losers = forPrize
    .map((claim) => claim.player)
    .filter((player) => player !== winningPlayer);

  return { prize, claims: forPrize, dropped, cancelled, winner, losers, noWinnerReason };
}
