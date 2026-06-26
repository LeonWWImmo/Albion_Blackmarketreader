import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson, ApiError } from "./apiClient";

// Block 2 (Verfügbarkeit / DoS-Schutz): Verhalten des zentralen API-Clients
// bei Rate-Limit/Ueberlast (429/503) – respektiert Retry-After, deckelt das
// Backoff und liefert im Normalfall sauber JSON.

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchJson – Backoff/Verfügbarkeit (Block 2)", () => {
  it("liefert JSON bei Status 200", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    await expect(fetchJson("/data/x.json", { dedupeKey: "ok" })).resolves.toEqual({ ok: 1 });
  });

  it("setzt retryAfterMs aus dem Retry-After-Header bei 429", async () => {
    fetchMock.mockResolvedValue(
      new Response("rate limited", { status: 429, headers: { "retry-after": "2" } })
    );
    await expect(fetchJson("/x", { retries: 0, dedupeKey: "ra" })).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 2000,
    });
  });

  it("deckelt sehr grosse Retry-After-Werte auf 5000ms", async () => {
    fetchMock.mockResolvedValue(
      new Response("", { status: 429, headers: { "retry-after": "999" } })
    );
    await expect(fetchJson("/y", { retries: 0, dedupeKey: "cap" })).rejects.toMatchObject({
      retryAfterMs: 5000,
    });
  });

  it("wirft ApiError mit Status bei sonstigen Fehlern (ohne retryAfterMs)", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    const err = await fetchJson("/missing", { retries: 0, dedupeKey: "404" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).retryAfterMs).toBeUndefined();
  });
});
