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

    subscriptions.push({ id, name, type, tag, holder, shareable, shareCount });
  }

  return { doc: { subscriptions } };
}
