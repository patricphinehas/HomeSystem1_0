import { cleanTag } from "./inventory.ts";

export type Subscription = {
  id: string;
  name: string;
  type: string;
  tag: string;
  /** Who uses or pays for this subscription in the household. */
  holder: string;
  shareable: boolean;
  /** How many people can use it when shareable. */
  shareCount: number | null;
  /** What it costs each cycle, in the household's currency. */
  cost: number;
  /** How often that is charged. */
  cycle: Cycle;
};

/**
 * ponytail: a fixed set, not a number of days. "Every 3 months" is a quarter
 * and "every 2 years" does not exist in practice; a free-form interval would
 * buy nothing and cost a renewal-date calculator. Add one when something
 * actually bills on an odd period.
 */
export const CYCLES = ["monthly", "quarterly", "yearly", "weekly", "one-off"] as const;

export type Cycle = (typeof CYCLES)[number];

const isCycle = (v: unknown): v is Cycle => (CYCLES as readonly unknown[]).includes(v);

/** Months per cycle, for putting everything on one scale. One-off is not recurring. */
const PER_YEAR: Record<Cycle, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
  "one-off": 0,
};

/** What this subscription costs in a year. A one-off charge costs nothing yearly. */
export const yearlyCost = (sub: Subscription) => round(sub.cost * PER_YEAR[sub.cycle]);

/** The same figure per month, which is how most of them are quoted. */
export const monthlyCost = (sub: Subscription) => round(yearlyCost(sub) / 12);

const round = (n: number) => Math.round(n * 100) / 100;

/** What the household pays for all of them, recurring only. */
export const subscriptionTotals = (subs: Subscription[]) => {
  const recurring = subs.filter((s) => s.cycle !== "one-off");
  return {
    monthly: round(recurring.reduce((t, s) => t + monthlyCost(s), 0)),
    yearly: round(recurring.reduce((t, s) => t + yearlyCost(s), 0)),
    oneOff: round(subs.filter((s) => s.cycle === "one-off").reduce((t, s) => t + s.cost, 0)),
  };
};

export type SubscriptionsDoc = { subscriptions: Subscription[] };

export const MAX_SUBSCRIPTIONS = 200;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function normalizeSubscriptions(input: unknown): { doc: SubscriptionsDoc } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Expected { subscriptions: [...] }." };
  const raw = (input as { subscriptions?: unknown }).subscriptions;
  if (!Array.isArray(raw)) return { error: "Expected { subscriptions: [...] }." };
  if (raw.length > MAX_SUBSCRIPTIONS) return { error: `No more than ${MAX_SUBSCRIPTIONS} subscriptions.` };

  const subscriptions: Subscription[] = [];
  const seen = new Set<string>();

  for (const [i, entry] of raw.entries()) {
    const at = `Subscription ${i + 1}`;
    if (!entry || typeof entry !== "object") return { error: `${at} is not an object.` };
    const row = entry as Partial<Subscription>;

    const id = text(row.id);
    if (!id) return { error: `${at} has no id.` };
    if (id.length > 60) return { error: `${at}: id is too long.` };
    if (seen.has(id)) return { error: `${at}: duplicate id "${id}".` };
    seen.add(id);

    const name = text(row.name);
    if (!name) return { error: `${at} needs a name.` };
    if (name.length > 120) return { error: `${at}: name is too long.` };

    const type = text(row.type);
    if (type.length > 60) return { error: `${at}: type is too long.` };

    const tag = cleanTag(text(row.tag) || "");
    const holder = text(row.holder);
    if (holder.length > 80) return { error: `${at}: holder is too long.` };

    const shareable = row.shareable === true;
    let shareCount: number | null = null;
    if (shareable) {
      const n = Number(row.shareCount);
      if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
        return { error: `${at}: share count must be a whole number of at least 1 when shareable.` };
      }
      shareCount = n;
    }

    const cost = row.cost === undefined || row.cost === null || (row.cost as unknown) === "" ? 0 : Number(row.cost);
    if (!Number.isFinite(cost) || cost < 0) return { error: `${at}: cost must be zero or more.` };

    // Anything stored before cycles existed is a monthly subscription.
    const cycle = (row.cycle as unknown) === undefined || (row.cycle as unknown) === "" ? "monthly" : row.cycle;
    if (!isCycle(cycle)) return { error: `${at}: cycle must be one of: ${CYCLES.join(", ")}.` };

    subscriptions.push({ id, name, type, tag, holder, shareable, shareCount, cost: round(cost), cycle });
  }

  return { doc: { subscriptions } };
}
