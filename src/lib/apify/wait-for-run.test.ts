import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, runEnvelope } from "@/lib/apify/test-support";
import { waitForRun } from "@/lib/apify/wait-for-run";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("APIFY_TOKEN", "apify_api_test-token-not-real");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("waitForRun (yalnız yerel script/test)", () => {
  it("bitene kadar yoklar ve bitmiş koşuyu döndürür", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(runEnvelope({ status: "RUNNING" })))
      .mockResolvedValueOnce(jsonResponse(runEnvelope({ status: "SUCCEEDED", usageTotalUsd: 0.01 })));

    const pending = waitForRun("apifyRun1", { pollMs: 1_000, timeoutMs: 60_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await pending;

    expect(result.timedOut).toBe(false);
    expect(result.run).toMatchObject({ status: "SUCCEEDED", usageTotalUsd: 0.01 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("zaman aşımında koşuyu ABORT eder (yalnız beklemeyi bırakmaz)", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/abort")
        ? jsonResponse(runEnvelope({ status: "ABORTING" }))
        : jsonResponse(runEnvelope({ status: "RUNNING" })),
    );

    const pending = waitForRun("apifyRun1", { pollMs: 1_000, timeoutMs: 2_500 });
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;

    expect(result.timedOut).toBe(true);
    expect(result.run.status).toBe("ABORTED");
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/abort") && init?.method === "POST")).toBe(true);
  });
});
