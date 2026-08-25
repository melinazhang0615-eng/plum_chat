import assert from "node:assert/strict";
import test from "node:test";

import { createCreationDraft, deleteCreationWork, listCreationWorks, publishCreationDraft, updateCreationDraft } from "../lib/api.ts";

test("Creator Character API", async (suite) => {
  const originalFetch = globalThis.fetch;
  suite.after(() => { globalThis.fetch = originalFetch; });

  await suite.test("saves a draft revision before publishing it", async () => {
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      const revision = init.method === "POST" && url.endsWith("/creator/works") ? 1 : 2;
      return new Response(JSON.stringify({
        status: "ok",
        work: {
          work_id: "work_1",
          revision,
          content: requests[0].body.content,
          moderation_status: "not_submitted",
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const content = {
      display_name: "",
      gender: "",
      portrait_media_id: "",
      portrait_position_x: 50,
      portrait_position_y: 50,
      avatar_position_x: 50,
      avatar_position_y: 50,
      intro: "",
      opening_scene: "",
      character_settings: "",
      example_dialogues: "",
      response_rules: "",
      tag_ids: [],
      creator_declared_rating: "general",
      visibility: "private",
      adult_confirmed: false,
      rights_confirmed: false,
    };

    const created = await createCreationDraft(content);
    await updateCreationDraft(created.work.work_id, created.work.revision, content);

    assert.equal(requests[0].url, "/api/v1/products/plum/creator/works");
    assert.equal(requests[1].url, "/api/v1/products/plum/creator/works/work_1");
    assert.deepEqual(requests[1].body, { expected_revision: 1, content });
  });

  await suite.test("publishes one exact saved revision", async () => {
    let request;
    globalThis.fetch = async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({
        status: "ok",
        moderation_status: "pending_review",
        draft: { work_id: "work_1", revision: 3 },
        character: null,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const result = await publishCreationDraft("work_1", 3, "publish-request-1");

    assert.equal(request.url, "/api/v1/products/plum/creator/works/work_1/publish");
    assert.deepEqual(request.body, {
      expected_revision: 3,
      idempotency_key: "publish-request-1",
    });
    assert.equal(result.moderation_status, "pending_review");
  });

  await suite.test("lists and soft-deletes Studio items", async () => {
    const requests = [];
    globalThis.fetch = async (url, init = {}) => {
      requests.push({ url, method: init.method ?? "GET" });
      return new Response(JSON.stringify(
        init.method === "DELETE" ? { status: "ok" } : { status: "ok", items: [] },
      ), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    await listCreationWorks();
    await deleteCreationWork("work_1");

    assert.deepEqual(requests, [
      { url: "/api/v1/products/plum/creator/works", method: "GET" },
      { url: "/api/v1/products/plum/creator/works/work_1", method: "DELETE" },
    ]);
  });
});
