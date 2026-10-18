/**
 * Where this household is: the locale dates and numbers are written in, the
 * timezone "today" means, and the currency money is counted in.
 *
 * ponytail: module-level, set once. `setRegion` is called on the server from
 * `.env` at startup and in the browser from `/api/settings` on first paint,
 * and 46 call sites keep their existing signatures — `inr(n)` stays `inr(n)`.
 * Nothing re-reads it mid-render, so a change takes effect on the next paint,
 * which is why the browser applier bumps a state to force one. If a setting
 * ever has to change without that, this becomes a context and the formatters
 * become hooks.
 */

export type Region = {
  /** BCP 47, e.g. en-IN. Dates and number grouping. */
  locale: string;
  /** IANA, e.g. Asia/Kolkata. Empty means wherever the reader is. */
  timezone: string;
  /** ISO 4217, e.g. INR. */
  currency: string;
};

export const DEFAULT_REGION: Region = { locale: "en-IN", timezone: "", currency: "INR" };

let current: Region = { ...DEFAULT_REGION };

export const region = (): Region => current;

/** Applies whatever is valid and ignores the rest, so a typo cannot blank the app. */
export function setRegion(next: Partial<Region>): Region {
  current = {
    locale: isLocale(next.locale) ? next.locale! : current.locale,
    timezone: next.timezone === "" || isTimezone(next.timezone) ? (next.timezone ?? current.timezone) : current.timezone,
    currency: isCurrency(next.currency) ? next.currency!.toUpperCase() : current.currency,
  };
  return current;
}

/** Only for tests, which must not leak a region into one another. */
export const resetRegion = () => {
  current = { ...DEFAULT_REGION };
};

const ok = (make: () => unknown) => {
  try {
    make();
    return true;
  } catch {
    return false;
  }
};

/**
 * Well-formed *and* one Intl actually knows. `new Intl.DateTimeFormat("sdfsdf")`
 * does not throw — "sdfsdf" is a structurally valid language tag — it just
 * quietly falls back, which on screen looks like the setting did nothing.
 */
export const isLocale = (value?: string) =>
  !!value && ok(() => new Intl.DateTimeFormat(value)) && Intl.DateTimeFormat.supportedLocalesOf(value).length > 0;

export const isTimezone = (value?: string) =>
  !!value && ok(() => new Intl.DateTimeFormat("en-CA", { timeZone: value }));

/** Three letters that Intl will actually format with. */
export const isCurrency = (value?: string) =>
  !!value && /^[A-Za-z]{3}$/.test(value) && ok(() => new Intl.NumberFormat("en", { style: "currency", currency: value }));

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Today as yyyy-mm-dd. In the configured zone when there is one, and otherwise
 * wherever the reader is — never UTC, which in IST is yesterday until 05:30.
 * `en-CA` is the shortest way to ask Intl for an ISO-shaped date.
 */
export function todayIn(timezone: string, now = new Date()) {
  if (!timezone) return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The symbol Intl uses for the configured currency, for compact axis labels. */
export function currencySymbol(locale = current.locale, currency = current.currency) {
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? currency;
}

/* ---------------- the lists behind the settings dropdowns ---------------- */

/**
 * These are built in the browser from Intl, never sent over the wire: 418
 * timezones and 162 currencies would be 20KB on a route that the sidebar
 * fetches on every page. The server validates the answer either way.
 */
const supported = (key: "timeZone" | "currency") => {
  try {
    return Intl.supportedValuesOf(key);
  } catch {
    // An engine without supportedValuesOf leaves the field a plain text box.
    return [];
  }
};

export const timezones = () => supported("timeZone");
export const currencies = () => supported("currency");

/**
 * There is no `supportedValuesOf("locale")`, so this is a hand-picked list.
 * The settings dropdown adds whatever is already configured, so an unusual
 * tag typed into `.env` is offered back rather than silently dropped.
 */
export const COMMON_LOCALES = [
  "en-IN",
  "hi-IN",
  "ta-IN",
  "ml-IN",
  "te-IN",
  "bn-IN",
  "en-GB",
  "en-US",
  "en-AU",
  "en-CA",
  "en-SG",
  "en-AE",
  "de-DE",
  "fr-FR",
  "es-ES",
  "it-IT",
  "nl-NL",
  "pt-BR",
  "sv-SE",
  "pl-PL",
  "tr-TR",
  "ar-AE",
  "ja-JP",
  "ko-KR",
  "zh-CN",
] as const;

const displayName = (type: "currency" | "language", code: string, locale: string) => {
  try {
    return new Intl.DisplayNames([locale], { type }).of(code);
  } catch {
    return undefined;
  }
};

/** "INR — Indian Rupee", or just the code when the engine has no name for it. */
export function currencyLabel(code: string, locale = current.locale) {
  const name = displayName("currency", code, locale);
  return name && name !== code ? `${code} — ${name}` : code;
}

/** "en-IN — English (India)". */
export function localeLabel(tag: string, locale = current.locale) {
  const name = displayName("language", tag, locale);
  return name && name !== tag ? `${tag} — ${name}` : tag;
}
