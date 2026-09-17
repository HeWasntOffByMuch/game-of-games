import { describe, expect, it } from 'vitest';
import { applyMutation, legalMutations } from '../../src/game/mutate';
import { CATALOGUE } from '../../src/mechanics/catalogue';

describe('mutations', () => {
  it('adds to the end, so the rules strip reads in the order it was built', () => {
    expect(applyMutation(['dice', 'market'], { op: 'add', mechanic: 'threeOfAKind' })).toEqual([
      'dice',
      'market',
      'threeOfAKind',
    ]);
  });

  it('replaces in place, so the rest of the strip stays where it was', () => {
    expect(
      applyMutation(['dice', 'market', 'threeOfAKind'], { op: 'replace', from: 'dice', to: 'bidding' }),
    ).toEqual(['bidding', 'market', 'threeOfAKind']);
  });

  it('keeps the game unchanged', () => {
    expect(applyMutation(['dice', 'market'], { op: 'keep' })).toEqual(['dice', 'market']);
  });

  it('only offers mutations that assemble into a valid game', () => {
    for (const option of legalMutations(['dice', 'market', 'threeOfAKind'], CATALOGUE)) {
      expect(option.game.ids).toEqual(option.ids);
    }
  });

  it('never offers a replacement that would break the game', () => {
    // Replacing Market would leave Three of a Kind with no cards.
    const options = legalMutations(['dice', 'market', 'threeOfAKind'], CATALOGUE);
    expect(
      options.some((o) => o.mutation.op === 'replace' && o.mutation.from === 'market'),
    ).toBe(false);
  });

  it('carries the rule delta each option would teach', () => {
    const options = legalMutations(['dice', 'market', 'threeOfAKind'], CATALOGUE);
    const addReroll = options.find((o) => o.label === 'Add Reroll');
    expect(addReroll?.delta.added.map((b) => b.heading)).toEqual(['REROLL']);
  });

  it('offers keeping the game when asked', () => {
    const options = legalMutations(['dice', 'market', 'threeOfAKind'], CATALOGUE, { includeKeep: true });
    const keep = options.find((o) => o.mutation.op === 'keep');
    expect(keep?.label).toBe('Same game, one more round');
    expect(keep?.delta).toEqual({ gone: [], added: [], changed: [] });
  });
});
