import { describe, expect, it } from 'vitest';
import { assemble, assembleOrThrow, hookOrder } from '../../src/assembler/assemble';
import { mechanicEdges } from '../../src/grammar/edges';
import type { RuleFailure } from '../../src/assembler/rules';
import { CATALOGUE, meta } from './metas';

function failures(ids: string[]): RuleFailure[] {
  const result = assemble(ids, CATALOGUE);
  if (result.ok) throw new Error(`Expected ${ids.join('+')} to be rejected`);
  return result.failures;
}

function rules(ids: string[]): string[] {
  return [...new Set(failures(ids).map((f) => f.rule))].sort();
}

describe('assembler', () => {
  describe('edge derivation', () => {
    it('derives a dependency chain from port declarations alone', () => {
      const game = assembleOrThrow(['numProvider', 'prizeShop', 'matcher'], CATALOGUE);
      const between = mechanicEdges(game.edges).map((e) => `${e.from}->${e.to} ${e.label}`);
      expect(between).toContain('numProvider->prizeShop number: strength + price');
      expect(between).toContain('prizeShop->matcher card: spend');
    });

    it('collapses several uses of one port into a single labelled edge', () => {
      const game = assembleOrThrow(['numProvider', 'prizeShop', 'matcher'], CATALOGUE);
      const diceToShop = game.edges.filter((e) => e.from === 'numProvider' && e.to === 'prizeShop');
      expect(diceToShop).toHaveLength(1);
      expect(diceToShop[0]?.uses).toEqual(['strength', 'price']);
    });

    it('points a number modifier at the number provider it matches', () => {
      const game = assembleOrThrow(['numProvider', 'prizeShop', 'matcher', 'redraw'], CATALOGUE);
      expect(
        game.edges.some((e) => e.kind === 'modifies' && e.from === 'redraw' && e.to === 'numProvider'),
      ).toBe(true);
    });

    it('points a comparison modifier at every prize mechanic', () => {
      const game = assembleOrThrow(['numProvider', 'prizeShop', 'matcher', 'flip'], CATALOGUE);
      expect(
        game.edges.some((e) => e.kind === 'modifies' && e.from === 'flip' && e.to === 'prizeShop'),
      ).toBe(true);
    });

    it('wires both terminals', () => {
      const game = assembleOrThrow(['potLike', 'bidder'], CATALOGUE);
      expect(game.edges.some((e) => e.from === 'Players' && e.to === 'bidder')).toBe(true);
      expect(game.edges.some((e) => e.from === 'potLike' && e.to === 'Ranking')).toBe(true);
    });

    it('lets a resource flow both ways between two mechanics', () => {
      // The pot pays points; bids spend them. Both edges are real.
      const game = assembleOrThrow(['potLike', 'bidder'], CATALOGUE);
      const between = mechanicEdges(game.edges).map((e) => `${e.from}->${e.to}`);
      expect(between).toContain('bidder->potLike');
      expect(between).toContain('potLike->bidder');
    });
  });

  describe('validation', () => {
    it('accepts a connected game that covers every role', () => {
      const result = assemble(['numProvider', 'prizeShop', 'matcher'], CATALOGUE);
      expect(result.ok).toBe(true);
    });

    it('R1: rejects a mechanic whose requirement nothing provides', () => {
      const found = failures(['potLike', 'matcher']);
      const r1 = found.find((f) => f.rule === 'R1' && f.message.startsWith('matcher'));
      expect(r1?.message).toMatch(/matcher needs card\{symbol\} \(spend\)/);
      expect(r1?.candidates).toContain('prizeShop');
    });

    it('R2: rejects a dead end, and names what would consume it', () => {
      const found = failures(['numProvider', 'prizeShop']);
      const r2 = found.find((f) => f.rule === 'R2');
      expect(r2?.message).toBe('prizeShop.card has no consumer');
      expect(r2?.candidates).toEqual(['matcher']);
    });

    it('R2: rejects a modifier that modifies nothing here', () => {
      // `redraw` wants a random number; a bid is chosen, not rolled.
      const found = failures(['potLike', 'bidder', 'redraw']);
      expect(found.some((f) => f.rule === 'R2' && /redraw modifies nothing/.test(f.message))).toBe(true);
    });

    it('R4/R5: rejects parallel games that only meet at the score', () => {
      expect(rules(['numProvider', 'prizeShop', 'matcher', 'island'])).toEqual(
        expect.arrayContaining(['R4', 'R5']),
      );
    });

    it('R6: rejects a game with no way to score', () => {
      const found = failures(['numProvider', 'prizeShop']);
      const r6 = found.find((f) => f.rule === 'R6' && /score/.test(f.message));
      expect(r6?.candidates).toContain('matcher');
    });

    it('R7: rejects a game that plays itself', () => {
      // One prize, no input, and passing costs nothing.
      expect(rules(['numProvider', 'potLike'])).toContain('R7');
    });

    it('R7: one prize is enough when a mechanic asks for an input', () => {
      expect(assemble(['potLike', 'bidder'], CATALOGUE).ok).toBe(true);
    });

    it('R8: rejects declared conflicts', () => {
      const clash = meta({ id: 'clash', roles: ['score'], provides: [{ type: 'points' }], consumes: [{ type: 'card', required: true }], conflicts: ['matcher'] });
      const result = assemble(['numProvider', 'prizeShop', 'matcher', 'clash'], [...CATALOGUE, clash]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failures.some((f) => f.rule === 'R8')).toBe(true);
    });

    it('R12: rejects fewer than two mechanics', () => {
      expect(rules(['numProvider'])).toContain('R12');
    });

    it('R12: rejects the same mechanic twice', () => {
      expect(rules(['numProvider', 'numProvider'])).toContain('R12');
    });

    it('R0: rejects an unknown mechanic', () => {
      expect(rules(['numProvider', 'nope'])).toContain('R0');
    });
  });

  describe('assembled game', () => {
    it('keeps mechanics in entry order but dispatches hooks by priority', () => {
      const game = assembleOrThrow(['matcher', 'prizeShop', 'numProvider'], CATALOGUE);
      expect(game.ids).toEqual(['matcher', 'prizeShop', 'numProvider']);
      expect(game.order).toEqual(['numProvider', 'prizeShop', 'matcher']);
    });

    it('breaks equal priorities by entry order, so ordering is stable', () => {
      const a = meta({ id: 'a', priority: 5 });
      const b = meta({ id: 'b', priority: 5 });
      expect(hookOrder([a, b])).toEqual(['a', 'b']);
      expect(hookOrder([b, a])).toEqual(['b', 'a']);
    });

    it('records which mechanic covers each role', () => {
      const game = assembleOrThrow(['numProvider', 'prizeShop', 'matcher'], CATALOGUE);
      expect(game.roles).toEqual({
        stakes: ['prizeShop'],
        contest: ['numProvider'],
        score: ['matcher'],
      });
    });

    it('throws with every reason when asked for a game or nothing', () => {
      expect(() => assembleOrThrow(['numProvider', 'prizeShop'], CATALOGUE)).toThrow(/R2/);
    });
  });
});
