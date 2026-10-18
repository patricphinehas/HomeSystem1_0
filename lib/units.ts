/**
 * Unit handling for bill entry.
 *
 * Every purchase is reduced to a *base* unit so two bills can be compared:
 * mass -> kg, volume -> L, countable things -> pc. Units we don't recognise
 * (pack, bottle, strip, ream...) stay their own base, so a price per bottle is
 * only ever compared with another price per bottle.
 */

const UNITS: Record<string, [base: string, factor: number]> = {
  mg: ["kg", 1e-6],
  g: ["kg", 1e-3],
  gm: ["kg", 1e-3],
  gms: ["kg", 1e-3],
  gram: ["kg", 1e-3],
  grams: ["kg", 1e-3],
  kg: ["kg", 1],
  kgs: ["kg", 1],
  kilo: ["kg", 1],
  kilos: ["kg", 1],
  kilogram: ["kg", 1],
  kilograms: ["kg", 1],

  ml: ["L", 1e-3],
  mls: ["L", 1e-3],
  millilitre: ["L", 1e-3],
  milliliter: ["L", 1e-3],
  l: ["L", 1],
  lt: ["L", 1],
  ltr: ["L", 1],
  litre: ["L", 1],
  liter: ["L", 1],
  litres: ["L", 1],
  liters: ["L", 1],

  pc: ["pc", 1],
  pcs: ["pc", 1],
  piece: ["pc", 1],
  pieces: ["pc", 1],
  no: ["pc", 1],
  nos: ["pc", 1],
  unit: ["pc", 1],
  units: ["pc", 1],
  dozen: ["pc", 12],
  doz: ["pc", 12],
  dz: ["pc", 12],
  pair: ["pc", 2],
  pairs: ["pc", 2],
};

/** Units offered in the bill form. Anything else typed by hand still works. */
export const COMMON_UNITS = ["kg", "g", "pcs", "L", "ml", "dozen", "pack", "bottle", "strip"];

export type Normalized = { base: string; factor: number; known: boolean };

export const normalizeUnit = (unit: string): Normalized => {
  const key = unit.trim().toLowerCase();
  const hit = UNITS[key];
  if (hit) return { base: hit[0], factor: hit[1], known: true };
  // Unknown unit: it becomes its own base, at factor 1. "2 bottles" -> price per bottle.
  return { base: key || "pc", factor: 1, known: false };
};

export type UnitPrice = { base: string; baseQty: number; price: number; known: boolean };

/**
 * Price per base unit — the number that makes "500 g for 60" and "1 kg for 110"
 * comparable. Null when the quantity or cost can't produce one.
 */
export const unitPrice = (qty: number, unit: string, cost: number): UnitPrice | null => {
  const { base, factor, known } = normalizeUnit(unit);
  const baseQty = qty * factor;
  if (!Number.isFinite(baseQty) || baseQty <= 0) return null;
  if (!Number.isFinite(cost) || cost < 0) return null;
  return { base, baseQty, price: cost / baseQty, known };
};

/** Cheapest of several same-base options. Mixed bases return null — they don't compare. */
export const cheapest = <T extends { base: string; price: number }>(options: T[]): T | null => {
  if (options.length === 0) return null;
  if (options.some((o) => o.base !== options[0].base)) return null;
  return options.reduce((best, o) => (o.price < best.price ? o : best));
};

/** "kg" -> "/kg". Used for labels like "₹120.00/kg". */
export const perLabel = (base: string) => `/${base}`;
