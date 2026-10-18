/**
 * Prepares whichever database DB_SELECT names: supabase/schema.sql on Postgres,
 * indexes on MongoDB.
 *
 *   mise run migrate
 *
 * The file is written with `create table if not exists`, so running it twice is
 * harmless and it doubles as the "is this project set up yet" command.
 */

import { applySchema, close, counts, describeTarget } from "../server/db.ts";

console.log(`preparing ${describeTarget()}`);
await applySchema();
const n = await counts();
console.log(`schema applied. categories ${n.categories}, items ${n.items}, bills ${n.bills}`);
await close();
