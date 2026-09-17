/**
 * Headless play, for checking a combination quickly:
 *
 *   npm run play -- dice,market,threeOfAKind --players 3 --seed abc
 *
 * It prints the assembled rules and the event log. No UI, no networking.
 */
import { assemble } from '../assembler/assemble';
import { describeFailure } from '../assembler/rules';
import { FRAME_LINES } from '../assembler/teach';
import { createRng } from '../frame/rng';
import { playGame } from '../game/autoplay';
import { formatLog } from '../game/format';
import { cheapestReachable, dearestReachable, randomPolicy, type Policy } from '../game/policies';
import { CATALOGUE } from '../mechanics/catalogue';

interface Options {
  ids: string[];
  players: number;
  seed: string;
  turns: number;
  policy: string;
}

function parse(argv: string[]): Options {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const flag = (name: string, fallback: string): string => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? (argv[index + 1] ?? fallback) : fallback;
  };
  return {
    ids: (positional[0] ?? 'dice,market,threeOfAKind').split(',').map((id) => id.trim()),
    players: Number(flag('players', '3')),
    seed: flag('seed', 'cli'),
    turns: Number(flag('turns', '8')),
    policy: flag('policy', 'random'),
  };
}

function policyFor(name: string, seed: string): Policy {
  if (name === 'cheapest') return cheapestReachable;
  if (name === 'dearest') return dearestReachable;
  return randomPolicy(createRng(seed, 'policy'));
}

function main(): void {
  const options = parse(process.argv.slice(2));

  const result = assemble(options.ids, CATALOGUE);
  if (!result.ok) {
    console.error(`Cannot build [${options.ids.join(', ')}]:`);
    for (const failure of result.failures) console.error(`  ${describeFailure(failure)}`);
    process.exitCode = 1;
    return;
  }

  console.log(`${result.game.name}\n`);
  console.log('House rules:');
  for (const line of FRAME_LINES) console.log(`  ${line}`);
  console.log('\nThis game:');
  for (const block of result.game.teach) {
    console.log(`  ${block.heading}: "${block.teach}"`);
    if (block.connection) console.log(`    "${block.connection}"`);
  }
  console.log();

  const { round } = playGame(
    {
      seed: options.seed,
      ids: options.ids,
      players: Array.from({ length: options.players }, (_, i) => ({
        id: `p${i + 1}`,
        name: `Player ${i + 1}`,
      })),
      maxTurns: options.turns,
    },
    policyFor(options.policy, options.seed),
  );

  console.log(formatLog(round.log.all()));
}

main();
