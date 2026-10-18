/**
 * The shared family calendar: what is planned, who is in, and the date maths
 * the month grid is drawn from.
 *
 * A date here is a plain `yyyy-mm-dd` and a time a plain `HH:MM`, both read as
 * local by whoever is looking. Movie night is at eight o'clock, not at an
 * instant on a global timeline, so there is no timezone in this file and
 * nothing is ever converted. The grid maths uses UTC midnight purely as a
 * calendar with no clocks in it, which is why adding a day is always 86400000.
 *
 * ponytail: no recurrence. "Every second Friday" means RRULE, which means
 * timezones, DST and exceptions to a series, and it is where calendar projects
 * die. If it is ever actually wanted, take `rrule` and expand the series on
 * read — one `CalEvent` is one occurrence, which is what an expansion produces.
 *
 * ponytail: one flat event, not a type per activity. A movie has a theatre and
 * a ticket link; a dinner has a restaurant and a booking link. Those are the
 * same two fields with different labels, so `kind` only changes what the page
 * calls `venue` and `link` — it never changes what is stored. A genuinely
 * movie-only field (seat numbers, say) is the point to reconsider that.
 */

import { cleanPerson } from "./family.ts";
import { region, todayIn } from "./region.ts";

export type Rsvp = "yes" | "no" | "maybe";

export type Comment = {
  id: string;
  /** Whoever wrote it, from the settings name. A signature, not an identity. */
  by: string;
  /** ISO timestamp, set by the page that posted it. May be empty. */
  at: string;
  text: string;
};

/** Where a booking stands. Empty means none is needed. */
export type Reservation = "" | "needed" | "booked";

export type CalEvent = {
  id: string;
  /** yyyy-mm-dd, local. */
  date: string;
  /** HH:MM, local. Empty means it takes the whole day. */
  time: string;
  /** HH:MM, local, after `time`. Empty means open-ended. Same day only. */
  endTime: string;
  /** What the day is being blocked for: movie, dinner, trip... Free text. */
  kind: string;
  title: string;
  /** Cinema, restaurant, house, wherever it is. */
  venue: string;
  /** Tickets, the booking, the invite — one link, labelled to suit `kind`. */
  link: string;
  /** Who is included. Names, picked from the household or typed in. */
  people: string[];
  /** name -> going, not going, maybe. Only names that are in `people`. */
  rsvp: Record<string, Rsvp>;
  reservation: Reservation;
  /** Whose name the booking is under. Only meaningful once reserved. */
  reservedUnder: string;
  /**
   * Who put it on the calendar, from `USER_NAME`. Only they get to edit the
   * details; everyone else can still RSVP and comment. That is a courtesy and
   * not a permission — with no sign-in the name is whatever settings say, and
   * the API will take an edit from anyone. Empty means nobody owns it.
   */
  createdBy: string;
  notes: string;
  comments: Comment[];
};

export type CalendarDoc = { events: CalEvent[] };

/** Suggestions, not a closed set — the field takes anything. */
export const ACTIVITIES = [
  "movie",
  "dinner",
  "outing",
  "trip",
  "party",
  "game night",
  "visitors",
  "appointment",
  "chore",
  "other",
] as const;

export const RESERVATIONS: { value: Reservation; label: string }[] = [
  { value: "", label: "No booking needed" },
  { value: "needed", label: "Needs a booking" },
  { value: "booked", label: "Reserved" },
];

export const RSVPS: { value: Rsvp; label: string }[] = [
  { value: "yes", label: "In" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "Out" },
];

/** The quick picks behind the duration box. An end time is what gets stored. */
export const DURATIONS = [30, 60, 90, 120, 180, 240];

export const MAX_EVENTS = 1000;
export const MAX_PEOPLE = 20;
export const MAX_COMMENTS = 50;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Today in the household's timezone, or wherever the reader is when none is
 * set — never UTC, which in IST is yesterday until 05:30.
 */
export const todayISO = (now = new Date()) => todayIn(region().timezone, now);

/** The yyyy-mm a date falls in. */
export const monthOf = (date: string) => date.slice(0, 7);

