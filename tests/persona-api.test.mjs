import assert from "node:assert/strict";
import test from "node:test";

import {
  createConversation,
  createPersona,
  deletePersona,
  getPersona,
  listPersonas,
  setDefaultPersona,
  updatePersona,
} from "../lib/api.ts";

test("Persona API uses the owner-scoped CRUD routes", async (suite) => {
  const originalFetch = globalThis.fetch;
  suite.after(() => { globalThis.fetch = originalFetch; });

  await suite.test("lists, reads, creates and edits Personas", async () => {
    const requests = [];
    globalThis.fetch = async (url, init = {}) => {
      requests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body) : null,
      });
      const payload = url.endsWith("/personas") && !init.method
        ? { status: "ok", items: [] }
        : { status: "ok", persona: { id: "persona_1" } };
      return new Response(JSON.stringify(payload), {
        status: init.method === "POST" ? 201 : 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await listPersonas();
    await getPersona("persona / 1");
    await createPersona({ display_name: "Rowan", description: "A guide", is_default: true });
    await updatePersona("persona_1", { display_name: "Robin", description: "A guide" });

    assert.deepEqual(requests, [
      { url: "/api/v1/products/plum/personas", method: "GET", body: null },
      { url: "/api/v1/products/plum/personas/persona%20%2F%201", method: "GET", body: null },
      { url: "/api/v1/products/plum/personas", method: "POST", body: { display_name: "Rowan", description: "A guide", is_default: true } },
      { url: "/api/v1/products/plum/personas/persona_1", method: "PATCH", body: { display_name: "Robin", description: "A guide" } },
    ]);
  });

  await suite.test("sets a default and soft-deletes through explicit mutations", async () => {
    const requests = [];
    globalThis.fetch = async (url, init = {}) => {
      requests.push({ url, method: init.method });
      return new Response(JSON.stringify({ status: "ok", persona: { id: "persona_1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await setDefaultPersona("persona_1");
    await deletePersona("persona_1");

    assert.deepEqual(requests, [
      { url: "/api/v1/products/plum/personas/persona_1/default", method: "PUT" },
      { url: "/api/v1/products/plum/personas/persona_1", method: "DELETE" },
    ]);
  });

  await suite.test("opens the character story for an explicitly selected Persona", async () => {
    const requests = [];
    globalThis.fetch = async (url, init = {}) => {
      requests.push({ url, method: init.method, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({
        status: "ok",
        conversation: { id: "conv_persona_2" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    await createConversation("char_1", "persona_2");

    assert.deepEqual(requests, [{
      url: "/api/v1/products/plum/conversations",
      method: "POST",
      body: { character_id: "char_1", persona_id: "persona_2" },
    }]);
  });
});
