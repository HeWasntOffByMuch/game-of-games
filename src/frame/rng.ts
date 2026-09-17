/**
 * Deterministic random numbers.
 *
 * The prototype's determinism contract is
 *   (seed, mechanic ids, params, input stream) -> identical event log
 * so every draw has to come from here, and never from Math.random.
 *
 * Streams are derived by label (`rng.derive('dice')`) so that two mechanics
 * drawing in the same turn cannot shift each other's numbers. Without that,
 * adding Market to a game would silently change every dice roll, and the
 * golden-log tests would break for reasons that have nothing to do with the
 * change under test.
 */

/** 32-bit FNV-1a. Turns a seed string (or stream label) into a numeric state. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Rng {
  /** The label this stream was derived under, for debugging and logs. */
  readonly label: string;
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** A new independent stream, deterministic from this one's seed and the label. */
  derive(label: string): Rng;
}

/** mulberry32: small, fast, good enough, and trivially reproducible. */
export function createRng(seed: string, label = 'root'): Rng {
  let state = hashString(`${seed}::${label}`);

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    label,
    next,
    int(min, max) {
      if (max < min) throw new Error(`rng.int: empty range [${min}, ${max}]`);
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new Error('rng.pick: empty array');
      const item = items[Math.floor(next() * items.length)];
      // Guarded above, but noUncheckedIndexedAccess cannot see that.
      return item as NonNullable<typeof item>;
    },
    derive(childLabel) {
      return createRng(seed, `${label}/${childLabel}`);
    },
  };
}
