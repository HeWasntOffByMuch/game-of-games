import { describe, expect, it } from 'vitest';
import { ping } from '../src/_smoke';

describe('scaffold', () => {
  it('runs', () => {
    expect(ping()).toBe('pong');
  });
});
