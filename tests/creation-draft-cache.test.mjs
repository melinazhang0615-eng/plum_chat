import assert from "node:assert/strict";
import test from "node:test";

import {
  creationDraftStorageKey,
  LEGACY_CREATION_DRAFT_STORAGE_KEY,
} from "../lib/creation-draft-cache.ts";

test("Creation browser draft cache", async (suite) => {
  await suite.test("isolates a new draft by member", () => {
    assert.notEqual(
      creationDraftStorageKey("member-a"),
      creationDraftStorageKey("member-b"),
    );
    assert.equal(creationDraftStorageKey("member-a"), "plum.create.v2.member-a.new");
  });

  await suite.test("isolates saved Works from the next new character", () => {
    const newDraft = creationDraftStorageKey("member-a");
    const savedWork = creationDraftStorageKey("member-a", "work-1");

    assert.notEqual(savedWork, newDraft);
    assert.equal(savedWork, "plum.create.v2.member-a.work.work-1");
  });

  await suite.test("does not reuse the former global key", () => {
    assert.notEqual(creationDraftStorageKey("member-a"), LEGACY_CREATION_DRAFT_STORAGE_KEY);
  });
});
