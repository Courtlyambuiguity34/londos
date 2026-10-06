import { afterEach, expect, test, vi } from "vitest";
import { setTimeout } from "node:timers/promises";
vi.mock("server-only", () => ({}));
import { boundedBody, boundedBytes } from "../../src/server/http";

afterEach(() => vi.restoreAllMocks());
function streaming(signal?: AbortSignal, contentType = "application/json") {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://127.0.0.1/api/guest/reports", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
    signal,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return { request, controller: () => controller!, cancelled: () => cancelled };
}
for (const kind of ["json", "upload"] as const) {
  for (const reason of ["deadline", "disconnect"] as const) {
    test(`${kind} body ${reason} releases a stalled reader without accepting partial input`, async () => {
      const deadline = new AbortController(),
        caller = new AbortController();
      const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
      const s = streaming(caller.signal);
      s.controller().enqueue(new TextEncoder().encode('{"unfinished":'));
      const pending = (
        kind === "json" ? boundedBody(s.request) : boundedBytes(s.request, 8192)
      ).then(
        () => ({ resolved: true }),
        (error: unknown) => error,
      );
      (reason === "deadline" ? deadline : caller).abort();
      try {
        const outcome = await Promise.race([pending, setTimeout(80, "still_pending")]);
        expect(outcome).toMatchObject({
          status: 408,
          code: reason === "deadline" ? "request_body_timeout" : "request_body_cancelled",
        });
        expect(timeout).toHaveBeenCalledWith(15000);
        expect(s.cancelled()).toBe(true);
        expect(s.request.body!.locked).toBe(false);
      } finally {
        if (!s.cancelled()) s.controller().close();
        await pending;
      }
    });
  }
}
test("JSON reader accepts split UTF-8 within its byte bound and releases the reader", async () => {
  const s = streaming(undefined, "Application/JSON; charset=utf-8"),
    bytes = new TextEncoder().encode('{"name":"Café"}');
  const pending = boundedBody(s.request);
  s.controller().enqueue(bytes.slice(0, 13));
  s.controller().enqueue(bytes.slice(13));
  s.controller().close();
  await expect(pending).resolves.toEqual({ name: "Café" });
  expect(s.request.body!.locked).toBe(false);
});
test("JSON streaming byte overflow cancels without trusting a missing length header", async () => {
  const s = streaming();
  const pending = boundedBody(s.request);
  s.controller().enqueue(new Uint8Array(8193));
  await expect(pending).rejects.toMatchObject({ code: "request_too_large" });
  expect(s.cancelled()).toBe(true);
  expect(s.request.body!.locked).toBe(false);
});
test("JSON MIME lookalikes and malformed data are rejected", async () => {
  await expect(
    boundedBody(
      new Request("http://127.0.0.1", {
        method: "POST",
        headers: { "content-type": "application/json-malicious" },
        body: "{}",
      }),
    ),
  ).rejects.toMatchObject({ code: "json_required" });
  await expect(
    boundedBody(
      new Request("http://127.0.0.1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    ),
  ).rejects.toMatchObject({ code: "invalid_json" });
});
test("already cancelled bodies stop before consuming bytes", async () => {
  const caller = new AbortController();
  caller.abort();
  const s = streaming(caller.signal);
  s.controller().enqueue(new TextEncoder().encode("{}"));
  s.controller().close();
  await expect(boundedBody(s.request)).rejects.toMatchObject({
    status: 408,
    code: "request_body_cancelled",
  });
  expect(s.request.body!.locked).toBe(false);
});