/** Shift a yyyy-mm by whole months, forwards or back. */
export function shiftMonth(month: string, by: number) {
  const [year, m] = month.split("-").map(Number);
  const total = year * 12 + (m - 1) + by;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${pad((total % 12) + 1)}`;
}

const DAY = 86_400_000;
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Whole days from one date to another. Negative when `date` is in the past. */
export const daysUntil = (date: string, from = todayISO()) => Math.round((utc(date) - utc(from)) / DAY);

export type Day = { date: string; inMonth: boolean };

/**
 * Six weeks of days covering the month, Monday first. Always 42 cells, so the
 * grid does not change height as you page through the months.
 */
export function monthGrid(month: string): Day[] {
  const first = utc(`${month}-01`);
  // getUTCDay has Sunday at 0; the grid starts on Monday.
  const back = (new Date(first).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = iso(first - back * DAY + i * DAY);
    return { date, inMonth: monthOf(date) === month };
  });
}

/* ---------------- times and durations ---------------- */

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * The end time `mins` after a start. Capped at 23:59 rather than rolling over:
 * an event that runs past midnight would need a second date, and one date is
 * the whole point of the shape above.
 */
export const endAfter = (time: string, mins: number) => {
  if (!isTime(time) || !time) return "";
  const total = Math.min(minutes(time) + mins, 23 * 60 + 59);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

/** How long it runs, in minutes, or null when either end is missing. */
export const durationMinutes = (time: string, endTime: string) =>
  time && endTime ? minutes(endTime) - minutes(time) : null;

/** "2h", "90m", "1h 30m" — how a duration reads to a person. */
export function durationLabel(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "20:00–22:30", "20:00", or "All day". */
export const timeRange = (event: Pick<CalEvent, "time" | "endTime">) =>
  !event.time ? "All day" : event.endTime ? `${event.time}–${event.endTime}` : event.time;

/* ---------------- ordering ---------------- */

/** Whether `me` may edit the details, as opposed to only RSVP and comment. */
export const canEdit = (event: CalEvent, me: string) => !event.createdBy || !me || event.createdBy === me;

/** Earliest first; an all-day event leads its day. */
export const compareEvents = (a: CalEvent, b: CalEvent) =>
  a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title);

/** date -> that day's events, in order. The month grid reads straight from it. */
export function byDate(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  for (const event of [...events].sort(compareEvents)) {
    map.set(event.date, [...(map.get(event.date) ?? []), event]);
  }
  return map;
}

/** What is still to come, today included. */
export const upcoming = (events: CalEvent[], from = todayISO(), limit = 8) =>
  events
    .filter((e) => e.date >= from)
    .sort(compareEvents)
    .slice(0, limit);

/** How the invitation list stands: { yes, no, maybe, quiet }. */
export function rsvpCount(event: CalEvent) {
  const tally = { yes: 0, no: 0, maybe: 0, quiet: 0 };
  for (const person of event.people) {
    const answer = event.rsvp[person];
    if (answer === "yes" || answer === "no" || answer === "maybe") tally[answer]++;
    else tally.quiet++;
  }
  return tally;
}

/* ---------------- people ---------------- */

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Add one person, or several when the input is comma-separated. Matching is
 * case-insensitive so "Dad" and "dad" are one person, and the first spelling
 * wins. Returns the same array when there is nothing to add, so a caller can
 * use identity to decide whether to save.
 */
export function addPerson(people: string[], raw: string) {
  let next = people;
  for (const part of raw.split(",")) {
    const name = cleanPerson(part);
    if (!name || next.length >= MAX_PEOPLE) continue;
    if (next.some((p) => p.toLowerCase() === name.toLowerCase())) continue;
    next = [...next, name];
  }
  return next;
}

/** Dropping someone drops their answer with them. */
export const removePerson = (event: CalEvent, name: string): CalEvent => {
  const { [name]: _gone, ...rsvp } = event.rsvp;
  return { ...event, people: event.people.filter((p) => p !== name), rsvp };
};

/* ---------------- validation ---------------- */

/** A real calendar day, not just four digits and two dashes. */
export function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Date.parse returns NaN for 2026-02-30, and new Date(NaN) throws on format.
  const ms = utc(value);
  return Number.isFinite(ms) && iso(ms) === value;
}

/** 24-hour HH:MM, or empty for an all-day event. */
export const isTime = (value: string) => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const isRsvp = (value: unknown): value is Rsvp => value === "yes" || value === "no" || value === "maybe";

const isReservation = (v: unknown): v is Reservation => v === "" || v === "needed" || v === "booked";

/**
 * A URL the page is willing to put behind a link. http and https only: a
 * `javascript:` href in shared, editable data is how a calendar entry becomes
 * an attack on whoever opens it.
 */
export function isLink(value: string) {
  if (!value) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Nobody types the scheme. A bare "bookmyshow.com/..." gets https:// put in
 * front of it; anything that already names a scheme is left exactly as it is,
 * so `isLink` still gets to refuse the dangerous ones.
 */
export const cleanLink = (raw: string) => {
  const value = raw.trim();
  return !value || value.includes(":") ? value : `https://${value}`;
};

/** A blank event, so the defaults for every field live in exactly one place. */
export const blankEvent = (id: string, date: string, over: Partial<CalEvent> = {}): CalEvent => ({
  id,
  date,
  time: "",
  endTime: "",
  kind: "",
  title: "",
  venue: "",
  link: "",
  people: [],
  rsvp: {},
  reservation: "",
  reservedUnder: "",
  createdBy: "",
  notes: "",
  comments: [],
  ...over,
});

/**
 * One stored record widened back into a full event. The drivers read through
 * this, so a document written before a field existed — `who` was a single name
 * before there was an invitation list — still loads, and every event the app
 * handles has every key.
 */
