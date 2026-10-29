import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseByteRange, videoResponse } from "@/lib/publish/video-range";

describe("parseByteRange", () => {
  it("aralık biçimlerini çözer, geçersizi reddeder", () => {
    expect(parseByteRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=0-500", 100)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange("bytes=100-", 100)).toBeUndefined();
    expect(parseByteRange("bytes=9-3", 100)).toBeUndefined();
    expect(parseByteRange("x", 100)).toBeUndefined();
  });
});

describe("videoResponse", () => {
  const file = join(mkdtempSync(join(tmpdir(), "vr-")), "a.mp4");
  writeFileSync(file, "0123456789");

  it("Range ile 206 ve doğru dilim", async () => {
    const res = videoResponse(file, "bytes=2-4");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(await res.text()).toBe("234");
  });

  it("Range yoksa 200 ve tüm dosya; aşkın aralık 416", async () => {
    const res = videoResponse(file, null);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("0123456789");
    expect(videoResponse(file, "bytes=50-").status).toBe(416);
  });
});
