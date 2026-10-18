"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowSquareOut, Check, Plus, Trash, X } from "@phosphor-icons/react";
import { newId } from "@/lib/inventory";
import {
  ACTIVITIES,
  DURATIONS,
  RESERVATIONS,
  RSVPS,
  addPerson,
  durationLabel,
  durationMinutes,
  timeRange,
  endAfter,
  isLink,
  removePerson,
  rsvpCount,
  type CalEvent,
  type Rsvp,
} from "@/lib/calendar";

/**
 * One entry, in full: what it is, when, where, who is coming, whether it is
 * booked, and the conversation about it. A native <dialog>, like the item
 * history — Escape, focus trapping and the backdrop come free.
 *
 * Every change is handed straight up and saved; there is no Save button and no
 * draft copy, because the day panel behind it is showing the same event and
 * the two would drift apart.
 *
 * `editable` is whether this reader added the entry. When they did not, the
 * details are shown as text rather than as fields, but the RSVP buttons and the
 * comment box stay live for everyone — those are the parts a guest is for. It
 * is a courtesy and not a permission: there is no sign-in, the name comes from
 * settings, and `PUT /api/calendar` will take an edit from anybody.
 */
export function EventDialog({
  event,
  people,
  me,
  editable,
  onChange,
  onDelete,
  onClose,
}: {
  event: CalEvent;
  /** Names from the settings page, offered before anything is typed. */
  people: string[];
  /** Whoever is using this copy, from USER_NAME. Signs comments and RSVPs. */
  me: string;
  /** Whether this reader added it. False hides the fields, not the entry. */
  editable: boolean;
  onChange: (next: CalEvent) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    // showModal() throws if the dialog is already open, and Strict Mode runs a
    // mount effect twice in development.
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const [confirming, setConfirming] = useState(false);
  const movie = event.kind.toLowerCase() === "movie";
  const mins = durationMinutes(event.time, event.endTime);
  const set = (over: Partial<CalEvent>) => onChange({ ...event, ...over });

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={event.title || "Calendar entry"}
      className="m-auto max-h-[85vh] w-[min(44rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-surface p-0 text-fg backdrop:bg-black/40"
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-4">
        <div className="min-w-0">
          {editable ? (
            <input
              value={event.title}
              onChange={(e) => set({ title: e.target.value })}
              aria-label="What it is"
              placeholder="Untitled"
              className="w-full bg-transparent text-lg font-semibold tracking-tight outline-none placeholder:text-muted"
            />
          ) : (
            <h2 className="truncate text-lg font-semibold tracking-tight">{event.title || "Untitled"}</h2>
          )}
          <p className="mt-0.5 text-xs text-muted">
            {event.date}
            {event.time && ` · ${timeRange(event)}`}
            {mins !== null && mins > 0 && ` · ${durationLabel(mins)}`}
            {event.kind && ` · ${event.kind}`}
            {event.createdBy && ` · added by ${event.createdBy}`}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => ref.current?.close()}
          className="grid size-8 shrink-0 place-items-center rounded-xl text-muted hover:bg-bg hover:text-fg"
        >
          <X size={16} />
        </button>
      </header>

      <div className="grid gap-5 px-5 py-5">
        {!editable && (
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent">
            {event.createdBy} added this, so the details are theirs to change. You can still answer and comment.
          </p>
        )}

        {editable ? (
          <>
            <Group title="What and when">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Activity">
                  <input
                    list="calendar-activities"
                    value={event.kind}
                    onChange={(e) => set({ kind: e.target.value })}
                    placeholder="movie, dinner, trip..."
                    className={INPUT}
                  />
                </Field>
                <Field label="Date">
                  <input
                    type="date"
                    value={event.date}
                    onChange={(e) => e.target.value && set({ date: e.target.value })}
                    className={`${INPUT} font-mono tabular-nums`}
                  />
                </Field>
                <Field label="Starts" hint="Leave empty for an all-day entry">
                  <input
                    type="time"
                    value={event.time}
                    // Clearing the start clears the end: an end alone means nothing.
                    onChange={(e) => set({ time: e.target.value, ...(e.target.value ? {} : { endTime: "" }) })}
                    className={`${INPUT} font-mono tabular-nums`}
                  />
                </Field>
                <Field label="Ends" hint={mins !== null && mins > 0 ? durationLabel(mins) : "Estimate is fine"}>
                  <input
                    type="time"
                    value={event.endTime}
                    disabled={!event.time}
                    onChange={(e) => set({ endTime: e.target.value })}
                    className={`${INPUT} font-mono tabular-nums disabled:opacity-40`}
                  />
                </Field>
              </div>
              {event.time && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted">For</span>
                  {DURATIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => set({ endTime: endAfter(event.time, option) })}
                      className={`rounded-lg border px-2 py-1 text-xs ${
                        mins === option ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-fg"
                      }`}
                    >
                      {durationLabel(option)}
                    </button>
                  ))}
                </div>
              )}
            </Group>

            <Group title={movie ? "Theatre and tickets" : "Where"}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={movie ? "Theatre" : "Venue"}>
                  <input
                    value={event.venue}
                    onChange={(e) => set({ venue: e.target.value })}
                    placeholder={movie ? "Which cinema" : "Where it is"}
                    className={INPUT}
                  />
                </Field>
                <Field label={movie ? "Ticket link" : "Link"} hint={event.link && !isLink(event.link) ? "Not a web address" : undefined}>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={event.link}
                      onChange={(e) => set({ link: e.target.value })}
                      placeholder={movie ? "Booking page" : "Anything worth keeping"}
                      className={`${INPUT} min-w-0 flex-1`}
                    />
                    {isLink(event.link) && event.link && (
                      <a
                        href={event.link}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label="Open the link in a new tab"
                        className="grid size-9 shrink-0 place-items-center rounded-xl border border-border text-muted hover:text-accent"
                      >
                        <ArrowSquareOut size={15} />
                      </a>
                    )}
                  </div>
                </Field>
              </div>
            </Group>

            <Group title="Booking">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Status">
                  <select
                    value={event.reservation}
                    onChange={(e) => set({ reservation: e.target.value as CalEvent["reservation"] })}
                    className={INPUT}
                  >
                    {RESERVATIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {event.reservation === "booked" && (
                  <Field label="Reserved under">
                    <input
                      list="calendar-people"
                      value={event.reservedUnder}
                      onChange={(e) => set({ reservedUnder: e.target.value })}
                      placeholder="Whose name it is in"
                      className={INPUT}
                    />
                  </Field>
                )}
              </div>
            </Group>

            <Group title="Notes">
              <textarea
                value={event.notes}
                onChange={(e) => set({ notes: e.target.value })}
                rows={2}
                placeholder="Anything else worth knowing"
                className={`${INPUT} resize-y`}
              />
            </Group>
          </>
        ) : (
          <Details event={event} />
        )}

        <Group title="Who is coming">
          <Invitations event={event} people={people} editable={editable} onChange={onChange} />
        </Group>

        <Group title="Comments">
          <Comments event={event} me={me} onChange={onChange} />
        </Group>

        <div className={`flex justify-end border-t border-border pt-4 ${editable ? "" : "hidden"}`}>
          {confirming ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">Delete “{event.title || "this entry"}”?</span>
              <button
                type="button"
                onClick={() => {
                  onDelete();
                  ref.current?.close();
                }}
                className="rounded-xl bg-warn px-3 py-1.5 text-xs font-medium text-surface"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted hover:text-fg"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs text-muted hover:text-warn"
            >
              <Trash size={14} />
              Delete
            </button>
          )}
        </div>
      </div>

      <datalist id="calendar-activities">
        {ACTIVITIES.map((activity) => (
          <option key={activity} value={activity} />
        ))}
      </datalist>
      <datalist id="calendar-people">
        {people.map((person) => (
          <option key={person} value={person} />
        ))}
      </datalist>
    </dialog>
  );
}

