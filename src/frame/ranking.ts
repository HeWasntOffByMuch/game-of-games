import type { PlayerId, PlayerState } from './types';

export interface Standing {
  player: PlayerId;
  points: number;
  /** 1-based. Players on equal points share a rank. */
  rank: number;
}

/**
 * Scoring is always live: this is valid after every event, so an interrupted
 * round is still rankable.
 */
export function rank(players: readonly PlayerState[]): Standing[] {
  const sorted = [...players].sort((a, b) => b.points - a.points);
  const standings: Standing[] = [];
  let lastPoints: number | null = null;
  let lastRank = 0;
  sorted.forEach((player, index) => {
    const rankValue = lastPoints === player.points ? lastRank : index + 1;
    lastPoints = player.points;
    lastRank = rankValue;
    standings.push({ player: player.id, points: player.points, rank: rankValue });
  });
  return standings;
}

/** Everyone sharing rank 1. More than one means the round was drawn. */
export function leaders(players: readonly PlayerState[]): PlayerId[] {
  return rank(players)
    .filter((standing) => standing.rank === 1)
    .map((standing) => standing.player);
}
