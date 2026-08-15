import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { ApiError, createConversation, getFeed, sendTurnStream } from "../lib/api.ts";

function sseResponse(events) {
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

test("request timeout, retry and CSRF assembly", async (suite) => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  suite.after(() => {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });

  await suite.test("aborts a request that opens but never answers", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason));
      });
      // POST, so the failure is not retried and the rejection is the timeout itself.
      const pending = createConversation("char_1");
      mock.timers.tick(10_000);
      await assert.rejects(pending, (error) => {
        assert.equal(error.name, "ApiTimeoutError");
        assert.equal(error.status, 0);
        assert.ok(error instanceof ApiError, "stays an ApiError so existing catch blocks keep working");
        return true;
      });
    } finally {
      mock.timers.reset();
    }
  });

  await suite.test("retries a GET once after a transient 503", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify({ detail: "temporarily_down" }), { status: 503 })
        : new Response(JSON.stringify({ status: "ok", items: [] }), { status: 200 });
    };
    const feed = await getFeed();
    assert.equal(calls, 2);
    assert.deepEqual(feed.items, []);
  });

  await suite.test("never replays a non-idempotent request", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ detail: "temporarily_down" }), { status: 503 });
    };
    await assert.rejects(createConversation("char_1"), (error) => error instanceof ApiError && error.status === 503);
    assert.equal(calls, 1);
  });

  await suite.test("streaming and non-streaming send the same CSRF header", async () => {
    globalThis.document = { cookie: "plum_csrf=token%2B1" };
    const seen = [];
    globalThis.fetch = async (url, init) => {
      seen.push({ url, headers: init.headers });
      return url.endsWith("/turns/stream")
        ? sseResponse([
          { type: "turn.accepted", version: 1, turn_id: "t1", request_id: "r1" },
          { type: "turn.completed", version: 1, turn_id: "t1", message_id: "m1", finish_reason: "stop", charged_coins: 0, wallet: null, deduplicated: false },
        ])
        : new Response(JSON.stringify({ status: "ok", conversation: {} }), { status: 200 });
    };

    await createConversation("char_1");
    await sendTurnStream({
      conversationId: "conv_1",
      text: "hi",
      requestId: "r1",
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });

    assert.equal(seen.length, 2);
    for (const { headers } of seen) {
      assert.equal(headers["X-Plum-CSRF"], "token+1", "the cookie value must be decoded exactly once");
      assert.equal(headers["Content-Type"], "application/json");
    }
    assert.equal(seen[1].headers["Accept"], "text/event-stream");
  });

  await suite.test("still relays a cancel after the connect timeout is disarmed", async () => {
    let handed;
    globalThis.fetch = async (_url, init) => {
      handed = init.signal;
      // Real fetch errors the body stream when the signal aborts; mirror that.
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("event: turn.accepted\ndata: {\"version\":1,\"turn_id\":\"t1\"}\n\n"));
          init.signal.addEventListener("abort", () => controller.error(init.signal.reason));
        },
      });
      return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    };

    const cancel = new AbortController();
    const stream = sendTurnStream({
      conversationId: "conv_1",
      text: "hi",
      requestId: "r1",
      signal: cancel.signal,
      // The first event proves headers arrived, so the connect timer has been cleared.
      onEvent: () => cancel.abort(new Error("user pressed stop")),
    });

    await assert.rejects(stream);
    assert.ok(handed.aborted, "the signal handed to fetch must follow the caller's cancel");
  });

  await suite.test("omits the CSRF header on reads", async () => {
    globalThis.document = { cookie: "plum_csrf=token" };
    let headers;
    globalThis.fetch = async (_url, init) => {
      headers = init.headers;
      return new Response(JSON.stringify({ status: "ok", items: [] }), { status: 200 });
    };
    await getFeed();
    assert.equal(headers["X-Plum-CSRF"], undefined);
  });
});
