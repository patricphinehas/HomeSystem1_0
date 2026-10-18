/**
 * Who lives here. A real collection rather than a line in `.env`, because the
 * calendar points at these people by name and a household is data, not
 * configuration.
 *
 * ponytail: a name and a role, and nothing else. No contact details, no
 * birthdays, no avatar — nothing in the app reads them yet, and a field that
 * nothing reads is a field that goes stale. The obvious next one is a colour
 * for the calendar chips; add it when the grid actually uses it.
 *
 * There is still no sign-in, so a person here is a label the household agrees
 * on, not an account. `USER_NAME` in settings says which of them is using this
 * copy, and when authentication lands the two become one record.
 */

export type Person = {
  id: string;
  name: string;
  /** Parent, child, housemate, guest... free text, used to group the list. */
  role: string;
};

export type FamilyDoc = { people: Person[] };

/** Suggestions, not a closed set — the field takes anything. */
export const ROLES = ["parent", "child", "partner", "sibling", "grandparent", "housemate", "guest"] as const;

export const MAX_FAMILY = 30;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A name is collapsed, trimmed and length-capped, and nothing more. */
export const cleanPerson = (raw: string) => raw.replace(/\s+/g, " ").trim().slice(0, 60);

/** Just the names, for the calendar's invite buttons. */
export const familyNames = (doc: FamilyDoc | null) => (doc?.people ?? []).map((p) => p.name).filter(Boolean);

/**
 * Validate and normalise the whole household. The only gate in front of the
 * database, the same way `normalizeSubscriptions` is for subscriptions.
 *
 * Two people may not share a name: the calendar keys invitations and RSVPs by
 * name, so a duplicate would make two people one.
 */
export function normalizeFamily(input: unknown): { doc: FamilyDoc } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Expected { people: [...] }." };
  const raw = (input as { people?: unknown }).people;
  if (!Array.isArray(raw)) return { error: "Expected { people: [...] }." };
  if (raw.length > MAX_FAMILY) return { error: `No more than ${MAX_FAMILY} people.` };

  const people: Person[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const [i, entry] of raw.entries()) {
    const at = `Person ${i + 1}`;
    if (!entry || typeof entry !== "object") return { error: `${at} is not an object.` };
    const row = entry as Partial<Person>;

    const id = text(row.id);
    if (!id) return { error: `${at} has no id.` };
    if (id.length > 60) return { error: `${at}: id is too long.` };
    if (ids.has(id)) return { error: `${at}: duplicate id "${id}".` };
    ids.add(id);

    // A name may be blank while it is being typed — the row saves on every
    // keystroke — but two people who do have names cannot share one.
    const name = cleanPerson(text(row.name));
    const key = name.toLowerCase();
    if (name && names.has(key)) return { error: `There are two people called "${name}".` };
    if (name) names.add(key);

    const role = text(row.role);
    if (role.length > 40) return { error: `${at}: role is too long (40 characters max).` };

    people.push({ id, name, role });
  }

  return { doc: { people } };
}