const INPUT = "w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm placeholder:text-muted";

/** The same detail, for somebody who did not add it: read it, do not edit it. */
function Details({ event }: { event: CalEvent }) {
  const booking = RESERVATIONS.find((r) => r.value === event.reservation);
  const rows: [string, React.ReactNode][] = [
    ["When", timeRange(event)],
    [event.kind.toLowerCase() === "movie" ? "Theatre" : "Venue", event.venue],
    [
      event.kind.toLowerCase() === "movie" ? "Tickets" : "Link",
      event.link && isLink(event.link) ? (
        <a
          href={event.link}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-accent hover:underline"
        >
          {event.link}
          <ArrowSquareOut size={12} />
        </a>
      ) : (
        event.link
      ),
    ],
    ["Booking", event.reservation ? `${booking?.label}${event.reservedUnder ? ` · ${event.reservedUnder}` : ""}` : ""],
    ["Notes", event.notes],
  ];

  return (
    <dl className="grid gap-2 text-sm">
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="grid grid-cols-[6rem_1fr] gap-2">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted">
        {label}
        {hint && <span className="ml-1.5 opacity-70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** The invitation list: who is in, and what each of them has said. */
function Invitations({
  event,
  people,
  editable,
  onChange,
}: {
  event: CalEvent;
  people: string[];
  /** Only the author changes the guest list; anyone may answer for a name. */
  editable: boolean;
  onChange: (next: CalEvent) => void;
}) {
  const [draft, setDraft] = useState("");
  const uninvited = people.filter((p) => !event.people.some((q) => q.toLowerCase() === p.toLowerCase()));

  const invite = (raw: string) => {
    const next = addPerson(event.people, raw);
    if (next !== event.people) onChange({ ...event, people: next });
    setDraft("");
  };

  const answer = (person: string, value: Rsvp) => {
    // Clicking the answer someone already gave takes it back to no answer.
    const { [person]: current, ...rest } = event.rsvp;
    onChange({ ...event, rsvp: current === value ? rest : { ...rest, [person]: value } });
  };

  const tally = rsvpCount(event);
  const said = [
    tally.yes && `${tally.yes} in`,
    tally.maybe && `${tally.maybe} maybe`,
    tally.no && `${tally.no} out`,
    tally.quiet && `${tally.quiet} yet to answer`,
  ].filter(Boolean);

  return (
    <div className="grid gap-2">
      {event.people.length === 0 ? (
        <p className="text-xs text-muted">Nobody invited yet.</p>
      ) : (
        <p className="text-xs text-muted">{said.join(" · ")}</p>
      )}

      {event.people.map((person) => (
        <div key={person} className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-sm">{person}</span>
          <div className="flex items-center gap-1">
            {RSVPS.map((option) => {
              const chosen = event.rsvp[person] === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => answer(person, option.value)}
                  className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                    chosen ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-fg"
                  }`}
                >
                  {chosen && <Check size={11} weight="bold" />}
                  {option.label}
                </button>
              );
            })}
          </div>
          {editable && (
            <button
              type="button"
              aria-label={`Remove ${person}`}
              onClick={() => onChange(removePerson(event, person))}
              className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:text-warn"
            >
              <X size={13} />
            </button>
          )}
        </div>
      ))}

      {editable && uninvited.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Add</span>
          {uninvited.map((person) => (
            <button
              key={person}
              type="button"
              onClick={() => invite(person)}
              className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-accent"
            >
              + {person}
            </button>
          ))}
        </div>
      )}

      <form
        className={`items-center gap-2 ${editable ? "flex" : "hidden"}`}
        onSubmit={(e) => {
          e.preventDefault();
          invite(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Someone else — comma-separated for several"
          aria-label="Invite someone not on the list"
          className={`${INPUT} min-w-0 flex-1`}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Invite"
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-border text-muted disabled:opacity-40"
        >
          <Plus size={14} weight="bold" />
        </button>
      </form>
    </div>
  );
}

/** The conversation. Each comment is signed with the settings name. */
function Comments({ event, me, onChange }: { event: CalEvent; me: string; onChange: (next: CalEvent) => void }) {
  const [draft, setDraft] = useState("");

  const post = () => {
    const text = draft.trim();
    if (!text) return;
    const comment = { id: newId(), by: me || "Someone", at: new Date().toISOString(), text };
    onChange({ ...event, comments: [...event.comments, comment] });
    setDraft("");
  };

  return (
    <div className="grid gap-2">
      {event.comments.length === 0 && <p className="text-xs text-muted">No comments yet.</p>}

      {event.comments.map((comment) => (
        <div key={comment.id} className="grid gap-0.5 rounded-xl border border-border px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium">{comment.by}</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-muted tabular-nums">{stamp(comment.at)}</span>
              <button
                type="button"
                aria-label={`Delete ${comment.by}'s comment`}
                onClick={() => onChange({ ...event, comments: event.comments.filter((c) => c.id !== comment.id) })}
                className="text-muted hover:text-warn"
              >
                <X size={12} />
              </button>
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{comment.text}</p>
        </div>
      ))}

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          post();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={me ? `Comment as ${me}` : "Add a comment"}
          aria-label="Add a comment"
          className={`${INPUT} min-w-0 flex-1`}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          Post
        </button>
      </form>
    </div>
  );
}

/** "19 Oct 14:05", or nothing at all if the stamp is missing or unreadable. */
function stamp(at: string) {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
