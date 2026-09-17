import { describe, expect, it } from 'vitest';
import { assembleOrThrow } from '../../src/assembler/assemble';
import { FRAME_LINES, countWords, measure, teachDelta } from '../../src/assembler/teach';
import { CATALOGUE } from './metas';

describe('teach generation', () => {
  it('teaches in the order mechanics entered the game', () => {
    const game = assembleOrThrow(['numProvider', 'prizeShop', 'matcher'], CATALOGUE);
    expect(game.teach.map((b) => b.mechanic)).toEqual(['numProvider', 'prizeShop', 'matcher']);
    expect(game.teach.map((b) => b.heading)).toEqual(['NUMBERS', 'SHOP', 'MATCHER']);
  });

  it('measures lines and words without counting headings', () => {
    const game = assembleOrThrow(['numProvider', 'prizeShop', 'matcher'], CATALOGUE);
    expect(game.budget.lines).toBe(3);
    expect(game.budget.words).toBe(6);
  });

  it('keeps the frame to four lines', () => {
    expect(FRAME_LINES).toHaveLength(4);
    for (const line of FRAME_LINES) expect(countWords(line)).toBeLessThanOrEqual(12);
  });

  describe('deltas', () => {
    it('teaches only what was added', () => {
      const before = assembleOrThrow(['numProvider', 'prizeShop', 'matcher'], CATALOGUE);
      const after = assembleOrThrow(['numProvider', 'prizeShop', 'matcher', 'redraw'], CATALOGUE);
      const delta = teachDelta(before, after);
      expect(delta.added.map((b) => b.mechanic)).toEqual(['redraw']);
      expect(delta.gone).toEqual([]);
      expect(delta.changed).toEqual([]);
    });

    it('marks a replaced mechanic as gone', () => {
      const before = assembleOrThrow(['numProvider', 'prizeShop', 'matcher'], CATALOGUE);
      const after = assembleOrThrow(['bidder', 'potLike'], CATALOGUE);
      const delta = teachDelta(before, after);
      expect(delta.gone.map((b) => b.mechanic).sort()).toEqual(['matcher', 'numProvider', 'prizeShop']);
      expect(delta.added.map((b) => b.mechanic).sort()).toEqual(['bidder', 'potLike']);
    });

    it('adds a CHANGED line when removing a mechanic quietly restores a frame rule', () => {
      const before = assembleOrThrow(['numProvider', 'prizeShop', 'matcher', 'flip'], CATALOGUE);
      const after = assembleOrThrow(['numProvider', 'prizeShop', 'matcher'], CATALOGUE);
      expect(teachDelta(before, after).changed).toEqual(['Highest number wins again.']);
    });

    it('needs no CHANGED line when the mechanic says so itself', () => {
      const before = assembleOrThrow(['numProvider', 'prizeShop', 'matcher'], CATALOGUE);
      const after = assembleOrThrow(['numProvider', 'prizeShop', 'matcher', 'flip'], CATALOGUE);
      const delta = teachDelta(before, after);
      expect(delta.changed).toEqual([]);
      expect(delta.added.map((b) => b.teach)).toEqual(['Teach line.']);
    });
  });

  it('measures a single block correctly', () => {
    expect(measure([{ mechanic: 'x', heading: 'X', teach: 'One two three.', connection: 'Four five.' }])).toEqual({
      lines: 2,
      words: 5,
    });
  });
});
