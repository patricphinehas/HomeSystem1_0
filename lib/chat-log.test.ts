import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_MESSAGES_PER_DAY,
  appendToDay,
  normalizeChatDay,
  openingLine,
  sortDays,
  toLogged,
} from "./chat-log.ts";

test("a logged message keeps the words and the tool names, and drops the rest", () => {
  assert.deepEqual(toLogged({ role: "user", content: "What are we low on?" }), {
    role: "user",
    content: "What are we low on?",
  });

  // An assistant turn that only called tools has no prose, but is worth keeping.
  assert.deepEqual(
    toLogged({
      role: "assistant",
      content: null,
      tool_calls: [{ function: { name: "low_stock" } }, { function: { name: "list_events" } }],
      // Provider-specific and large; a day later it is noise.
      reasoning_content: "Let me think about which tool to call...",
    } as Parameters<typeof toLogged>[0]),
    { role: "assistant", content: "", calls: ["low_stock", "list_events"] },
  );

  assert.equal(toLogged({ role: "assistant", content: "" }), null, "nothing to read, nothing to keep");
  assert.equal(toLogged({ role: "system", content: "You are..." }), null, "the prompt is not history");
});

test("a day is capped, keeping the most recent", () => {
  const many = Array.from({ length: MAX_MESSAGES_PER_DAY + 10 }, (_, i) => ({
    role: "user" as const,
    content: `q${i}`,
  }));
  const day = appendToDay({ date: "2026-10-19", messages: [] }, many);
  assert.equal(day.messages.length, MAX_MESSAGES_PER_DAY);
  assert.equal(day.messages.at(-1)!.content, `q${MAX_MESSAGES_PER_DAY + 9}`);
  assert.equal(day.messages[0].content, "q10", "the oldest fall off the front");
});

test("days read newest first, and show what was asked first that day", () => {
  const days = [
    { date: "2026-10-17", messages: [] },
    { date: "2026-10-19", messages: [] },
    { date: "2026-10-18", messages: [] },
  ];
  assert.deepEqual(
    sortDays(days).map((d) => d.date),
    ["2026-10-19", "2026-10-18", "2026-10-17"],
  );

  assert.equal(
    openingLine({
      date: "2026-10-19",
      messages: [
        { role: "assistant", content: "", calls: ["low_stock"] },
        { role: "user", content: "What are we low on?\nAnd when is movie night?" },
      ],
    }),
    "What are we low on?",
  );
});

test("a stored day is validated like everything else", () => {
  const ok = normalizeChatDay({
    date: "2026-10-19",
    messages: [{ role: "user", content: "hello" }, { role: "nonsense", content: "x" }],
  });
  assert.ok("day" in ok);
  assert.equal(ok.day.messages.length, 1, "an unknown role is dropped, not an error");

  assert.ok("error" in normalizeChatDay({ date: "last Tuesday", messages: [] }));
  assert.ok("error" in normalizeChatDay({ date: "2026-10-19" }));
});
