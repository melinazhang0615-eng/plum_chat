import assert from "node:assert/strict";
import test from "node:test";

import {
  flush,
  installClientErrorReporting,
  normalizePath,
  reportApiFailure,
  reportStreamFailure,
  resetTelemetryForTests,
  track,
} from "../lib/telemetry.ts";

/**
 * The reporter is a browser module, so every case needs a `window` for `track()` to run at all,
 * and a captured `fetch` to read back what would have been sent.
 */
function browser() {
  const sent = [];
  const listeners = new Map();
  globalThis.window = {
    location: { pathname: "/chat/char_abc" },
    addEventListener: (type, handler) => listeners.set(type, handler),
  };
  globalThis.document = { cookie: "plum_csrf=tok", addEventListener: () => undefined };
  globalThis.fetch = (url, init) => {
    sent.push({ url, init, body: JSON.parse(init.body) });
    return Promise.resolve(new Response("{}", { status: 202 }));
  };
  resetTelemetryForTests();
  return { sent, listeners };
}

function teardown() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.fetch;
  resetTelemetryForTests();
}

test("normalizePath keeps the route shape and drops every identifier", () => {
  assert.equal(normalizePath("/chat/char_abc123"), "/chat/{id}");
  assert.equal(normalizePath("/conversations/conv_1/turns"), "/conversations/{id}/turns");
  // The query string is where user input hides, so it never survives.
  assert.equal(normalizePath("/creator/works?q=%E4%B8%AD%E6%96%87&work_id=w1"), "/creator/works");
  assert.equal(normalizePath("/feed#anchor"), "/feed");
  assert.equal(normalizePath("/media/9f1c8a20-3b4d-4f2e-8a11-2c3d4e5f6071"), "/media/{id}");
  // Anything long enough to be an opaque id is treated as one, known routes are left alone.
  assert.equal(normalizePath("/x/" + "a".repeat(30)), "/x/{id}");
  assert.equal(normalizePath("/creator/characters/new"), "/creator/characters/new");
});

test("identical failures merge with a count instead of taking a second slot", (suite) => {
  suite.after(teardown);
  const { sent } = browser();

  for (let i = 0; i < 5; i += 1) {
    track({ name: "api_error", status: 500, path: "/feed", method: "GET" });
  }
  track({ name: "api_error", status: 503, path: "/feed", method: "GET" });
  flush();

  const events = sent[0].body.events;
  assert.equal(events.length, 2, "one key per distinct failure, not per occurrence");
  assert.equal(events[0].count, 5, "magnitude survives: sampling would have reported this as 1");
  assert.equal(events[0].page, "/chat/{id}", "page is filled in from the normalized location");
  assert.equal(events[1].count, 1);
  assert.equal(sent[0].init.keepalive, true, "must survive the page being torn down");
  assert.equal(sent[0].init.headers["X-Plum-CSRF"], "tok");
});

test("a runaway loop cannot grow the payload past the distinct-key cap", (suite) => {
  suite.after(teardown);
  const { sent } = browser();

  for (let i = 0; i < 200; i += 1) {
    track({ name: "api_error", status: 500, path: `/p${i}` });
  }
  // Already-known keys keep counting after the cap; only new ones are refused.
  track({ name: "api_error", status: 500, path: "/p0" });

  flush();
  assert.equal(sent[0].body.events.length, 20, "one flush carries at most a batch");
  const first = sent[0].body.events.find((event) => event.path === "/p0");
  assert.equal(first.count, 2);

  flush();
  const total = sent.reduce((sum, request) => sum + request.body.events.length, 0);
  assert.equal(total, 40, "the remainder carries over rather than being dropped");
  assert.equal(sent[0].body.session_id, sent[1].body.session_id, "one session id per tab");
});

test("only the statuses that mean something is broken are reported", (suite) => {
  suite.after(teardown);
  const { sent } = browser();

  // The server answering correctly: signed out, empty wallet, turn already running.
  for (const status of [401, 402, 409]) {
    reportApiFailure({ method: "POST", path: "/conversations", error: Object.assign(new Error("x"), { status }) });
  }
  flush();
  assert.equal(sent.length, 0, "normal traffic would bury the real failures");

  // 0 = never reached the server, 403/422 = we are wrong, 5xx = they are.
  for (const status of [0, 403, 422, 500, 503]) {
    reportApiFailure({ method: "POST", path: "/conversations/conv_1/turns", error: Object.assign(new Error("boom"), { status }) });
  }
  flush();
  const events = sent[0].body.events;
  assert.equal(events.length, 5);
  assert.deepEqual(events.map((event) => event.status).sort((a, b) => a - b), [0, 403, 422, 500, 503]);
  assert.equal(events[0].path, "/conversations/{id}/turns");
  assert.equal(events[0].method, "POST");
});

