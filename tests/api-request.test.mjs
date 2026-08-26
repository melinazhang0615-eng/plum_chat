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

  await suite.test("replays a truncated stream under the same idempotency key", async () => {
    const keys = [];
    globalThis.fetch = async (_url, init) => {
      keys.push(JSON.parse(init.body).idempotency_key);
      // First attempt dies before any terminal event: the classic dropped connection.
      return keys.length === 1
        ? sseResponse([{ type: "turn.accepted", version: 1, turn_id: "t1", request_id: "r1" }])
        : sseResponse([
          { type: "turn.accepted", version: 1, turn_id: "t1", request_id: "r1" },
          { type: "turn.completed", version: 1, turn_id: "t1", message_id: "m1", finish_reason: "stop", charged_coins: 3, wallet: null, deduplicated: false },
        ]);
    };

    const seen = [];
    await sendTurnStream({
      conversationId: "conv_1",
      text: "hi",
      requestId: "r1",
      signal: new AbortController().signal,
      onEvent: (event) => seen.push(event.type),
    });

    assert.deepEqual(keys, ["r1", "r1"], "the retry must reuse the key so the server charges once");
    assert.deepEqual(seen, ["turn.accepted", "turn.accepted", "turn.completed"]);
  });

  await suite.test("never replays once reply text has been delivered", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return sseResponse([
        { type: "turn.accepted", version: 1, turn_id: "t1", request_id: "r1" },
        { type: "message.delta", version: 1, turn_id: "t1", seq: 1, text: "半句话" },
      ]);
    };

    await assert.rejects(sendTurnStream({
      conversationId: "conv_1",
      text: "hi",
      requestId: "r1",
      signal: new AbortController().signal,
      onEvent: () => undefined,
    }), (error) => error.code === "STREAM_TRUNCATED");
    // Retrying here would append a second answer to the half already on screen.
    assert.equal(calls, 1);
  });

  await suite.test("gives up on a reply that goes silent, and heartbeats do not save it", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      globalThis.fetch = async (_url, init) => {
        const body = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode("event: turn.accepted\ndata: {\"version\":1,\"turn_id\":\"t1\"}\n\n"));
            controller.enqueue(encoder.encode("event: message.delta\ndata: {\"version\":1,\"turn_id\":\"t1\",\"seq\":1,\"text\":\"半\"}\n\n"));
            // The server is alive and says so, but the model has stopped producing.
            controller.enqueue(encoder.encode(": ping\n\n"));
            init.signal.addEventListener("abort", () => controller.error(init.signal.reason));
          },
        });
        return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      };

      const seen = [];
      const pending = sendTurnStream({
        conversationId: "conv_1",
        text: "hi",
        requestId: "r1",
        signal: new AbortController().signal,
        onEvent: (event) => seen.push(event.type),
      });
      // Let the reader drain what is already buffered before the clock moves.
      for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(seen, ["turn.accepted", "message.delta"]);

      mock.timers.tick(45_000);
      await assert.rejects(pending, (error) => {
        assert.equal(error.name, "ApiTimeoutError");
        // 45s, not the 15s connect budget: the idle budget replaced it once headers landed.
        assert.equal(error.timeoutMs, 45_000);
        return true;
      });
    } finally {
      mock.timers.reset();
    }
  });

  await suite.test("never replays a considered refusal", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ detail: "insufficient_coins" }), { status: 402 });
    };

    await assert.rejects(sendTurnStream({
      conversationId: "conv_1",
      text: "hi",
      requestId: "r1",
      signal: new AbortController().signal,
      onEvent: () => undefined,
    }), (error) => error instanceof ApiError && error.message === "insufficient_coins");
    assert.equal(calls, 1);
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

test("feed query string", async (suite) => {
  const originalFetch = globalThis.fetch;
  suite.after(() => { globalThis.fetch = originalFetch; });

  let seen = "";
  globalThis.fetch = async (url) => {
    seen = String(url);
    return new Response(JSON.stringify({ status: "ok", items: [], next_cursor: null }), { status: 200 });
  };
  const params = () => new URL(seen, "http://x").searchParams;

  await suite.test("sends search and every selected tag to the server", async () => {
    await getFeed({ q: "  slow burn  ", tags: ["OC", "CEO"] });
    assert.equal(params().get("q"), "slow burn", "trimmed, and not lower-cased — the server matches case-insensitively");
    assert.deepEqual(params().getAll("tags"), ["OC", "CEO"], "repeated key, which is what FastAPI reads as List[str]");
  });

  await suite.test("leaves out what was never set, so the first page stays byte-identical for everyone", async () => {
    await getFeed();
    assert.equal(params().get("q"), null);
    assert.deepEqual(params().getAll("tags"), []);
    assert.equal(params().get("cursor"), null);
    // Only `limit` rides along; the unfiltered, uncursored page is the one the server may cache.
    assert.deepEqual([...params().keys()], ["limit"]);
  });

  await suite.test("clips a query the server would reject with a 422 the user cannot act on", async () => {
    await getFeed({ q: "x".repeat(200) });
    assert.equal(params().get("q").length, 64);
  });

  await suite.test("drops blank tags instead of asking the server about an empty string", async () => {
    await getFeed({ tags: ["OC", "   ", ""] });
    assert.deepEqual(params().getAll("tags"), ["OC"]);
  });

  await suite.test("passes the cursor back opaquely", async () => {
    await getFeed({ cursor: "MTA6Y2hhcl94" });
    assert.equal(params().get("cursor"), "MTA6Y2hhcl94");
  });

  await suite.test("sends gender and rating as the server's own enum values", async () => {
    await getFeed({ gender: "non_binary", rating: "mature" });
    assert.equal(params().get("gender"), "non_binary", "the wire value, not the menu label 'Other'");
    assert.equal(params().get("rating"), "mature");
  });

  await suite.test("sends the server view and stable Tag ID", async () => {
    await getFeed({ view: "trending", tagId: "tag_slow_burn" });
    assert.equal(params().get("view"), "trending");
    assert.equal(params().get("tag_id"), "tag_slow_burn");
  });

  await suite.test("omits a filter that is off rather than sending an empty value", async () => {
    // `?gender=` would be the server asking about a gender named "", and it would also split the
    // cacheable first page into two responses that mean the same thing.
    await getFeed({ gender: null, rating: null });
    assert.deepEqual([...params().keys()], ["limit"]);
  });
});
