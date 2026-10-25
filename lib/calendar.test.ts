import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalEvent } from "./calendar.ts";
import {
  addPerson,
  blankEvent,
  canEdit,
  byDate,
  daysUntil,
  durationLabel,
  durationMinutes,
  endAfter,
  fromStored,
  isDate,
  isLink,
  monthGrid,
  normalizeCalendar,
  removePerson,
  rsvpCount,
  shiftMonth,
  timeRange,
  todayISO,
  upcoming,
  whenLabel,
} from "./calendar.ts";

const event = (over: Partial<CalEvent> = {}): CalEvent =>
  blankEvent("e1", "2026-10-23", { time: "20:00", title: "Movie night", ...over });

const ok = (over: Partial<CalEvent> = {}) => normalizeCalendar({ events: [event(over)] });

test("the month grid is six Monday-first weeks around the month", () => {
  // 1 February 2026 is a Sunday, so the grid has to reach back to 26 January.
  const grid = monthGrid("2026-02");
  assert.equal(grid.length, 42);
  assert.equal(grid[0].date, "2026-01-26");
  assert.equal(grid[0].inMonth, false);
  assert.equal(grid[6].date, "2026-02-01");
  assert.equal(grid[6].inMonth, true);
  assert.equal(grid[41].date, "2026-03-08");
  // Every cell is one day after the last, across the month boundary.
  assert.equal(new Set(grid.map((d) => d.date)).size, 42);
});

test("today is the reader's day, not the UTC one", () => {
  // 01:06 on 19 October, wherever the reader is. Built from local parts and
  // read back as local parts, so this fails for a toISOString() implementation
  // on any machine east or west of UTC — which is how the bill form came to
  // reject a bill typed after midnight in IST.
  assert.equal(todayISO(new Date(2026, 9, 19, 1, 6)), "2026-10-19");
  assert.equal(todayISO(new Date(2026, 0, 1, 23, 30)), "2026-01-01");
});

test("months shift across a year boundary", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-10", 0), "2026-10");
});

test("a date is only valid if the day actually exists", () => {
  assert.ok(isDate("2026-02-28"));
  assert.ok(isDate("2028-02-29"));
  assert.equal(isDate("2026-02-30"), false);
  assert.equal(isDate("2026-2-3"), false);
  assert.equal(isDate("tomorrow"), false);
});

test("days are counted as days, not as hours", () => {
  assert.equal(daysUntil("2026-10-20", "2026-10-19"), 1);
  assert.equal(daysUntil("2026-10-19", "2026-10-19"), 0);
  assert.equal(daysUntil("2026-10-18", "2026-10-19"), -1);
  // Across a DST change in the reader's zone, a day is still a day.
  assert.equal(daysUntil("2026-03-30", "2026-03-28"), 2);
});

test("a day reads as today, tomorrow, a count, or a date", () => {
  assert.equal(whenLabel("2026-10-19", "2026-10-19"), "Today");
  assert.equal(whenLabel("2026-10-20", "2026-10-19"), "Tomorrow");
  assert.equal(whenLabel("2026-10-22", "2026-10-19"), "in 3 days");
  assert.equal(whenLabel("2026-10-25", "2026-10-19"), "in 6 days");
  assert.equal(whenLabel("2026-10-26", "2026-10-19"), "26/10");
  // A date that has gone past gets the date, never "in -2 days".
  assert.equal(whenLabel("2026-10-17", "2026-10-19"), "17/10");
});

test("a day's events are ordered with the all-day ones first", () => {
  const events = [
    event({ id: "a", time: "20:00", title: "Film" }),
    event({ id: "b", time: "", title: "Dad's birthday" }),
    event({ id: "c", time: "09:30", title: "Dentist" }),
  ];

  assert.deepEqual(
    byDate(events)
      .get("2026-10-23")!
      .map((e) => e.title),
    ["Dad's birthday", "Dentist", "Film"],
  );
});

test("upcoming keeps today and drops what has been and gone", () => {
  const events = [
    event({ id: "past", date: "2026-10-01" }),
    event({ id: "today", date: "2026-10-19" }),
    event({ id: "soon", date: "2026-10-23" }),
  ];
  assert.deepEqual(
    upcoming(events, "2026-10-19").map((e) => e.id),
    ["today", "soon"],
  );
  assert.equal(upcoming(events, "2026-10-19", 1).length, 1);
});

test("events need a real date and time, but may be left untitled", () => {
  assert.ok("doc" in ok());
  assert.ok("doc" in ok({ time: "" }));
  // The dialog saves on every keystroke, so clearing the title to retype it
  // must not be rejected — the same rule as item names.
  assert.ok("doc" in ok({ title: "  " }));

  assert.ok("error" in ok({ date: "2026-13-01" }));
  assert.ok("error" in ok({ time: "25:00" }));
  assert.ok("error" in ok({ time: "8pm" }));
  assert.ok("error" in ok({ id: "" }));
  assert.ok("error" in normalizeCalendar({ events: [event(), event()] }));
  assert.ok("error" in normalizeCalendar({ events: {} }));
});

