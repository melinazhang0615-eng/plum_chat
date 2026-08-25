import assert from "node:assert/strict";
import test from "node:test";

import { characterShareUrl } from "../lib/character-share.ts";

test("character sharing uses a canonical character URL without conversation state", () => {
  assert.equal(
    characterShareUrl("https://plum.top", "char/with spaces"),
    "https://plum.top/chat/char%2Fwith%20spaces",
  );
});
