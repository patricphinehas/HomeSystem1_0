import { strict as assert } from "node:assert";
import { test } from "node:test";
import { patchEnv, quoteEnv } from "./env-file.ts";

test("replaces a value in place and keeps everything around it", () => {
  const before = "# a comment\nDB_SELECT=mongodb\n\nAPI_PORT=4000\n";
  assert.equal(
    patchEnv(before, { DB_SELECT: "supabase" }),
    "# a comment\nDB_SELECT=supabase\n\nAPI_PORT=4000\n",
  );
});

test("appends a key the file does not have", () => {
  assert.equal(patchEnv("A=1\n", { B: "2" }), "A=1\nB=2\n");
});

test("leaves a commented-out key commented and adds a real one", () => {
  assert.equal(
    patchEnv("# DATABASE_URL=\n", { DATABASE_URL: "postgres://x" }),
    "# DATABASE_URL=\nDATABASE_URL=postgres://x\n",
  );
});

test("quotes values that would not survive bare, and empties", () => {
  assert.equal(quoteEnv("pa ss#word"), '"pa ss#word"');
  assert.equal(quoteEnv(""), '""');
  assert.equal(quoteEnv("postgres://u:p@h:6543/db"), "postgres://u:p@h:6543/db");
  assert.equal(patchEnv("K=old\n", { K: 'say "hi"' }), 'K="say \\"hi\\""\n');
});

test("one pass applies every change", () => {
  assert.equal(patchEnv("A=1\nB=2\n", { A: "9", C: "3" }), "A=9\nB=2\nC=3\n");
});