export function fromStored(raw: Record<string, unknown>): CalEvent {
  const legacy = text(raw.who);
  const people = Array.isArray(raw.people) ? raw.people.map((p) => cleanPerson(String(p))).filter(Boolean) : [];
  const rsvp: Record<string, Rsvp> = {};
  for (const [name, answer] of Object.entries((raw.rsvp as Record<string, unknown>) ?? {})) {
    if (isRsvp(answer)) rsvp[name] = answer;
  }
  const comments = Array.isArray(raw.comments)
    ? (raw.comments as Record<string, unknown>[]).map((c) => ({
        id: text(c.id),
        by: text(c.by),
        at: text(c.at),
        text: text(c.text),
      }))
    : [];

  return blankEvent(text(raw.id), text(raw.date), {
    time: text(raw.time),
    endTime: text(raw.endTime),
    kind: text(raw.kind),
    title: text(raw.title),
    venue: text(raw.venue),
    link: cleanLink(text(raw.link)),
    people: people.length || !legacy ? people : [legacy],
    rsvp,
    reservation: isReservation(raw.reservation) ? raw.reservation : "",
    reservedUnder: text(raw.reservedUnder),
    createdBy: text(raw.createdBy),
    notes: text(raw.notes),
    comments: comments.filter((c) => c.id && c.text),
  });
}

/**
 * Validate and normalise the whole calendar. The only gate in front of the
 * database, the same way `normalizeSubscriptions` is for subscriptions.
 * Events come back sorted, so stored order is always calendar order.
 */
export function normalizeCalendar(input: unknown): { doc: CalendarDoc } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Expected { events: [...] }." };
  const raw = (input as { events?: unknown }).events;
  if (!Array.isArray(raw)) return { error: "Expected { events: [...] }." };
  if (raw.length > MAX_EVENTS) return { error: `No more than ${MAX_EVENTS} events.` };

  const events: CalEvent[] = [];
  const seen = new Set<string>();

  for (const [i, entry] of raw.entries()) {
    const at = `Event ${i + 1}`;
    if (!entry || typeof entry !== "object") return { error: `${at} is not an object.` };
    const event = fromStored(entry as Record<string, unknown>);
    const row = entry as Record<string, unknown>;

    if (!event.id) return { error: `${at} has no id.` };
    if (event.id.length > 60) return { error: `${at}: id is too long.` };
    if (seen.has(event.id)) return { error: `${at}: duplicate id "${event.id}".` };
    seen.add(event.id);

    // A title may be blank. The dialog saves on every keystroke, so refusing an
    // empty one would stop you clearing the field to retype it — the same rule,
    // for the same reason, as item names in normalizeInventory.
    if (event.title.length > 120) return { error: `${at}: title is too long (120 characters max).` };
    if (event.createdBy.length > 60) return { error: `${at}: the author's name is too long.` };

    if (!isDate(event.date)) return { error: `${at}: "${event.date}" is not a date (yyyy-mm-dd).` };

    if (!isTime(event.time)) return { error: `${at}: "${event.time}" is not a time (HH:MM, or empty for all day).` };
    if (!isTime(event.endTime)) return { error: `${at}: "${event.endTime}" is not a time (HH:MM).` };
    if (event.endTime && !event.time) return { error: `${at}: an end time needs a start time.` };
    if (event.endTime && event.endTime <= event.time) {
      // No overnight events: one event is one date, and 23:00–01:00 would
      // silently mean "minus 22 hours" everywhere a duration is worked out.
      return { error: `${at}: it has to end after it starts — split anything that runs past midnight.` };
    }

    if (event.kind.length > 40) return { error: `${at}: activity is too long (40 characters max).` };
    if (event.venue.length > 120) return { error: `${at}: venue is too long (120 characters max).` };
    if (!isLink(event.link)) return { error: `${at}: the link has to be a http:// or https:// address.` };
    if (event.link.length > 500) return { error: `${at}: the link is too long.` };

    if (Array.isArray(row.people) && row.people.length > MAX_PEOPLE) {
      return { error: `${at}: no more than ${MAX_PEOPLE} people.` };
    }
    // An answer from someone who is not on the list is dropped, not an error:
    // it is what removing a person leaves behind.
    const answers: Record<string, Rsvp> = {};
    for (const person of event.people) {
      const answer = event.rsvp[person];
      if (answer) answers[person] = answer;
    }
    event.rsvp = answers;

    if (row.reservation !== undefined && !isReservation(row.reservation)) {
      return { error: `${at}: unknown reservation status.` };
    }
    if (event.reservedUnder.length > 80) return { error: `${at}: the booking name is too long.` };
    if (event.reservation !== "booked") event.reservedUnder = "";

    if (event.notes.length > 500) return { error: `${at}: notes are too long (500 characters max).` };

    if (event.comments.length > MAX_COMMENTS) return { error: `${at}: no more than ${MAX_COMMENTS} comments.` };
    for (const comment of event.comments) {
      if (comment.text.length > 500) return { error: `${at}: a comment is too long (500 characters max).` };
      if (comment.by.length > 60) return { error: `${at}: a comment's name is too long.` };
    }

    events.push(event);
  }

  return { doc: { events: events.sort(compareEvents) } };
}
