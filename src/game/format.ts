import type { GameEvent } from '../frame/events';

/**
 * A compact, human-readable rendering of the event log. Used by the headless
 * CLI and by the golden tests, so a reviewer can read what a game did rather
 * than diffing JSON.
 */
export function formatEvent(event: GameEvent): string | null {
  switch (event.t) {
    case 'roundStart':
      return `== ${event.mechanics.join(' + ')} | seed ${event.seed} | ${event.players.join(', ')}`;
    case 'turnStart':
      return `-- turn ${event.turn}`;
    case 'prizeOffered':
      return `   offer ${event.prize.id} ${event.prize.label}${
        event.prize.minStrength === undefined ? '' : ` (needs ${event.prize.minStrength})`
      }`;
    case 'number':
      return `   ${event.player} ${event.source} ${event.value}${
        event.parts.length > 1 ? ` [${event.parts.join(',')}]` : ''
      }`;
    case 'numberChanged':
      return `   ${event.player} ${event.source} ${event.from} -> ${event.to}${
        event.parts.length > 1 ? ` [${event.parts.join(',')}]` : ''
      }${event.note ? ` (${event.note})` : ''}`;
    case 'comparisonSet':
      return `   ${event.source}: ${event.direction} wins`;
    case 'pass':
      return `   ${event.player} passes`;
    case 'claim':
      return `   ${event.player} claims ${event.prize} with ${event.strength}`;
    case 'claimDropped':
      return `   ${event.player} dropped from ${event.prize} (${event.reason})`;
    case 'tieCancelled':
      return `   tie on ${event.prize} at ${event.strength}: ${event.players.join(', ')} cancel`;
    case 'win':
      return `   ${event.player} WINS ${event.prize} with ${event.strength}`;
    case 'noWinner':
      return `   ${event.prize} unwon (${event.reason})`;
    case 'points':
      return `   ${event.player} ${event.delta > 0 ? '+' : ''}${event.delta} points = ${event.total}${
        event.note ? ` (${event.note})` : ''
      }`;
    case 'cardGained':
      return `   ${event.player} takes ${event.card.symbol}`;
    case 'cardsSpent':
      return `   ${event.player} spends ${event.cards.map((c) => c.symbol).join(', ')}`;
    case 'note':
      return `   ${event.source}: ${event.text}`;
    case 'roundEnd':
      return `== end (${event.reason}) ${event.standings
        .map((s) => `${s.rank}. ${s.player} ${s.points}`)
        .join('  ')}`;
    // Not worth a line each: a loss is implied by someone else's win.
    case 'lose':
    case 'turnEnd':
      return null;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

export function formatLog(events: readonly GameEvent[]): string {
  return events
    .map(formatEvent)
    .filter((line): line is string => line !== null)
    .join('\n');
}
