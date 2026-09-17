import { assembleOrThrow, type AssembledGame } from '../assembler/assemble';
import { Round, type PlayerSeed } from '../frame/round';
import { CATALOGUE } from '../mechanics/catalogue';
import { mechanicsFor } from '../mechanics/registry';

export interface GameSetup {
  seed: string;
  /** Mechanic ids in the order they entered the game. */
  ids: readonly string[];
  players: PlayerSeed[];
  params?: Record<string, Record<string, unknown>>;
  maxTurns?: number;
}

export interface Game {
  assembled: AssembledGame;
  round: Round;
}

/**
 * Assembles a game from mechanic ids and opens a round of it. Nothing here
 * knows about any particular game: the three worked examples are just three
 * different id lists.
 */
export function createGame(setup: GameSetup): Game {
  const assembled = assembleOrThrow(setup.ids, CATALOGUE);
  const round = new Round({
    seed: setup.seed,
    // Entry order; the round dispatches hooks by declared priority itself.
    mechanics: mechanicsFor(assembled.ids),
    players: setup.players,
    ...(setup.params ? { params: setup.params } : {}),
    ...(setup.maxTurns === undefined ? {} : { maxTurns: setup.maxTurns }),
  });
  return { assembled, round };
}
