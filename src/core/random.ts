/**
 * A small deterministic pseudo-random number generator for scene generation.
 *
 * It intentionally does not depend on `Math.random()`: the same seed and the
 * same sequence of calls produces the same result in Node and in the browser.
 * Child streams are derived from the original seed rather than the current
 * state, so consuming one stream never perturbs another one.
 */

export type RandomSeed = string | number | bigint;

export interface WeightedValue<T> {
  value: T;
  weight: number;
}

const UINT32_RANGE = 0x1_0000_0000;
const STREAM_SEPARATOR = "\u001f";

/** A stable 32-bit FNV-1a hash over JavaScript UTF-16 code units. */
export function hashSeed(seed: RandomSeed): number {
  const value = String(seed);
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  // A final avalanche improves nearby numeric and short string seeds.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function encodeStreamPart(value: RandomSeed): string {
  const text = String(value);
  return `${text.length}:${text}`;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number.`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

/**
 * Deterministic PRNG with named, independent child streams.
 *
 * `int()` uses inclusive bounds. For example, `int(2, 4)` can return 2, 3,
 * or 4; `int(4)` is shorthand for `int(0, 4)`.
 */
export class SeededRandom {
  /** User supplied root seed, preserved for diagnostics and replay. */
  public readonly seed: string;

  /** Fully-qualified stream identity; useful when tracing generated scenes. */
  public readonly stream: string;

  private state: number;

  public constructor(seed: RandomSeed, stream = "root") {
    this.seed = String(seed);
    this.stream = stream;
    this.state = hashSeed(`${encodeStreamPart(this.seed)}${STREAM_SEPARATOR}${stream}`);
  }

  /** Returns the next unsigned 32-bit value. */
  public nextUint32(): number {
    // mulberry32: compact, fast, and specified entirely in 32-bit operations.
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  /** Returns a value in [0, 1). */
  public next(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  /** Alias for `next()` when a floating-point call reads more clearly. */
  public unit(): number {
    return this.next();
  }

  /** Returns a value in [min, max). */
  public float(min = 0, max = 1): number {
    assertFinite(min, "min");
    assertFinite(max, "max");
    if (max < min) {
      throw new RangeError("max must be greater than or equal to min.");
    }
    return min + (max - min) * this.next();
  }

  /** Alias for `float()`. */
  public range(min = 0, max = 1): number {
    return this.float(min, max);
  }

  public int(maxInclusive: number): number;
  public int(minInclusive: number, maxInclusive: number): number;
  /** Returns a uniformly selected integer with inclusive bounds. */
  public int(minOrMax: number, optionalMax?: number): number {
    const min = optionalMax === undefined ? 0 : minOrMax;
    const max = optionalMax === undefined ? minOrMax : optionalMax;

    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      throw new RangeError("Integer bounds must be safe integers.");
    }
    if (max < min) {
      throw new RangeError("max must be greater than or equal to min.");
    }

    const span = max - min + 1;
    if (!Number.isSafeInteger(span) || span <= 0 || span > UINT32_RANGE) {
      throw new RangeError("Integer range must contain between 1 and 2^32 values.");
    }

    // Rejection sampling avoids modulo bias for spans that do not divide 2^32.
    const limit = UINT32_RANGE - (UINT32_RANGE % span);
    let sample = this.nextUint32();
    while (sample >= limit) sample = this.nextUint32();
    return min + (sample % span);
  }

  /** Returns true with the provided probability in [0, 1]. */
  public bool(probability = 0.5): boolean {
    assertFinite(probability, "probability");
    if (probability < 0 || probability > 1) {
      throw new RangeError("probability must be between 0 and 1.");
    }
    return this.next() < probability;
  }

  /** Alias for `bool()`. */
  public chance(probability = 0.5): boolean {
    return this.bool(probability);
  }

  /** Returns -1 or 1 with equal probability. */
  public sign(): -1 | 1 {
    return this.bool() ? 1 : -1;
  }

  /** Picks one element from a non-empty array. */
  public pick<T>(items: readonly T[]): T {
    assertPositiveInteger(items.length, "items.length");
    // `items.length > 0` is checked above, but TypeScript cannot narrow it.
    return items[this.int(items.length - 1)] as T;
  }

  /** Returns a shuffled copy and leaves the source array untouched. */
  public shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = this.int(index);
      const current = result[index] as T;
      result[index] = result[other] as T;
      result[other] = current;
    }
    return result;
  }

  /** Samples distinct entries without replacement. */
  public sample<T>(items: readonly T[], count: number): T[] {
    if (!Number.isSafeInteger(count) || count < 0 || count > items.length) {
      throw new RangeError("count must be a non-negative safe integer no greater than items.length.");
    }
    return this.shuffle(items).slice(0, count);
  }

  /**
   * Draws from a normal distribution via the Box-Muller transform.
   * It is deliberately uncached so every call consumes exactly two uniforms.
   */
  public normal(mean = 0, standardDeviation = 1): number {
    assertFinite(mean, "mean");
    assertFinite(standardDeviation, "standardDeviation");
    if (standardDeviation < 0) {
      throw new RangeError("standardDeviation must not be negative.");
    }
    if (standardDeviation === 0) {
      return mean;
    }

    // `1 - next()` is strictly positive because `next()` is in [0, 1).
    const radius = Math.sqrt(-2 * Math.log(1 - this.next()));
    const angle = Math.PI * 2 * this.next();
    return mean + standardDeviation * radius * Math.cos(angle);
  }

  /** Draws from a triangular distribution in [min, max]. */
  public triangular(min: number, max: number, mode = (min + max) / 2): number {
    assertFinite(min, "min");
    assertFinite(max, "max");
    assertFinite(mode, "mode");
    if (max < min) {
      throw new RangeError("max must be greater than or equal to min.");
    }
    if (mode < min || mode > max) {
      throw new RangeError("mode must lie between min and max.");
    }
    if (max === min) {
      return min;
    }

    const split = (mode - min) / (max - min);
    const sample = this.next();
    if (sample <= split) {
      return min + Math.sqrt(sample * (max - min) * (mode - min));
    }
    return max - Math.sqrt((1 - sample) * (max - min) * (max - mode));
  }

  public weightedPick<T>(items: readonly T[], weights: readonly number[]): T;
  public weightedPick<T>(items: readonly WeightedValue<T>[]): T;
  /**
   * Chooses a value by non-negative relative weights.
   *
   * Either pass separate `items` and `weights` arrays, or an array of
   * `{ value, weight }` records. Zero-weight entries are never selected.
   */
  public weightedPick<T>(
    items: readonly T[] | readonly WeightedValue<T>[],
    suppliedWeights?: readonly number[],
  ): T {
    if (items.length === 0) {
      throw new RangeError("Cannot choose a weighted value from an empty array.");
    }

    let values: readonly T[];
    let weights: readonly number[];

    if (suppliedWeights !== undefined) {
      if (suppliedWeights.length !== items.length) {
        throw new RangeError("items and weights must have the same length.");
      }
      values = items as readonly T[];
      weights = suppliedWeights;
    } else {
      const weighted = items as readonly WeightedValue<T>[];
      if (!weighted.every((entry) => entry !== null && typeof entry === "object" && "weight" in entry && "value" in entry)) {
        throw new TypeError("Use { value, weight } records when weights are not supplied separately.");
      }
      values = weighted.map((entry) => entry.value);
      weights = weighted.map((entry) => entry.weight);
    }

    let total = 0;
    for (const weight of weights) {
      assertFinite(weight, "weight");
      if (weight < 0) {
        throw new RangeError("weight must not be negative.");
      }
      total += weight;
    }
    if (!(total > 0) || !Number.isFinite(total)) {
      throw new RangeError("At least one finite positive weight is required.");
    }

    const target = this.next() * total;
    let cumulative = 0;
    for (let index = 0; index < values.length; index += 1) {
      cumulative += weights[index] as number;
      if (target < cumulative) {
        return values[index] as T;
      }
    }

    // Floating-point accumulation can place `target` infinitesimally beyond
    // the cumulative total. Return the final positive-weight candidate.
    for (let index = values.length - 1; index >= 0; index -= 1) {
      if ((weights[index] as number) > 0) {
        return values[index] as T;
      }
    }
    throw new Error("Unreachable: a positive total had no positive weight.");
  }

  /** Alias for `weightedPick()`. */
  public chooseWeighted<T>(items: readonly T[], weights: readonly number[]): T;
  public chooseWeighted<T>(items: readonly WeightedValue<T>[]): T;
  public chooseWeighted<T>(
    items: readonly T[] | readonly WeightedValue<T>[],
    weights?: readonly number[],
  ): T {
    if (weights === undefined) {
      return this.weightedPick(items as readonly WeightedValue<T>[]);
    }
    return this.weightedPick(items as readonly T[], weights);
  }

  /**
   * Creates an independent deterministic child stream. This does not consume
   * this stream, which keeps named generation phases stable under refactors.
   */
  public fork(label: RandomSeed): SeededRandom {
    const childStream = `${this.stream}/${encodeStreamPart(label)}`;
    return new SeededRandom(this.seed, childStream);
  }

  /** Alias for `fork()`. */
  public derive(label: RandomSeed): SeededRandom {
    return this.fork(label);
  }

  /** Preserves the exact current state for retrying a local generation branch. */
  public clone(): SeededRandom {
    const copy = new SeededRandom(this.seed, this.stream);
    copy.state = this.state;
    return copy;
  }
}
