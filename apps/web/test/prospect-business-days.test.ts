import assert from "node:assert/strict";
import { test } from "node:test";

import {
  followUpMinWaitElapsed,
  fullWorkdaysBetween,
  isWorkday,
  MIN_FOLLOW_UP_FULL_WORKDAYS,
} from "../lib/prospect-pipeline/business-days.ts";
import { atUtc } from "./prospect-fixtures.ts";

test("isWorkday: ma-vr ja, za/zo nee", () => {
  assert.equal(isWorkday(atUtc("2026-01-05")), true); // ma
  assert.equal(isWorkday(atUtc("2026-01-10")), false); // za
  assert.equal(isWorkday(atUtc("2026-01-11")), false); // zo
});

test("fullWorkdaysBetween: telt alleen volledige werkdagen na startdag", () => {
  // ma 5 jan -> wo 7 jan = di + wo = 2 werkdagen
  assert.equal(fullWorkdaysBetween(atUtc("2026-01-05"), atUtc("2026-01-07")), 2);
  // ma 5 jan -> di 6 jan = 1 werkdag (ma telt niet mee: niet volledig)
  assert.equal(fullWorkdaysBetween(atUtc("2026-01-05"), atUtc("2026-01-06")), 1);
  // ma 5 jan -> ma 5 jan zelf = 0
  assert.equal(fullWorkdaysBetween(atUtc("2026-01-05"), atUtc("2026-01-05")), 0);
  // vr 9 jan -> ma 12 jan = 1 werkdag (ma), weekend telt niet
  assert.equal(fullWorkdaysBetween(atUtc("2026-01-09"), atUtc("2026-01-12")), 1);
  // vr 9 jan -> di 13 jan = 2 werkdagen (ma+di)
  assert.equal(fullWorkdaysBetween(atUtc("2026-01-09"), atUtc("2026-01-13")), 2);
});

test("followUpMinWaitElapsed: 2 volledige werkdagen vereist", () => {
  // Eerste e-mail ma 5 jan. Dinsdag (1 dag) -> nog niet.
  assert.equal(followUpMinWaitElapsed("2026-01-05T09:00:00.000Z", atUtc("2026-01-06")), false);
  // Woensdag (2 volledige werkdagen: di+wo) -> wel.
  assert.equal(followUpMinWaitElapsed("2026-01-05T09:00:00.000Z", atUtc("2026-01-07")), true);
  // Weekend telt niet: vrijdag -> maandag is 1 werkdag.
  assert.equal(followUpMinWaitElapsed("2026-01-09T09:00:00.000Z", atUtc("2026-01-12")), false);
  // vrijdag -> dinsdag = 2 werkdagen.
  assert.equal(followUpMinWaitElapsed("2026-01-09T09:00:00.000Z", atUtc("2026-01-13")), true);
});

test("MIN_FOLLOW_UP_FULL_WORKDAYS is 2", () => {
  assert.equal(MIN_FOLLOW_UP_FULL_WORKDAYS, 2);
});