test("an event has to end after it starts, and on the same day", () => {
  assert.ok("doc" in ok({ time: "20:00", endTime: "22:30" }));
  assert.ok("doc" in ok({ time: "20:00", endTime: "" }));

  assert.ok("error" in ok({ time: "20:00", endTime: "20:00" }));
  assert.ok("error" in ok({ time: "23:00", endTime: "01:00" }), "overnight is split, not wrapped");
  assert.ok("error" in ok({ time: "", endTime: "22:30" }), "an end time needs a start");
});

test("a duration is a way of typing an end time", () => {
  assert.equal(endAfter("20:00", 150), "22:30");
  assert.equal(endAfter("09:15", 30), "09:45");
  // Rather than rolling into the next day, which the one-date shape cannot hold.
  assert.equal(endAfter("23:30", 120), "23:59");
  assert.equal(endAfter("", 60), "");

  assert.equal(durationMinutes("20:00", "22:30"), 150);
  assert.equal(durationMinutes("20:00", ""), null);
  assert.equal(durationLabel(150), "2h 30m");
  assert.equal(durationLabel(120), "2h");
  assert.equal(durationLabel(45), "45m");

  assert.equal(timeRange({ time: "20:00", endTime: "22:30" }), "20:00–22:30");
  assert.equal(timeRange({ time: "20:00", endTime: "" }), "20:00");
  assert.equal(timeRange({ time: "", endTime: "" }), "All day");
});

test("people are added from a list or typed, and deduped case-insensitively", () => {
  assert.deepEqual(addPerson([], "Dad, Mum , dad"), ["Dad", "Mum"]);
  assert.deepEqual(addPerson(["Dad"], "  "), ["Dad"]);
  // Same array back when there is nothing to add, so a caller can skip the save.
  const people = ["Dad"];
  assert.equal(addPerson(people, "dad"), people);
});

test("dropping someone takes their answer with them", () => {
  const invited = event({ people: ["Dad", "Mum"], rsvp: { Dad: "yes", Mum: "no" } });
  const after = removePerson(invited, "Mum");
  assert.deepEqual(after.people, ["Dad"]);
  assert.deepEqual(after.rsvp, { Dad: "yes" });
});

test("an answer from someone off the list is dropped, not an error", () => {
  const result = ok({ people: ["Dad"], rsvp: { Dad: "yes", Ghost: "maybe" } });
  assert.ok("doc" in result);
  assert.deepEqual(result.doc.events[0].rsvp, { Dad: "yes" });
  assert.deepEqual(rsvpCount(result.doc.events[0]), { yes: 1, no: 0, maybe: 0, quiet: 0 });
  assert.deepEqual(rsvpCount(event({ people: ["Dad", "Mum"], rsvp: { Dad: "yes" } })), {
    yes: 1,
    no: 0,
    maybe: 0,
    quiet: 1,
  });
});

test("a link gets https:// and only http(s) is allowed through", () => {
  const result = ok({ link: "bookmyshow.com/x" });
  assert.ok("doc" in result);
  assert.equal(result.doc.events[0].link, "https://bookmyshow.com/x");

  assert.equal(isLink("https://example.com"), true);
  assert.equal(isLink(""), true);
  assert.equal(isLink("javascript:alert(1)"), false);
  assert.ok("error" in ok({ link: "javascript:alert(1)" }));
});

test("the booking name only survives while there is a booking", () => {
  const booked = ok({ reservation: "booked", reservedUnder: "Dad" });
  assert.ok("doc" in booked);
  assert.equal(booked.doc.events[0].reservedUnder, "Dad");

  const dropped = ok({ reservation: "needed", reservedUnder: "Dad" });
  assert.ok("doc" in dropped);
  assert.equal(dropped.doc.events[0].reservedUnder, "");

  assert.ok("error" in normalizeCalendar({ events: [{ ...event(), reservation: "pending" }] }));
});

test("a record written before the invitation list existed still loads", () => {
  const stored = { id: "old", date: "2026-10-23", time: "20:00", title: "Film night", who: "Everyone", notes: "" };
  const loaded = fromStored(stored);
  assert.deepEqual(loaded.people, ["Everyone"]);
  assert.deepEqual(loaded.rsvp, {});
  assert.deepEqual(loaded.comments, []);
  assert.equal(loaded.reservation, "");
  assert.equal(loaded.endTime, "");
});

test("only the person who added it may edit the details", () => {
  const mine = event({ createdBy: "Dad" });
  assert.equal(canEdit(mine, "Dad"), true);
  assert.equal(canEdit(mine, "Mum"), false);
  // Nobody recorded as the author, or nobody signed in: anyone may edit.
  assert.equal(canEdit(event({ createdBy: "" }), "Mum"), true);
  assert.equal(canEdit(mine, ""), true);
});

test("the stored order is calendar order", () => {
  const result = normalizeCalendar({
    events: [event({ id: "b", date: "2026-11-02" }), event({ id: "a", date: "2026-10-23" })],
  });
  assert.ok("doc" in result);
  assert.deepEqual(
    result.doc.events.map((e) => e.id),
    ["a", "b"],
  );
});
