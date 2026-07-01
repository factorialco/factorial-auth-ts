import { HttpResponse, delay, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fetchText } from "@/http";

const ENDPOINT = "https://factorial-id.example.com/data";

const server = setupServer();

describe("fetchText", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it("returns the response body", async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.text("hello")));
    expect(await fetchText(ENDPOINT, 5000)).toBe("hello");
  });

  it("throws on a non-2xx status", async () => {
    server.use(http.get(ENDPOINT, () => new HttpResponse(null, { status: 500 })));
    await expect(fetchText(ENDPOINT, 5000)).rejects.toThrow(/status 500/);
  });

  it("throws on a network error", async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.error()));
    await expect(fetchText(ENDPOINT, 5000)).rejects.toThrow(Error);
  });

  it("throws a timeout when the request exceeds the timeout", async () => {
    server.use(
      http.get(ENDPOINT, async () => {
        await delay(50);
        return HttpResponse.text("late");
      }),
    );
    await expect(fetchText(ENDPOINT, 10)).rejects.toThrow(/timed out/);
  });

  it("rejects unsupported URL schemes", async () => {
    await expect(fetchText("ftp://factorial-id.example.com/data", 5000)).rejects.toThrow(/scheme/);
  });

  it("rejects malformed URLs", async () => {
    await expect(fetchText("not a url", 5000)).rejects.toThrow(/Invalid URL/);
  });
});
