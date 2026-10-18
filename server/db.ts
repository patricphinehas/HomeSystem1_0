/**
 * The database the API talks to. `DB_SELECT` in `.env` is `supabase` or `mongodb`.
 * Callers in server/index.ts and scripts/ only see this file.
 */

import * as mongo from "./db.mongo.ts";
import * as pg from "./db.postgres.ts";
import { isDbChoice, NotConfigured, selectedDb } from "./db-select.ts";

export { NotConfigured };

const driver = () => {
  const which = selectedDb();
  if (which === "supabase") return pg;
  if (which === "mongodb") return mongo;
  throw new NotConfigured();
};

export const describeTarget = () => {
  const which = selectedDb();
  if (!isDbChoice(which)) return which ? `DB_SELECT=${which}` : "DB_SELECT is not set";
  return `${which} ${driver().describeTarget()}`;
};

export const applySchema = () => driver().applySchema();
export const readInventory = () => driver().readInventory();
export const writeInventory: typeof pg.writeInventory = (inventory) => driver().writeInventory(inventory);
export const readSubscriptions = () => driver().readSubscriptions();
export const writeSubscriptions: typeof pg.writeSubscriptions = (doc) => driver().writeSubscriptions(doc);
export const insertBills: typeof pg.insertBills = (bills) => driver().insertBills(bills);
export const readLines = () => driver().readLines();
export const readBills: typeof pg.readBills = (limit) => driver().readBills(limit);
export const clear = () => driver().clear();
export const counts = () => driver().counts();
export const serverInfo = () => driver().serverInfo();
export const close = () => driver().close();
