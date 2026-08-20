import assert from "node:assert/strict";
import { test } from "node:test";

import { RateLimiter } from "../lib/security/rate-limit.ts";

function createClock() {
  let now = 1_000_000;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("allows requests up to the limit, then denies", () => {
  const clock = createClock();
  const limiter = new RateLimiter({
    limit: 3,
    windowMs: 1000,
    now: clock.now,
  });
  assert.equal(limiter.check("k").allowed, true);
  assert.equal(limiter.check("k").allowed, true);
  assert.equal(limiter.check("k").allowed, true);
  const denied = limiter.check("k");
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterSeconds >= 1, "retry-after must be set");
});

test("keys are isolated", () => {
  const clock = createClock();
  const limiter = new RateLimiter({
    limit: 1,
    windowMs: 1000,
    now: clock.now,
  });
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("a").allowed, false);
  assert.equal(limiter.check("b").allowed, true);
});

test("window slides: requests recover after the window passes", () => {
  const clock = createClock();
  const limiter = new RateLimiter({
    limit: 1,
    windowMs: 1000,
    now: clock.now,
  });
  assert.equal(limiter.check("k").allowed, true);
  assert.equal(limiter.check("k").allowed, false);
  clock.advance(1001);
  assert.equal(limiter.check("k").allowed, true);
});

test("reset clears state for one key or all keys", () => {
  const clock = createClock();
  const limiter = new RateLimiter({
    limit: 1,
    windowMs: 1000,
    now: clock.now,
  });
  assert.equal(limiter.check("k").allowed, true);
  assert.equal(limiter.check("k").allowed, false);
  limiter.reset("k");
  assert.equal(limiter.check("k").allowed, true);
  assert.equal(limiter.check("k").allowed, false);
  limiter.reset();
  assert.equal(limiter.check("k").allowed, true);
});
