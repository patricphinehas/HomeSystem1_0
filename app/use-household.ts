"use client";

import { useEffect, useState } from "react";
import { familyNames, type FamilyDoc } from "@/lib/family";

/**
 * Who this copy belongs to: your name and the household's from the `.env`
 * settings, and the people in it from the `family` collection. The sidebar
 * needs the first two and the calendar needs all three, so the fetches live
 * here rather than twice.
 *
 * ponytail: every page that uses this fetches both routes again. They are
 * cheap local calls and the answer is a few strings; cache it in a context if
 * a page ever needs it in more than one place at once.
 */
export function useHousehold() {
  const [name, setName] = useState("");
  const [household, setHousehold] = useState("");
  const [people, setPeople] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { fields?: { key: string; value: string }[] }) => {
        const value = (key: string) => data.fields?.find((f) => f.key === key)?.value ?? "";
        setName(value("USER_NAME"));
        setHousehold(value("HOUSEHOLD_NAME"));
      })
      .catch(() => {});

    fetch("/api/family")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((doc: FamilyDoc) => setPeople(familyNames(doc)))
      .catch(() => {});
  }, []);

  return { name, household, people };
}
