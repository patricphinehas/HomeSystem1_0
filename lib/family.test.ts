import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanPerson, familyNames, normalizeFamily } from "./family.ts";

const person = (over: Record<string, unknown> = {}) => ({ id: "p1", name: "Dad", role: "parent", ...over });

test("a household is a list of named people with roles", () => {
  const result = normalizeFamily({ people: [person(), person({ id: "p2", name: "Anu", role: "child" })] });
  assert.ok("doc" in result);
  assert.deepEqual(familyNames(result.doc), ["Dad", "Anu"]);
});

test("two people cannot share a name, because the calendar keys on it", () => {
  assert.ok("error" in normalizeFamily({ people: [person(), person({ id: "p2", name: "dad" })] }));
  assert.ok("error" in normalizeFamily({ people: [person(), person()] }), "nor an id");
});

test("a half-typed row is allowed, since every keystroke saves", () => {
  const result = normalizeFamily({ people: [person({ name: "" }), person({ id: "p2", name: "" })] });
  assert.ok("doc" in result, "two blanks are two people still being typed, not a clash");
  assert.deepEqual(familyNames(result.doc), []);
});

test("names are collapsed and capped; roles are capped", () => {
  assert.equal(cleanPerson("  Anu   Maria \n"), "Anu Maria");
  assert.equal(cleanPerson("x".repeat(80)).length, 60);
  assert.ok("error" in normalizeFamily({ people: [person({ role: "r".repeat(41) })] }));
  assert.ok("error" in normalizeFamily({ people: [person({ id: "" })] }));
  assert.ok("error" in normalizeFamily({ people: {} }));
});
