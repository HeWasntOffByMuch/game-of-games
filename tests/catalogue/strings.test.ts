import { describe, expect, it } from 'vitest';
import { countWords } from '../../src/assembler/teach';
import { CATALOGUE } from '../../src/mechanics/catalogue';

/**
 * Mastery lives in the vocabulary: a mechanic's name and rule never change
 * between combinations, and nothing a player reads is written in designer or
 * engine language. A light version of v3's jargon lint, as a test.
 */
const BANNED = [
  // Engine and design vocabulary.
  'mechanic', 'module', 'capability', 'port', 'provides', 'consumes', 'role',
  'frame', 'hook', 'graph', 'dependency', 'modifier', 'stub', 'beat',
  // Designer vocabulary.
  'worker placement', 'area control', 'engine building', 'tableau', 'draft',
  'deck building', 'sealed bid', 'push your luck', 'set collection',
  'action selection', 'take that', 'victory points',
];

describe('player vocabulary', () => {
  it.each(CATALOGUE.map((meta) => [meta.id, meta] as const))('%s stays inside the word limits', (_id, meta) => {
    expect(countWords(meta.name)).toBeLessThanOrEqual(4);
    expect(countWords(meta.teach)).toBeLessThanOrEqual(12);
    expect(countWords(meta.tip)).toBeLessThanOrEqual(12);
  });

  it.each(CATALOGUE.map((meta) => [meta.id, meta] as const))('%s uses no jargon', (_id, meta) => {
    for (const text of [meta.name, meta.teach, meta.tip, meta.onRemoveLine ?? '']) {
      for (const word of BANNED) {
        expect(text.toLowerCase(), `"${text}" contains "${word}"`).not.toContain(word);
      }
    }
  });

  it('gives every mechanic a distinct name and id', () => {
    expect(new Set(CATALOGUE.map((m) => m.id)).size).toBe(CATALOGUE.length);
    expect(new Set(CATALOGUE.map((m) => m.name)).size).toBe(CATALOGUE.length);
  });

  it('gives every mechanic a tip, so players have somewhere to start', () => {
    for (const meta of CATALOGUE) expect(meta.tip.length).toBeGreaterThan(0);
  });
});
