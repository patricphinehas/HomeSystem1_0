/** Rupee and percentage formatting, shared by the pages and the charts. */

const rupees = (dp: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });

const whole = rupees(0);
const paise = rupees(2);

export const inr = (n: number | null | undefined, dp: 0 | 2 = 0) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : (dp === 0 ? whole : paise).format(n);

/** Compact axis label: ₹1.2k, ₹14k, ₹1.1L. */
export const inrShort = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(abs >= 1e6 ? 0 : 1)}L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return `₹${Math.round(n)}`;
};

export const pct = (n: number | null | undefined, dp = 1) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(dp)}%`;

export const perUnit = (price: number, base: string) => `${paise.format(price)}/${base}`;
