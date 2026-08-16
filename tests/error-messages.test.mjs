import assert from "node:assert/strict";
import test from "node:test";

import { ApiError, ApiTimeoutError } from "../lib/api.ts";
import { KNOWN_ERROR_CODES, errorMessage, messageForCode } from "../lib/error-messages.ts";

const COPY = {
  offline: "OFFLINE",
  fallback: "FALLBACK",
  byStatus: { 401: "SIGN IN", 409: "CONFLICT" },
};

test("a named code wins over the status it arrived with", () => {
  // The point of the shared dictionary: 429 `rate_limited` must read the same everywhere,
  // even on a screen that also assigns 429 its own sentence.
  const message = errorMessage(new ApiError("rate_limited", 429), {
    fallback: "FALLBACK",
    byStatus: { 429: "SCREEN SPECIFIC" },
  });
  assert.equal(message, "Too many requests. Wait a moment and try again.");
});

test("an unknown code falls back to the screen's status copy", () => {
  assert.equal(errorMessage(new ApiError("authentication_required", 401), COPY), "SIGN IN");
  assert.equal(errorMessage(new ApiError("whatever_new_code", 409), COPY), "CONFLICT");
});

test("an unknown code and an unhandled status reach the fallback", () => {
  assert.equal(errorMessage(new ApiError("teapot", 418), COPY), "FALLBACK");
});

test("a non-ApiError is treated as never having reached the API", () => {
  assert.equal(errorMessage(new TypeError("Failed to fetch"), COPY), "OFFLINE");
  // Screens that do not distinguish the two still get a sentence.
  assert.equal(errorMessage(new TypeError("Failed to fetch"), { fallback: "FALLBACK" }), "FALLBACK");
});

test("a timeout reads as our failure, not the user's input", () => {
  // Regression: `ApiTimeoutError` extends `ApiError`, so an `instanceof ApiError` guard never
  // fired for it and a timeout used to render whatever the catch-all said — usually a variant
  // of "check your details", which blames the user for a request we never got an answer to.
  const message = errorMessage(new ApiTimeoutError(10_000), COPY);
  assert.equal(message, "The server took too long to answer. Check your connection and try again.");
});

test("status 0 without a known code is a transport failure", () => {
  assert.equal(errorMessage(new ApiError("network_error", 0), COPY), "OFFLINE");
});

test("the 401 codes stay out of the dictionary so screens keep control of the flow", () => {
  // A 401 is a redirect or a sign-in dialog, not a sentence; a shared entry here would
  // silently outrank the copy each screen picked for that decision.
  assert.ok(!KNOWN_ERROR_CODES.includes("session_expired"));
  assert.ok(!KNOWN_ERROR_CODES.includes("authentication_required"));
});

test("messageForCode resolves a bare code from a stream event", () => {
  assert.equal(messageForCode("insufficient_coins", "FALLBACK"), "Not enough coins for this message.");
  assert.equal(messageForCode("unmapped_reason", "FALLBACK"), "FALLBACK");
  assert.equal(messageForCode(undefined, "FALLBACK"), "FALLBACK");
});

test("every message is a sentence a user could act on", () => {
  for (const code of KNOWN_ERROR_CODES) {
    const message = messageForCode(code, "");
    assert.ok(message.length > 0, `${code} has no message`);
    assert.ok(/[.!]$/.test(message), `${code} is not punctuated: ${message}`);
    // A code leaking into the UI is the failure mode this module exists to prevent.
    assert.ok(!message.includes(code), `${code} leaks its code into the copy`);
  }
});
