import assert from "node:assert/strict";
import { test } from "node:test";
import { isCurrency, isLocale, isTimezone, resetRegion, setRegion, todayIn } from "./region.ts";
import { inr, inrShort } from "./money.ts";
import { todayISO } from "./calendar.ts";

test("a region only takes values Intl will actually format with", () => {
  resetRegion();
  assert.ok(isLocale("en-GB"));
  assert.equal(isLocale("not a locale"), false);
  assert.ok(isTimezone("Asia/Kolkata"));
  assert.equal(isTimezone("Mars/Olympus"), false);
  assert.ok(isCurrency("usd"), "case does not matter");
  assert.equal(isCurrency("dollars"), false);

  // A bad value is ignored rather than applied, so a typo cannot blank a page.
  const kept = setRegion({ locale: "sdfsdf", currency: "nope", timezone: "Nowhere" });
  assert.equal(kept.locale, "en-IN");
  assert.equal(kept.currency, "INR");
  assert.equal(kept.timezone, "");
  resetRegion();
});

test("today is read in the household's zone when it has one", () => {
  // 19 October 01:00 in Kolkata is still 18 October in London and in UTC.
  const at = new Date("2026-10-18T19:30:00Z");
  assert.equal(todayIn("Asia/Kolkata", at), "2026-10-19");
  assert.equal(todayIn("Europe/London", at), "2026-10-18");
  assert.equal(todayIn("UTC", at), "2026-10-18");

  resetRegion();
  setRegion({ timezone: "Asia/Kolkata" });
  assert.equal(todayISO(at), "2026-10-19", "the calendar reads the same clock");
  resetRegion();
});

test("money follows the currency, and so does the compact axis label", () => {
  resetRegion();
  assert.match(inr(1234), /1,234/);
  assert.equal(inrShort(150000), "₹1.5L", "lakhs, because rupees are read that way");

  setRegion({ locale: "en-US", currency: "USD" });
  assert.match(inr(1234), /\$/);
  assert.equal(inrShort(1_500_000), "$1.5M", "and millions, because dollars are not");
  assert.equal(inrShort(1500), "$1.5k");
  resetRegion();
});
