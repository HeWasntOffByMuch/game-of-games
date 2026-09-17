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
      answerPrepare(round, player.id, policyFor(player.id));
      round.commit(player.id, policyFor(player.id).commit(round.specFor(player.id), player.id));
    }
    round.reveal();
    round.next();
  }
  return { round, assembled };
}

/**
 * Answers prepare questions one at a time, re-reading the spec in between.
 *
 * They are asked in order for a reason: a reroll replaces the dice the next
 * question is about. Deciding everything from one snapshot would answer the
 * second question about dice that no longer exist - which is exactly what the
 * UI avoids by re-rendering after each answer.
 */
function answerPrepare(round: Round, player: PlayerId, policy: Policy): void {
  const answered = new Set<string>();
  for (;;) {
    const spec = round.specFor(player);
    const next = spec.prepare.find((field) => field.enabled && !answered.has(field.mechanic));
    if (!next) return;
    answered.add(next.mechanic);
    const value = policy.prepare?.(spec, player)?.[next.mechanic];
    if (value === undefined) continue;
    round.applyPrepare(player, next.mechanic, value);
  }
}
