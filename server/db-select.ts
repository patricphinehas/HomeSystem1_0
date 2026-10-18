/** Which database the API talks to. Set `DB_SELECT` in `.env`. */

export const DB_CHOICES = ["supabase", "mongodb"] as const;

export type DbChoice = (typeof DB_CHOICES)[number];

export const selectedDb = (): string => (process.env.DB_SELECT ?? "").trim().toLowerCase();

export const isDbChoice = (value: string): value is DbChoice =>
  (DB_CHOICES as readonly string[]).includes(value);

export class NotConfigured extends Error {
  constructor(message = 'DB_SELECT must be "supabase" or "mongodb".') {
    super(message);
    this.name = "NotConfigured";
  }
}
