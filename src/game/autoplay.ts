import type { Round } from '../frame/round';
import type { PlayerId } from '../frame/types';
import { createGame, type GameSetup } from './createGame';
import type { Policy } from './policies';
import type { AssembledGame } from '../assembler/assemble';

export interface AutoplayResult {
  round: Round;
  assembled: AssembledGame;
}

/**
 * Plays a whole round without a person, stepping the same state machine the
 * browser UI steps. One policy for everyone, or one per player.
 */
export function playGame(
  setup: GameSetup,
  policy: Policy | Record<PlayerId, Policy>,
): AutoplayResult {
  const { round, assembled } = createGame(setup);
  const policyFor = (player: PlayerId): Policy => {
    if ('commit' in policy) return policy as Policy;
    const found = (policy as Record<PlayerId, Policy>)[player];
    if (!found) throw new Error(`No policy for ${player}`);
    return found;
  };

  round.begin();
  while (!round.isOver) {
    for (const player of round.players) {
      const chosen = policyFor(player.id);
      const prepared = chosen.prepare?.(round.specFor(player.id), player.id) ?? {};
      for (const [mechanic, value] of Object.entries(prepared)) {
        round.applyPrepare(player.id, mechanic, value);
      }
      round.commit(player.id, chosen.commit(round.specFor(player.id), player.id));
    }
    round.reveal();
    round.next();
  }
  return { round, assembled };
}
