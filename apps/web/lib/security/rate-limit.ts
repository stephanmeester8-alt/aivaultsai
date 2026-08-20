/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * No dependencies. Suitable for a single server instance; it is NOT a
 * distributed limiter (see report: remaining risks).
 */

export type RateLimitDecision = {
  allowed: boolean;
  /** Seconds the caller should wait before retrying (0 when allowed). */
  retryAfterSeconds: number;
};

export class RateLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  readonly #hits = new Map<string, number[]>();

  constructor(options: {
    limit: number;
    windowMs: number;
    now?: () => number;
  }) {
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
    this.#now = options.now ?? (() => Date.now());
  }

  check(key: string): RateLimitDecision {
    const now = this.#now();
    const cutoff = now - this.#windowMs;
    const hits = (this.#hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

    if (hits.length >= this.#limit) {
      const oldest = hits[0] ?? now;
      this.#hits.set(key, hits);
      const retryAfterMs = oldest + this.#windowMs - now;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    hits.push(now);
    this.#hits.set(key, hits);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Drop all recorded hits, or only those for one key. */
  reset(key?: string): void {
    if (key === undefined) {
      this.#hits.clear();
    } else {
      this.#hits.delete(key);
    }
  }
}
