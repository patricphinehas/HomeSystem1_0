"use client";

import { useEffect, useMemo, useState } from "react";
import { CaretLeft, CaretRight, Link as LinkIcon, MapPin, Plus, Users, X } from "@phosphor-icons/react";
import { newId } from "@/lib/inventory";
import {
  ACTIVITIES,
  DURATIONS,
  blankEvent,
  byDate,
  canEdit,
  durationLabel,
  endAfter,
  monthGrid,
  monthOf,
  normalizeCalendar,
  rsvpCount,
  shiftMonth,
  timeRange,
  todayISO,
  upcoming,
  whenLabel,
  type CalEvent,
} from "@/lib/calendar";
import { useCalendar } from "../use-calendar";
import { useHousehold } from "../use-household";
import { Card, Notice, Skeleton } from "../ui";
import { PageGrid, PageHeader, Span } from "../page-frame";
import { EventDialog } from "./event-dialog";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "October 2026". UTC because the grid's dates are plain days, not instants. */
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

export default function CalendarPage() {
  const { doc, error, save } = useCalendar();
  const { name: me, people } = useHousehold();
  const [localError, setLocalError] = useState<string | null>(null);

  // Today is only known in the browser: deciding it while rendering on the
  // server would bake the build date into the page and mismatch on hydration.
  const [today, setToday] = useState("");
  const [month, setMonth] = useState("");
  const [selected, setSelected] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const now = todayISO();
    setToday(now);
    setMonth(monthOf(now));
    setSelected(now);
  }, []);

  const events = doc?.events ?? [];
  const days = useMemo(() => byDate(events), [events]);
  const soon = useMemo(() => (today ? upcoming(events, today, 6) : []), [events, today]);
  const open = events.find((e) => e.id === openId) ?? null;

  /** Every write goes through the same validator the API uses. */
  const commit = (next: CalEvent[]) => {
    const check = normalizeCalendar({ events: next });
    if ("error" in check) {
      setLocalError(check.error);
      return;
    }
    setLocalError(null);
    save(check.doc);
  };

  const patch = (id: string, next: CalEvent | null) =>
    commit(next ? events.map((e) => (e.id === id ? next : e)) : events.filter((e) => e.id !== id));

  /** Add, then open it — the rest of the detail is filled in the dialog. */
  const add = (draft: Pick<CalEvent, "kind" | "title" | "time" | "endTime">) => {
    const event = blankEvent(newId(), selected, { ...draft, createdBy: me });
    commit([...events, event]);
    setAdding(false);
    setOpenId(event.id);
  };

  const pick = (date: string) => {
    setSelected(date);
    setAdding(false);
    if (monthOf(date) !== month) setMonth(monthOf(date));
  };

  const show = (event: CalEvent) => {
    pick(event.date);
    setOpenId(event.id);
  };

  const ready = doc && today;

  return (
    <PageGrid>
      <PageHeader
        title="Calendar"
        hint="What the house has planned. Pick a day to add to it, then open an entry for the detail."
      />

      {(error || localError) && (
        <Span>
          <Notice>{localError ?? error}</Notice>
        </Span>
      )}
      {!ready && !error && (
        <Span>
          <Skeleton rows={3} />
        </Span>
      )}

      {ready && (
        <>
          <Span>
            <Card
              dense
              title={monthLabel(month)}
              subtitle={`${events.filter((e) => monthOf(e.date) === month).length} this month`}
              aside={
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() => setMonth(shiftMonth(month, -1))}
                    className="grid size-8 place-items-center rounded-xl border border-border text-muted hover:text-fg"
                  >
                    <CaretLeft size={14} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMonth(monthOf(today));
                      setSelected(today);
                    }}
                    className="rounded-xl border border-border px-2.5 py-1.5 text-xs text-muted hover:text-fg"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() => setMonth(shiftMonth(month, 1))}
                    className="grid size-8 place-items-center rounded-xl border border-border text-muted hover:text-fg"
                  >
                    <CaretRight size={14} weight="bold" />
                  </button>
                </div>
              }
            >
              <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="bg-surface px-2 py-1.5 text-center text-[11px] text-muted">
                    {day}
                  </div>
                ))}
                {monthGrid(month).map((cell) => (
                  <DayCell
                    key={cell.date}
                    date={cell.date}
                    inMonth={cell.inMonth}
                    today={cell.date === today}
                    selected={cell.date === selected}
                    events={days.get(cell.date) ?? []}
                    onSelect={() => pick(cell.date)}
                    onOpen={show}
                  />
                ))}
              </div>
            </Card>
          </Span>

          <Card
            dense
            title={dayLabel(selected)}
            subtitle={
              (days.get(selected)?.length ?? 0) === 0
                ? "Nothing planned yet"
                : `${days.get(selected)!.length} planned — open one for the detail`
            }
            aside={
              <button
                type="button"
                onClick={() => setAdding((open) => !open)}
                aria-expanded={adding}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium ${
                  adding ? "border border-border text-muted hover:text-fg" : "bg-accent text-surface"
                }`}
              >
                {adding ? <X size={13} weight="bold" /> : <Plus size={13} weight="bold" />}
                {adding ? "Cancel" : "Add"}
              </button>
            }
          >
            <div className="grid gap-2">
              {(days.get(selected) ?? []).length === 0 && !adding && (
                <p className="rounded-xl border border-border px-3 py-6 text-center text-xs text-muted">
                  Nothing on this day. Press Add to put something in.
                </p>
              )}
              {(days.get(selected) ?? []).map((event) => (
                <EventRow key={event.id} event={event} onOpen={() => setOpenId(event.id)} />
              ))}
              {adding && <AddEvent onAdd={add} />}
            </div>
          </Card>

          <Card dense title="Coming up" subtitle={soon.length ? "The next few things" : "Nothing ahead"}>
            {soon.length === 0 ? (
              <p className="rounded-xl border border-border px-3 py-6 text-center text-xs text-muted">
                The calendar is empty from today on.
              </p>
            ) : (
              <ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-border">
                {soon.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => show(event)}
                      className="grid w-full gap-0.5 bg-surface px-3 py-2 text-left hover:bg-bg"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-sm">{event.title || "Untitled"}</span>
                        <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                          {whenLabel(event.date, today)}
                          {event.time && ` ${event.time}`}
                        </span>
                      </span>
                      <Summary event={event} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {open && (
        <EventDialog
          key={open.id}
          event={open}
          people={people}
          me={me}
          onChange={(next) => patch(open.id, next)}
          onDelete={() => patch(open.id, null)}
          editable={canEdit(open, me)}
          onClose={() => setOpenId(null)}
        />
      )}
    </PageGrid>
  );
}

/** The one-line under-title: activity, where, who, and whether it is booked. */
function Summary({ event }: { event: CalEvent }) {
  const going = rsvpCount(event);
  const bits: React.ReactNode[] = [];

  if (event.kind) bits.push(<span key="kind">{event.kind}</span>);
  if (event.venue)
    bits.push(
      <span key="venue" className="inline-flex items-center gap-1">
        <MapPin size={11} />
        {event.venue}
      </span>,
    );
  if (event.people.length)
    bits.push(
      <span key="people" className="inline-flex items-center gap-1">
        <Users size={11} />
        {going.yes ? `${going.yes}/${event.people.length} in` : `${event.people.length} invited`}
      </span>,
    );
  if (event.reservation)
    bits.push(
      <span key="booking" className={event.reservation === "booked" ? "text-accent" : "text-warn"}>
        {event.reservation === "booked"
          ? `reserved${event.reservedUnder ? ` · ${event.reservedUnder}` : ""}`
          : "needs booking"}
      </span>,
    );
  if (event.link)
    bits.push(
      <span key="link" className="inline-flex items-center gap-1">
        <LinkIcon size={11} />
        link
      </span>,
    );
  if (event.comments.length) bits.push(<span key="comments">{event.comments.length} comments</span>);

  if (!bits.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
      {bits.map((bit, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {i > 0 && <span aria-hidden>·</span>}
          {bit}
        </span>
      ))}
    </span>
  );
}

function EventRow({ event, onOpen }: { event: CalEvent; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid gap-0.5 rounded-xl border border-border px-3 py-2 text-left hover:border-accent"
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={`min-w-0 truncate text-sm ${event.title ? "" : "text-muted italic"}`}>
          {event.title || "Untitled"}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted tabular-nums">{timeRange(event)}</span>
      </span>
      <Summary event={event} />
    </button>
  );
}

/**
 * One day. The cell picks the day, which lists it in the panel beside the grid;
 * an entry's own chip opens it. Buttons cannot nest, so the day's own hit area
 * is a button stretched behind the chips rather than wrapped around them.
 */
function DayCell({
  date,
  inMonth,
  today,
  selected,
  events,
  onSelect,
  onOpen,
}: {
  date: string;
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  events: CalEvent[];
  onSelect: () => void;
  onOpen: (event: CalEvent) => void;
}) {
  return (
    <div
      className={`relative grid min-h-20 content-start gap-1 px-1.5 py-1.5 ${
        selected ? "bg-accent-soft" : "bg-surface"
      } ${inMonth ? "" : "opacity-40"}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${dayLabel(date)}, ${events.length} planned`}
        className="absolute inset-0 transition hover:bg-fg/5"
      />
      <span
        className={`pointer-events-none relative font-mono text-xs tabular-nums ${
          today ? "w-fit rounded-md bg-accent px-1 text-surface" : selected ? "text-accent" : "text-muted"
        }`}
      >
        {Number(date.slice(8))}
      </span>
      {events.slice(0, 2).map((event) => (
        <button
          key={event.id}
          type="button"
          onClick={() => onOpen(event)}
          title={event.title}
          className="relative truncate rounded-md bg-bg px-1 py-0.5 text-left text-[11px] hover:text-accent"
        >
          {event.time && <span className="font-mono text-muted">{event.time} </span>}
          {event.title || "Untitled"}
        </button>
      ))}
      {events.length > 2 && (
        <button
          type="button"
          onClick={onSelect}
          className="relative px-1 text-left text-[11px] text-muted hover:text-accent"
        >
          +{events.length - 2} more
        </button>
      )}
    </div>
  );
}

/**
 * The quick add: what it is, what to call it, when and for how long. Everything
 * else — where, who, the booking, the link — is filled in the dialog this opens.
 */
function AddEvent({ onAdd }: { onAdd: (draft: Pick<CalEvent, "kind" | "title" | "time" | "endTime">) => void }) {
  const [kind, setKind] = useState("");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [mins, setMins] = useState(0);

  return (
    <form
      className="grid gap-2 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onAdd({ kind, title: title.trim(), time, endTime: time && mins ? endAfter(time, mins) : "" });
        setKind("");
        setTitle("");
        setTime("");
        setMins(0);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          list="calendar-activities-add"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          placeholder="Activity"
          aria-label="What the day is being blocked for"
          className="w-32 rounded-xl border border-border bg-bg px-3 py-2 text-sm placeholder:text-muted"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Movie night, dentist, visitors..."
          aria-label="What to add"
          className="min-w-40 flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm placeholder:text-muted"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Start time, or leave empty for all day"
          className="w-28 rounded-xl border border-border bg-bg px-2 py-2 font-mono text-sm tabular-nums"
        />
        <select
          value={mins}
          disabled={!time}
          onChange={(e) => setMins(Number(e.target.value))}
          aria-label="How long it runs"
          className="w-28 rounded-xl border border-border bg-bg px-2 py-2 text-sm disabled:opacity-40"
        >
          <option value={0}>No end</option>
          {DURATIONS.map((option) => (
            <option key={option} value={option}>
              {durationLabel(option)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!title.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          <Plus size={14} weight="bold" />
          Add
        </button>
      </div>
      <datalist id="calendar-activities-add">
        {ACTIVITIES.map((activity) => (
          <option key={activity} value={activity} />
        ))}
      </datalist>
    </form>
  );
}
