import assert from "node:assert/strict";
import test from "node:test";

import { ApiError, sendTurnStream, StreamProtocolError } from "../lib/api.ts";

const encoder = new TextEncoder();

function streamingResponse(chunks, status = 200) {
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  }), {
    status,
    headers: { "Content-Type": status === 200 ? "text/event-stream" : "application/json" },
  });
}

test("Plum SSE client", async (suite) => {
  const originalFetch = globalThis.fetch;
  suite.after(() => { globalThis.fetch = originalFetch; });

  await suite.test("decodes UTF-8 across chunks, CRLF records, and ignores unknown events", async () => {
    const body = [
      "event: turn.accepted\r\ndata: {\"version\":1,\"turn_id\":\"turn_1\",\"request_id\":\"req_1\",\"model_profile\":\"fast\",\"reserved_coins\":1}\r\n\r\n",
      "event: ping\r\ndata: {\"server_time\":\"now\"}\r\n\r\n",
      "event: message.delta\r\ndata: {\"version\":1,\"turn_id\":\"turn_1\",\"seq\":1,\"text\":\"你好\"}\r\n\r\n",
      "event: turn.completed\r\ndata: {\"version\":1,\"turn_id\":\"turn_1\",\"message_id\":\"msg_1\",\"finish_reason\":\"stop\",\"charged_coins\":1,\"wallet\":{\"balance\":999,\"balance_micros\":999000000,\"unit\":\"shell\"},\"deduplicated\":false}\r\n\r\n",
    ].join("");
    const bytes = encoder.encode(body);
    const chineseStart = bytes.findIndex((byte) => byte === 0xe4);
    const cuts = [17, chineseStart + 1, chineseStart + 4, bytes.length - 3];
    const chunks = [];
    let start = 0;
    for (const end of cuts) {
      chunks.push(bytes.slice(start, end));
      start = end;
    }
    chunks.push(bytes.slice(start));
    globalThis.fetch = async () => streamingResponse(chunks);

    const events = [];
    await sendTurnStream({
      conversationId: "conv_1",
      text: "hello",
      requestId: "req_1",
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    });

    assert.deepEqual(events.map((event) => event.type), ["turn.accepted", "message.delta", "turn.completed"]);
    assert.equal(events[1].text, "你好");
  });

  await suite.test("rejects a stream that closes without a terminal event", async () => {
    globalThis.fetch = async () => streamingResponse([
      encoder.encode("event: message.delta\ndata: {\"version\":1,\"turn_id\":\"turn_1\",\"seq\":1,\"text\":\"partial\"}\n\n"),
    ]);
    await assert.rejects(
      sendTurnStream({
        conversationId: "conv_1",
        text: "hello",
        requestId: "req_1",
        signal: new AbortController().signal,
        onEvent: () => {},
      }),
      (error) => error instanceof StreamProtocolError && error.code === "STREAM_TRUNCATED",
    );
  });

  await suite.test("preserves pre-stream HTTP status and detail", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: "insufficient_coins" }), {
      status: 402,
      headers: { "Content-Type": "application/json" },
    });
    await assert.rejects(
      sendTurnStream({
        conversationId: "conv_1",
        text: "hello",
        requestId: "req_1",
        signal: new AbortController().signal,
        onEvent: () => {},
      }),
      (error) => error instanceof ApiError && error.status === 402 && error.message === "insufficient_coins",
    );
  });
});
