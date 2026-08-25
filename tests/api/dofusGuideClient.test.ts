import { describe, expect, it, vi } from "vitest";
import {
  DofusGuideClient,
  DofusGuideHttpError,
  DofusGuideNetworkError,
  DofusGuidePayloadError,
} from "../../src/api/dofusGuideClient.js";

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
};

describe("DofusGuideClient", () => {
  it("parses guides while preserving the exact response bytes", async () => {
    const raw = Buffer.from(
      '[{"id":-1,"name":"Guide Principal (Mono/Multi)","label":"Bouc Ã  misÃ¨re"}]\n',
      "utf8",
    );
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(raw));
    const client = new DofusGuideClient({ fetch: fetchMock, logger: silentLogger });

    const result = await client.getGuidesDocument();

    expect(result.body.equals(raw)).toBe(true);
    expect(result.data).toEqual([
      {
        id: -1,
        name: "Guide Principal (Mono/Multi)",
        label: "Bouc Ã  misÃ¨re",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dofusguide.fr/api/tutoriel/name?dev",
      expect.objectContaining({
        headers: expect.objectContaining({
          "user-agent": "DofusGuideScraper/0.1.0 (local archival client)",
        }),
      }),
    );
  });

  it("fetches one guide step and preserves its exact response bytes", async () => {
    const raw = Buffer.from(
      '[{"id":15851,"tuto_id":-1,"name":"Guide Principal (Mono/Multi)","etape":111,"type":"TEXTE","valeur":"8. Affaires de fromage"}]\n',
      "utf8",
    );
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(raw));
    const client = new DofusGuideClient({ fetch: fetchMock, logger: silentLogger });

    const result = await client.getGuideStepDocument(-1, 111);

    expect(result.body.equals(raw)).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.etape).toBe(111);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dofusguide.fr/api/tutoriel?id=-1&etape=111",
      expect.any(Object),
    );
  });

  it("retries retryable HTTP errors with exponential backoff", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("temporary", { status: 500 }))
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(new Response('[{"id":1,"name":"Guide"}]'));
    const sleep = vi.fn(async (_milliseconds: number) => undefined);
    const client = new DofusGuideClient({ fetch: fetchMock, sleep, logger: silentLogger });

    await expect(client.getGuides()).resolves.toEqual([{ id: 1, name: "Guide" }]);
    expect(sleep.mock.calls).toEqual([[500], [1_000]]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("honors Retry-After when it is longer than the backoff", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("slow down", { status: 429, headers: { "retry-after": "2" } }),
      )
      .mockResolvedValueOnce(new Response("[]"));
    const sleep = vi.fn(async (_milliseconds: number) => undefined);
    const client = new DofusGuideClient({ fetch: fetchMock, sleep, logger: silentLogger });

    await client.getGuides();

    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("does not retry non-retryable HTTP errors", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("missing", { status: 404 }));
    const sleep = vi.fn(async (_milliseconds: number) => undefined);
    const client = new DofusGuideClient({ fetch: fetchMock, sleep, logger: silentLogger });

    await expect(client.getGuides()).rejects.toBeInstanceOf(DofusGuideHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("rejects an unexpected payload without retrying", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"id":-1}'));
    const sleep = vi.fn(async (_milliseconds: number) => undefined);
    const client = new DofusGuideClient({ fetch: fetchMock, sleep, logger: silentLogger });

    await expect(client.getGuides()).rejects.toBeInstanceOf(DofusGuidePayloadError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("aborts a request when its timeout expires", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      await new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
      throw new Error("unreachable");
    });
    const client = new DofusGuideClient({
      fetch: fetchMock,
      timeoutMs: 5,
      maxRetries: 0,
      logger: silentLogger,
    });

    await expect(client.getGuides()).rejects.toBeInstanceOf(DofusGuideNetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
