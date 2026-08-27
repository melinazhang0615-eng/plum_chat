import assert from "node:assert/strict";
import test from "node:test";

import { detectClientTimezone, timezoneNeedsSubmit } from "../lib/timezone.ts";

const language = (extra) => ({
  catalog_version: "plum-language-v1",
  language_key: "en",
  locale: "en-US",
  ui_locale: "en-US",
  preference_revision: 1,
  source: "product_default",
  ...extra,
});

test("detectClientTimezone", async (suite) => {
  const nativeFormat = Intl.DateTimeFormat;
  const stub = (zone) => {
    Intl.DateTimeFormat = function () {
      return { resolvedOptions: () => ({ timeZone: zone }) };
    };
  };
  suite.afterEach(() => { Intl.DateTimeFormat = nativeFormat; });

  await suite.test("returns the runtime's IANA name", () => {
    stub("America/New_York");
    assert.equal(detectClientTimezone(), "America/New_York");
  });

  await suite.test("drops UTC offsets, which cannot express daylight saving", () => {
    // A zone reported as an offset would put the day boundary an hour off for half the year,
    // and the server rejects it anyway — so it must not cost a request.
    for (const offset of ["GMT+8", "UTC+08:00", "+08:00"]) {
      stub(offset);
      assert.equal(detectClientTimezone(), "");
    }
  });

  await suite.test("returns '' instead of throwing when the runtime cannot answer", () => {
    stub(undefined);
    assert.equal(detectClientTimezone(), "");
    Intl.DateTimeFormat = function () { throw new Error("no Intl"); };
    assert.equal(detectClientTimezone(), "");
  });

  await suite.test("keeps the real runtime's answer usable", () => {
    // Guards the filter above against being so strict it rejects this machine's own zone.
    const zone = nativeFormat().resolvedOptions().timeZone;
    assert.equal(detectClientTimezone(), zone);
  });
});

test("timezoneNeedsSubmit", async (suite) => {
  await suite.test("submits the first browser reading", () => {
    assert.equal(timezoneNeedsSubmit(language({ timezone: "UTC", timezone_source: "product_default" }), "Asia/Shanghai"), true);
  });

  await suite.test("submits UTC itself, to record that a client confirmed it", () => {
    // Same value, different meaning: 'product_default' is a guess, 'client_initial' is a fact.
    assert.equal(timezoneNeedsSubmit(language({ timezone: "UTC", timezone_source: "product_default" }), "UTC"), true);
  });

  await suite.test("stays quiet when the server already holds this value", () => {
    assert.equal(timezoneNeedsSubmit(language({ timezone: "Asia/Shanghai", timezone_source: "client_initial" }), "Asia/Shanghai"), false);
  });

  await suite.test("submits after the reader travels", () => {
    assert.equal(timezoneNeedsSubmit(language({ timezone: "Asia/Shanghai", timezone_source: "client_initial" }), "Europe/Berlin"), true);
  });

  await suite.test("never overrides a zone the reader chose", () => {
    assert.equal(timezoneNeedsSubmit(language({ timezone: "Asia/Tokyo", timezone_source: "explicit" }), "Europe/Berlin"), false);
  });

  await suite.test("sends nothing when there is nothing to send or nowhere to store it", () => {
    assert.equal(timezoneNeedsSubmit(language({ timezone: "UTC", timezone_source: "product_default" }), ""), false);
    assert.equal(timezoneNeedsSubmit(undefined, "Europe/Berlin"), false);
    // A backend without the timezone columns omits both fields.
    assert.equal(timezoneNeedsSubmit(language(), "Europe/Berlin"), false);
  });
});
