import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSubscriptions } from "./subscriptions.ts";

test("subscriptions require a name and valid share count when shareable", () => {
  const ok = normalizeSubscriptions({
    subscriptions: [
      {
        id: "s1",
        name: "Netflix",
        type: "streaming",
        tag: "entertainment",
        holder: "Pat",
        shareable: true,
        shareCount: 4,
      },
    ],
  });
  assert.ok("doc" in ok);

  const bad = normalizeSubscriptions({
    subscriptions: [{ id: "s2", name: "Spotify", shareable: true, shareCount: 0 }],
  });
  assert.ok("error" in bad);
});
