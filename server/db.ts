/**
 * The database the API talks to. `DB_SELECT` in `.env` is `supabase`, `mongodb`
 * or `sqlite`. Callers in server/index.ts and scripts/ only see this file, and
 * every driver answers the same shape, so nothing above here knows which.
 */

import * as mongo from "./db.mongo.ts";
import * as pg from "./db.postgres.ts";
import * as sqlite from "./db.sqlite.ts";
import { isDbChoice, NotConfigured, selectedDb } from "./db-select.ts";

export { NotConfigured };

const driver = () => {
  const which = selectedDb();
  if (which === "supabase") return pg;
  if (which === "mongodb") return mongo;
  if (which === "sqlite") return sqlite;
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
export const readChatDays = () => driver().readChatDays();
export const writeChatDay: typeof pg.writeChatDay = (day) => driver().writeChatDay(day);
export const readFamily = () => driver().readFamily();
export const writeFamily: typeof pg.writeFamily = (doc) => driver().writeFamily(doc);
export const readCalendar = () => driver().readCalendar();
export const readDevices = () => driver().readDevices();
export const writeDevices: typeof pg.writeDevices = (doc) => driver().writeDevices(doc);
export const writeCalendar: typeof pg.writeCalendar = (doc) => driver().writeCalendar(doc);
export const insertBills: typeof pg.insertBills = (bills) => driver().insertBills(bills);
export const readLines = () => driver().readLines();
export const readBills: typeof pg.readBills = (limit) => driver().readBills(limit);
export const clear = () => driver().clear();
export const counts = () => driver().counts();
export const serverInfo = () => driver().serverInfo();
export const close = () => driver().close();
