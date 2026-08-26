import assert from "node:assert/strict";
import test from "node:test";

import { preferenceToFeedGender, profileAllowsMature } from "../lib/audience-policy.ts";

function profile(age_band, status = "accepted") {
  return { age_band, relationship_preference: null, genres: [], age_declaration: { status, version: "test", accepted_at: "2026-08-25" } };
}

test("only accepted adult age segments allow mature content", () => {
  for (const ageBand of ["35_plus", "25_34", "18_24", "18_20"]) {
    assert.equal(profileAllowsMature(profile(ageBand)), true);
  }
  assert.equal(profileAllowsMature(profile("14_17")), false);
  assert.equal(profileAllowsMature(profile("13_or_younger")), false);
  assert.equal(profileAllowsMature(profile("not_collected")), false);
  assert.equal(profileAllowsMature(profile("18_24", "pending")), false);
  assert.equal(profileAllowsMature(null), false);
});

test("only concrete character preferences become feed gender filters", () => {
  assert.equal(preferenceToFeedGender("female"), "female");
  assert.equal(preferenceToFeedGender("non_binary"), "non_binary");
  assert.equal(preferenceToFeedGender("no_preference"), null);
  assert.equal(preferenceToFeedGender(null), null);
});
