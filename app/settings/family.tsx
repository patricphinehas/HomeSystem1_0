"use client";

import { useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { newId } from "@/lib/inventory";
import { ROLES, normalizeFamily, type Person } from "@/lib/family";
import { useFamily } from "../use-family";
import { Notice, Skeleton } from "../ui";

/**
 * Who lives here. Its own collection and its own route, so unlike the rest of
 * this page it saves as you type rather than waiting for "Save to .env" —
 * nothing here needs a restart and nothing here is a secret.
 *
 * The calendar invites these people by name, which is why a duplicate name is
 * refused: two rows with one name would be one person to every RSVP.
 */
export function FamilyTab({ me }: { me: string }) {
  const { doc, error, save } = useFamily();
  const [localError, setLocalError] = useState<string | null>(null);

  const people = doc?.people ?? [];

  const commit = (next: Person[]) => {
    const check = normalizeFamily({ people: next });
    if ("error" in check) {
      setLocalError(check.error);
      return;
    }
    setLocalError(null);
    save(check.doc);
  };

  const patch = (id: string, next: Person | null) =>
    commit(next ? people.map((p) => (p.id === id ? next : p)) : people.filter((p) => p.id !== id));

  return (
    <div className="grid gap-3">
      {(error || localError) && <Notice>{localError ?? error}</Notice>}
      {!doc && !error && <Skeleton rows={2} />}

      {doc && (
        <>
          {people.length === 0 && (
            <p className="rounded-xl border border-border px-3 py-6 text-center text-xs text-muted">
              Nobody here yet. Add the people at home and the calendar will offer them when you plan something.
            </p>
          )}

          {people.map((person) => (
            <div key={person.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2">
              <input
                value={person.name}
                onChange={(e) => patch(person.id, { ...person, name: e.target.value })}
                placeholder="Name"
                aria-label="Name"
                className="min-w-32 flex-1 rounded-lg border border-border bg-bg px-2 py-1.5 text-sm placeholder:text-muted"
              />
              <input
                list="family-roles"
                value={person.role}
                onChange={(e) => patch(person.id, { ...person, role: e.target.value })}
                placeholder="Role"
                aria-label={`${person.name || "This person"}'s role`}
                className="w-36 rounded-lg border border-border bg-bg px-2 py-1.5 text-sm placeholder:text-muted"
              />
              {me && person.name === me && (
                <span className="rounded-lg bg-accent-soft px-2 py-1 text-[11px] text-accent">you</span>
              )}
              <button
                type="button"
                aria-label={`Remove ${person.name || "this person"}`}
                onClick={() => patch(person.id, null)}
                className="grid size-8 shrink-0 place-items-center rounded-xl text-muted hover:text-warn"
              >
                <Trash size={15} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => commit([...people, { id: newId(), name: "", role: "" }])}
            className="flex w-fit items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-muted hover:text-accent"
          >
            <Plus size={14} weight="bold" />
            Add someone
          </button>

          <p className="text-xs text-muted">
            Saved as you type, in the <code className="font-mono">family</code> collection. The calendar offers these
            names when you invite people to something; any other name can still be typed in there.
            {me ? "" : " Set your name on the You tab and whoever that is will be marked here."}
          </p>

          <datalist id="family-roles">
            {ROLES.map((role) => (
              <option key={role} value={role} />
            ))}
          </datalist>
        </>
      )}
    </div>
  );
}
