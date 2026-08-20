import assert from "node:assert/strict";
import test from "node:test";

import { ApiError, getDebugConversation, getDebugTurn, getDebugTurns } from "../lib/api.ts";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("debug console reads", async (suite) => {
  const originalFetch = globalThis.fetch;
  suite.after(() => {
    globalThis.fetch = originalFetch;
  });

  await suite.test("hits the owner-scoped product routes", async () => {
    const seen = [];
    globalThis.fetch = async (url) => {
      seen.push(String(url));
      return jsonResponse({ status: "ok", items: [] });
    };

    await getDebugConversation("conv_1");
    await getDebugTurns("conv_1", 5);
    await getDebugTurn("turn_1");

    assert.deepEqual(seen, [
      "/api/v1/products/plum/debug/conversations/conv_1",
      "/api/v1/products/plum/debug/conversations/conv_1/turns?limit=5",
      "/api/v1/products/plum/debug/turns/turn_1",
    ]);
  });

  await suite.test("passes the captured request through unchanged", async () => {
    const prompt = {
      system_prompt: "You are Ada.",
      messages: [{ role: "user", content: "hi" }],
      response_format: { type: "text" },
      request_meta: { model_ref: "gpt-test" },
      captured_at: "2026-08-20 10:00:00",
      expires_at: "2026-08-27 10:00:00",
      rendered_request_hash: "a".repeat(64),
      hash_matches: true,
    };
    globalThis.fetch = async () =>
      jsonResponse({ status: "ok", turn: { id: "turn_1" }, snapshots: [{ id: "s1", prompt }] });

    const detail = await getDebugTurn("turn_1");

    assert.deepEqual(detail.snapshots[0].prompt, prompt);
  });

  await suite.test("surfaces a closed console as a 404 ApiError", async () => {
    globalThis.fetch = async () => jsonResponse({ detail: "not_found" }, 404);

    await assert.rejects(getDebugConversation("conv_1"), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 404);
      return true;
    });
  });
});
