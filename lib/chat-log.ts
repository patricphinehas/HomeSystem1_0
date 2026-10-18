/**
 * What was asked, kept a day at a time.
 *
 * One record per day rather than one per conversation: a household asks the
 * data a handful of questions on the days it asks anything at all, and "what
 * did I ask on Tuesday" is the question people actually have. A conversation
 * has no natural end here anyway — the chat window is one long thread until
 * you clear it.
 *
 * The log is written by the server at the end of a successful turn, so the
 * browser never posts it and a failed turn leaves nothing behind.
 *
 * ponytail: the whole day is read and rewritten on every append. A day is a
 * few dozen messages, so that is cheaper than it sounds and keeps one shape
 * in one place. If a day ever gets long enough to notice, push the append
 * into the driver ($push in Mongo, an insert in Postgres) and give messages
 * their own rows.
 */

export type LoggedMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  /** The tool that answered, when this is a tool result. */
  name?: string;
  /** The tools an assistant turn asked for, by name. Just enough to show it. */
  calls?: string[];
};

export type ChatDay = {
  /** yyyy-mm-dd, in the household's timezone. */
  date: string;
  messages: LoggedMessage[];
};

export type ChatLog = { days: ChatDay[] };

/** A day is trimmed to this, oldest first, so one busy day cannot grow forever. */
export const MAX_MESSAGES_PER_DAY = 400;
/** Tool output is already trimmed before the model sees it; this is the backstop. */
export const MAX_CONTENT = 8000;

const text = (v: unknown) => (typeof v === "string" ? v : "");

const isRole = (v: unknown): v is LoggedMessage["role"] => v === "user" || v === "assistant" || v === "tool";

/**
 * Narrow a live chat message down to what is worth keeping: the role, the
 * words, and which tools were called. Reasoning traces and tool-call ids are
 * dropped — they are large, provider-specific, and meaningless a day later.
 * Returns null for a message with nothing in it to read.
 */
export function toLogged(message: {
  role?: unknown;
  content?: unknown;
  name?: unknown;
  tool_calls?: { function?: { name?: string } }[];
}): LoggedMessage | null {
  if (!isRole(message.role)) return null;
  const calls = (message.tool_calls ?? []).map((c) => text(c.function?.name)).filter(Boolean);
  const content = text(message.content).slice(0, MAX_CONTENT);
  if (!content && !calls.length) return null;

  return {
    role: message.role,
    content,
    ...(message.name ? { name: text(message.name).slice(0, 60) } : {}),
    ...(calls.length ? { calls } : {}),
  };
}

/** Appends to a day, keeping only the most recent MAX_MESSAGES_PER_DAY. */
export const appendToDay = (day: ChatDay, messages: LoggedMessage[]): ChatDay => ({
  date: day.date,
  messages: [...day.messages, ...messages].slice(-MAX_MESSAGES_PER_DAY),
});

/** Newest day first, which is the order anyone wants to read them in. */
export const sortDays = (days: ChatDay[]) => [...days].sort((a, b) => b.date.localeCompare(a.date));

/** The first thing asked that day, for the list of days. */
export const openingLine = (day: ChatDay) =>
  day.messages.find((m) => m.role === "user")?.content.split("\n")[0].slice(0, 80) ?? "";

export function normalizeChatDay(input: unknown): { day: ChatDay } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Expected a chat day." };
  const raw = input as { date?: unknown; messages?: unknown };

  const date = text(raw.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: `"${date}" is not a date (yyyy-mm-dd).` };
  if (!Array.isArray(raw.messages)) return { error: "A chat day needs a list of messages." };

  const messages = raw.messages
    .map((m) => toLogged(m as Parameters<typeof toLogged>[0]))
    .filter((m): m is LoggedMessage => m !== null)
    .slice(-MAX_MESSAGES_PER_DAY);

  return { day: { date, messages } };
}
