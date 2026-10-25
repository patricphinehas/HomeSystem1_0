/**
 * Prepares whichever database DB_SELECT names: supabase/schema.sql on Postgres,
 * sqlite/schema.sql on SQLite, indexes on MongoDB.
 *
 *   mise run migrate
 *
 * Both schema files are written with `create table if not exists`, so running
 * this twice is harmless and it doubles as the "is this project set up yet"
 * command. On SQLite it also creates the file and its directory, which is why
 * nothing has to exist beforehand.
 */

import { applySchema, close, counts, describeTarget } from "../server/db.ts";

console.log(`preparing ${describeTarget()}`);
await applySchema();
const n = await counts();
console.log(`schema applied. categories ${n.categories}, items ${n.items}, bills ${n.bills}`);
await close();
