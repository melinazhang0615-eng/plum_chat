import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeCreatorTagIds } from "../lib/creator-tags.ts";

const options = [
  { id: "tag_romance", code: "romance", display_name: "Romance", sort_order: 10 },
  { id: "tag_slow_burn", code: "slow_burn", display_name: "Slow Burn", sort_order: 20 },
];

describe("Create Tag normalization", () => {
  it("preserves IDs and migrates legacy codes and display names", () => {
    assert.deepEqual(
      normalizeCreatorTagIds(["tag_romance", "SLOW_BURN", "slow burn"], options),
      ["tag_romance", "tag_slow_burn"],
    );
  });

  it("drops unknown free text and de-duplicates matches", () => {
    assert.deepEqual(
      normalizeCreatorTagIds(["unknown", "Romance", "romance"], options),
      ["tag_romance"],
    );
  });
});
