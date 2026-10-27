import { describe, expect, it } from "vitest";

import type { Transcript } from "@/lib/domain/intel";
import { isTranscriptExpired, maskExpiredTranscript } from "@/lib/data/views/transcript-expiry";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const base: Transcript = {
  id: "t1",
  contentItemId: "c1",
  text: "metin",
  segments: [{ startSec: 0, text: "metin", channel: "speech" }],
  wordCount: 9,
  isMeaningful: true,
  source: "claude_cli",
  createdAt: "2026-06-01T00:00:00.000Z",
};

describe("transcript saklama süresi (okuma)", () => {
  it("süresiz (expiresAt yok) ve süresi gelmemiş transcript olduğu gibi kalır", () => {
    expect(maskExpiredTranscript(base, NOW)).toBe(base);
    const future = { ...base, expiresAt: "2026-09-30T12:00:00.001Z" };
    expect(maskExpiredTranscript(future, NOW)).toBe(future);
  });

  it("expiresAt ≤ now ise metin ve segmentler atılır, satır kalır (purge beklenmez)", () => {
    const expired = maskExpiredTranscript({ ...base, expiresAt: "2026-09-30T12:00:00.000Z" }, NOW);
    expect(isTranscriptExpired({ expiresAt: "2026-09-30T12:00:00.000Z" }, NOW)).toBe(true);
    expect(expired.text).toBeUndefined();
    expect(expired.segments).toBeUndefined();
    expect(expired).toMatchObject({ id: "t1", wordCount: 9, expiresAt: "2026-09-30T12:00:00.000Z" });
  });
});
