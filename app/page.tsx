"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { compareEvents, rsvpCount, timeRange, todayISO, whenLabel, type CalEvent } from "@/lib/calendar";
import { isLow, lowStock, totals } from "@/lib/inventory";
import { useCalendar } from "./use-calendar";
import { useInventory } from "./use-inventory";
import { Notice, Skeleton } from "./ui";
import { PageGrid, PageHeader, Span } from "./page-frame";

const LABELS: Record<string, string> = {
  categories: "categories",
  items: "items tracked",
  low: "running low",
  out: "out of stock",
};

/** How many of the days ahead the overview lists before deferring to /calendar. */
const AHEAD = 6;

export default function Overview() {
  const { inv, error } = useInventory();
  const { doc, error: calendarError } = useCalendar();
  const low = inv ? lowStock(inv) : [];

  // Today is only known in the browser — working it out while rendering on the
  // server would bake the build date into the page and mismatch on hydration.
  const [today, setToday] = useState("");
  useEffect(() => setToday(todayISO()), []);

  const events = doc?.events ?? [];
  const todays = useMemo(
    () => (today ? events.filter((e) => e.date === today).sort(compareEvents) : []),
    [events, today],
  );
  // Tomorrow leads this list, which is the plan most of a day's questions are
  // about; the rest of the week follows it rather than getting its own section.
  const ahead = useMemo(
    () => (today ? events.filter((e) => e.date > today).sort(compareEvents).slice(0, AHEAD) : []),
    [events, today],
  );
  const plansReady = doc && today;

  return (
    <PageGrid>
      <PageHeader
        title="Overview"
        hint="What the house has planned, what it has, and what it is about to run out of."
      />

      {error && (
        <Span>
          <Notice>{error}</Notice>
        </Span>
      )}
      {calendarError && (
        <Span>
          <Notice>{calendarError}</Notice>
        </Span>
      )}

      {!plansReady && !calendarError && (
        <Span>
          <Skeleton rows={2} label="Loading the calendar" />
        </Span>
      )}

      {plansReady && (
        <>
          <section className="grid content-start gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Today</h2>
              <Link href="/calendar" className="text-xs text-accent hover:underline">
                Open calendar
              </Link>
            </div>
            {todays.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-3 py-6 text-center text-xs text-muted">
                Nothing planned for today.
              </p>
            ) : (
              <ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-border">
                {todays.map((event) => (
                  <PlanRow key={event.id} event={event} when={timeRange(event)} />
                ))}
              </ul>
            )}
          </section>

          <section className="grid content-start gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Coming up</h2>
              <span className="text-xs text-muted">Tomorrow onwards</span>
            </div>
            {ahead.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-3 py-6 text-center text-xs text-muted">
                Nothing on the calendar from tomorrow on.
              </p>
            ) : (
              <ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-border">
                {ahead.map((event) => (
                  <PlanRow
                    key={event.id}
                    event={event}
                    when={`${whenLabel(event.date, today)}${event.time ? ` ${event.time}` : ""}`}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {!inv && !error && (
        <Span>
          <Skeleton rows={2} label="Loading the inventory" />
        </Span>
      )}

      {inv && (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4 lg:col-span-full">
            {Object.entries(totals(inv)).map(([key, value]) => (
              <div key={key} className="bg-surface px-3 py-3">
                <dd className="font-mono text-xl tabular-nums">{value}</dd>
                <dt className="mt-1 text-xs text-muted capitalize">{LABELS[key]}</dt>
              </div>
            ))}
          </dl>

          <section className="grid content-start gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Buy next</h2>
              <Link href="/inventory" className="text-xs text-accent hover:underline">
                Open inventory
              </Link>
            </div>
            {low.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-3 py-6 text-center text-xs text-muted">
                Nothing is below its minimum.
              </p>
            ) : (
              <ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
                {low.slice(0, 8).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 bg-surface px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {item.name}
                      <span className="ml-2 text-xs text-muted">{item.category}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-warn">
                      {item.qty} / {item.min} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid content-start gap-2">
            <h2 className="text-sm font-medium">Categories</h2>
            {inv.categories.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-3 py-6 text-center text-xs text-muted">
                No categories yet. Add one in Inventory.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
                {inv.categories.map((category) => {
                  const runningLow = category.items.filter(isLow).length;
                  return (
                    <li key={category.id} className="bg-surface px-3 py-3">
                      <p className="truncate text-sm">{category.name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {category.items.length} items
                        {runningLow > 0 && <span className="text-warn"> · {runningLow} low</span>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </PageGrid>
  );
}

/**
 * One plan, read-only: what it is, when, and the detail that would make
 * somebody act today — where it is, who is in, and whether it still needs
 * booking. Opening one is the calendar's job, which the section links to.
 */
function PlanRow({ event, when }: { event: CalEvent; when: string }) {
  const going = rsvpCount(event);
  const who = going.yes ? `${going.yes}/${event.people.length} in` : `${event.people.length} invited`;
  const detail = [event.kind, event.venue, event.people.length ? who : ""].filter(Boolean).join(" · ");

  return (
    <li className="grid gap-0.5 bg-surface px-3 py-2">
      <span className="flex items-baseline justify-between gap-2">
        <span className={`min-w-0 truncate text-sm ${event.title ? "" : "text-muted italic"}`}>
          {event.title || "Untitled"}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{when}</span>
      </span>
      {(detail || event.reservation === "needed") && (
        <span className="flex min-w-0 items-baseline gap-2 text-[11px] text-muted">
          {detail && <span className="truncate">{detail}</span>}
          {event.reservation === "needed" && <span className="shrink-0 text-warn">needs booking</span>}
        </span>
      )}
    </li>
  );
}
