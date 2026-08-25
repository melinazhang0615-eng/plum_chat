import assert from "node:assert/strict";
import test from "node:test";

import { formatCompactCount, formatMessageTime } from "../lib/format.ts";

// These assertions are written to hold in any timezone: they compare the formatter against a
// reference rendered by the same runtime, so they pin *which instant* was parsed without pinning
// the machine's TZ (CI and this laptop are not in the same zone).
test("formatMessageTime", async (suite) => {
  const reference = new Date("2026-08-15T09:30:00+08:00").toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  await suite.test("reads the API's naive timestamps as Asia/Shanghai", () => {
    // The regression this guards: without the offset, JS reads "2026-08-15 09:30:00" as local
    // time, so a reader outside +08:00 sees every message stamped with the wrong hour.
    assert.equal(formatMessageTime("2026-08-15 09:30:00"), reference);
  });

  await suite.test("treats both wire shapes as the same instant", () => {
    // Some endpoints run timestamps through the backend's `_api_timestamp()` helper and some do
    // not, so the same field arrives either way. They must not render differently.
    assert.equal(formatMessageTime("2026-08-15T09:30:00+08:00"), reference);
    assert.equal(formatMessageTime("2026-08-15T01:30:00Z"), reference);
  });

  await suite.test("degrades to 'Just now' instead of 'Invalid Date'", () => {
    assert.equal(formatMessageTime(undefined), "Just now");
    assert.equal(formatMessageTime(""), "Just now");
    assert.equal(formatMessageTime("not a timestamp"), "Just now");
  });
});

test("formatCompactCount", () => {
  assert.equal(formatCompactCount(0), "0");
  assert.equal(formatCompactCount(999), "999");
  assert.equal(formatCompactCount(1500), "1.5K");
  assert.equal(formatCompactCount(1_200_000), "1.2M");
});
