import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../lib/api.ts";
import { classifyCharacterEntryFailure } from "../lib/character-entry.ts";

test("direct character links classify access failures into actionable flows", () => {
  for (const code of [
    "guest_profile_required",
    "audience_profile_required",
    "adult_confirmation_required",
  ]) {
    assert.equal(
      classifyCharacterEntryFailure(new ApiError(code, 403)),
      "audience_setup_required",
    );
  }

  assert.equal(
    classifyCharacterEntryFailure(new ApiError("mature_content_not_allowed", 403)),
    "mature_content_denied",
  );
  assert.equal(
    classifyCharacterEntryFailure(new ApiError("character not found", 404)),
    "not_available",
  );
  assert.equal(classifyCharacterEntryFailure(new Error("offline")), "other");
});