test("a retried API failure is reported once, carrying the attempt that failed", (suite) => {
  suite.after(teardown);
  const { sent } = browser();

  reportApiFailure({
    method: "GET",
    path: "/feed",
    error: Object.assign(new Error("boom"), { status: 503 }),
    attempt: 2,
  });
  flush();
  assert.equal(sent[0].body.events[0].detail, "attempt=2", "the retry not helping is the signal");
});

test("a stream that dies reports the retry and the final outcome separately", (suite) => {
  suite.after(teardown);
  const { sent } = browser();

  // Connected, then went silent: the 45s event-idle timeout, per TECH-02 §13.3.
  const stalled = Object.assign(new Error("ApiTimeoutError"), { status: 0, timeoutMs: 45_000 });
  reportStreamFailure({ error: stalled, retrying: true });
  reportStreamFailure({ error: Object.assign(new Error("STREAM_TRUNCATED"), { status: 0 }), retrying: false });
  flush();

  const names = sent[0].body.events.map((event) => event.name);
  assert.deepEqual(names, ["stream_retry", "stream_failed"]);
  assert.equal(sent[0].body.events[0].timeout_ms, 45_000, "distinguishes never-connected from stalled");
  assert.equal(sent[0].body.events[1].code, "STREAM_TRUNCATED");
});

test("the global handlers skip an error that was already reported", (suite) => {
  suite.after(teardown);
  const { sent, listeners } = browser();
  installClientErrorReporting();

  const error = Object.assign(new Error("boom"), { status: 500 });
  reportApiFailure({ method: "GET", path: "/feed", error });
  listeners.get("unhandledrejection")({ reason: error });
  flush();

  assert.equal(sent[0].body.events.length, 1, "one failure is one event, not two with different names");
  assert.equal(sent[0].body.events[0].name, "api_error");
});

test("an unhandled error reports its position, never the source text", (suite) => {
  suite.after(teardown);
  const { sent, listeners } = browser();
  installClientErrorReporting();

  listeners.get("error")({
    error: new TypeError("t is undefined"),
    message: "Uncaught TypeError: t is undefined",
    filename: "http://localhost:3000/_next/static/chunks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js",
    lineno: 1,
    colno: 42,
  });
  flush();

  const event = sent[0].body.events[0];
  assert.equal(event.name, "unhandled_error");
  assert.equal(event.code, "TypeError");
  assert.match(event.detail, /:1:42$/);
  // The hashed chunk name is an opaque id like any other; the origin survives, which is how a
  // failure injected by a browser extension stays distinguishable from one of ours.
  assert.equal(event.detail, "Uncaught TypeError: t is undefined @ http://localhost:3000/_next/static/chunks/{id}:1:42");
});

test("reporting never becomes the failure it reports", (suite) => {
  suite.after(teardown);
  const { sent } = browser();

  globalThis.fetch = () => {
    throw new Error("network stack is gone");
  };
  track({ name: "api_error", status: 500, path: "/feed" });
  assert.doesNotThrow(() => flush());

  // Dropped, not queued for a retry: a down backend must not get a storm from every open tab.
  globalThis.fetch = (url, init) => {
    sent.push({ url, init, body: JSON.parse(init.body) });
    return Promise.resolve(new Response("{}", { status: 202 }));
  };
  flush();
  assert.equal(sent.length, 0);

  // A rejected send is swallowed too, rather than surfacing as an unhandled rejection.
  globalThis.fetch = () => Promise.reject(new Error("offline"));
  track({ name: "api_error", status: 500, path: "/feed" });
  assert.doesNotThrow(() => flush());
});

test("track and flush are no-ops outside a browser", () => {
  resetTelemetryForTests();
  let called = false;
  globalThis.fetch = () => {
    called = true;
    return Promise.resolve(new Response("{}"));
  };
  try {
    track({ name: "api_error", status: 500, path: "/feed" });
    flush();
    assert.equal(called, false, "server rendering must not try to report anything");
  } finally {
    delete globalThis.fetch;
  }
});
