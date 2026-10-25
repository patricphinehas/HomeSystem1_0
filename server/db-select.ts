/**
 * Which database the API talks to. Set `DB_SELECT` in `.env`.
 *
 * Three choices, one interface: a hosted Postgres, a MongoDB, or a SQLite file
 * for a household that wants to run the whole thing on one machine with
 * nothing else installed.
 */

export const DB_CHOICES = ["supabase", "mongodb", "sqlite"] as const;

export type DbChoice = (typeof DB_CHOICES)[number];

export const selectedDb = (): string => (process.env.DB_SELECT ?? "").trim().toLowerCase();

export const isDbChoice = (value: string): value is DbChoice =>
  (DB_CHOICES as readonly string[]).includes(value);

export class NotConfigured extends Error {
  constructor(message = 'DB_SELECT must be "supabase", "mongodb" or "sqlite".') {
    super(message);
    this.name = "NotConfigured";
  }
}
