import assert from "node:assert/strict";
import test from "node:test";

import { subscribeToVisiblePageReturns } from "../lib/page-return-refresh.ts";

test("visible page returns refresh once and stop after cleanup", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  let visibilityState = "hidden";
  Object.defineProperty(documentTarget, "visibilityState", {
    configurable: true,
    get: () => visibilityState,
  });
  globalThis.window = windowTarget;
  globalThis.document = documentTarget;

  let calls = 0;
  let release;
  const cleanup = subscribeToVisiblePageReturns(() => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  });

  try {
    windowTarget.dispatchEvent(new Event("focus"));
    assert.equal(calls, 0, "a hidden tab must not refresh");

    visibilityState = "visible";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    windowTarget.dispatchEvent(new Event("focus"));
    assert.equal(calls, 1, "visibility and focus from one return are coalesced");

    release();
    await Promise.resolve();
    cleanup();
    windowTarget.dispatchEvent(new Event("focus"));
    assert.equal(calls, 1);
  } finally {
    cleanup();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
