import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { runSubprocess, SubprocessError } from "@/lib/llm/subprocess";
import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";
import { extractFrames, FRAME_LONG_EDGE, MAX_FRAMES, planFrameTimes, probeDurationSec, scaleFilter } from "@/lib/video-analysis/frames";
import { makeBaseDir } from "@/lib/video-analysis/test-support";

const base = makeBaseDir();
afterAll(() => base.cleanup());

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(path.join(base.dir, "fr-"));
});

/** Her ffmpeg çağrısında son argümana (hedef dosya) bir "JPEG" yazan sahte çalıştırıcı. */
function writingFfmpeg(options: { skip?: (index: number) => boolean } = {}) {
  let n = 0;
  return createFakeSubprocess((call) => {
    const index = n++;
    if (!options.skip?.(index)) writeFileSync(String(call.args?.at(-1)), "jpg");
    return {};
  });
}

describe("planFrameTimes", () => {
  it("uzun videoda en çok 12 kare; ilk 3 sn sık (4 kare), kalanı 3 sn'den sona eşit aralıklı, sıralı", () => {
    const times = planFrameTimes(60);
    expect(times).toHaveLength(MAX_FRAMES);
    expect(times.slice(0, 4)).toEqual([0, 0.75, 1.5, 2.25]);
    const rest = times.slice(4);
    expect(rest).toHaveLength(8);
    expect(rest[0]).toBeGreaterThan(3);
    expect(rest.at(-1)).toBeLessThan(60);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("çok uzun videoda da 12'yi aşmaz", () => {
    expect(planFrameTimes(3600)).toHaveLength(MAX_FRAMES);
  });

  it("kısa videoda kare sayısı süreyle sınırlı, hepsi video içinde", () => {
    const times = planFrameTimes(2);
    expect(times.length).toBeLessThanOrEqual(4);
    expect(times.every((t) => t >= 0 && t < 2)).toBe(true);
    expect(planFrameTimes(0.2)).toEqual([0]);
  });

  it("süre geçersizse tek kare (0. sn)", () => {
    expect(planFrameTimes(Number.NaN)).toEqual([0]);
    expect(planFrameTimes(-5)).toEqual([0]);
  });
});

describe("extractFrames (sahte ffmpeg)", () => {
  it("12 kare ister, dosyaları sıralı adla ve zamanıyla döndürür; tek çağrı = tek kare, ölçek süzgeci uzun kenarı sınırlar", async () => {
    const fake = writingFfmpeg();
    const result = await extractFrames({ filePath: "/x/video.mp4", dir, durationSec: 30 }, { runner: fake.runner, env: {} });
    expect(result.frames).toHaveLength(12);
    expect(result.frames[0]).toEqual({ fileName: "frame-01.jpg", timeSec: 0 });
    expect(result.frames[11].fileName).toBe("frame-12.jpg");
    expect(fake.calls).toHaveLength(12);
    const args = fake.calls[0].args ?? [];
    expect(args).toContain("-frames:v");
    expect(args[args.indexOf("-vf") + 1]).toBe(scaleFilter());
    expect(scaleFilter()).toContain(String(FRAME_LONG_EDGE));
    expect(readdirSync(dir)).toHaveLength(12);
  });

  it("kare üretmeyen zaman atlanır; hiç kare yoksa frames_failed", async () => {
    const some = writingFfmpeg({ skip: (i) => i === 3 });
    const result = await extractFrames({ filePath: "/x/v.mp4", dir, durationSec: 30 }, { runner: some.runner, env: {} });
    expect(result.frames).toHaveLength(11);

    const none = createFakeSubprocess({ exitCode: 1, stderr: "hata" });
    await expect(extractFrames({ filePath: "/x/v.mp4", dir, durationSec: 30 }, { runner: none.runner, env: {} })).rejects.toMatchObject({ kind: "frames_failed" });
  });

  it("ffmpeg yoksa ffmpeg_missing; FFMPEG_BIN kullanılır", async () => {
    const runner = () => Promise.reject(new SubprocessError("spawn_failed", "ENOENT"));
    await expect(extractFrames({ filePath: "/x/v.mp4", dir, durationSec: 10 }, { runner, env: {} })).rejects.toMatchObject({ kind: "ffmpeg_missing" });
    const fake = writingFfmpeg();
    await extractFrames({ filePath: "/x/v.mp4", dir, durationSec: 10 }, { runner: fake.runner, env: { FFMPEG_BIN: "/opt/ffmpeg" } });
    expect(fake.calls[0].command).toBe("/opt/ffmpeg");
  });

  it("süre verilmezse ffprobe ile okunur; okunamazsa frames_failed", async () => {
    const probe = createFakeSubprocess({ stdout: "12.5\n" });
    await expect(probeDurationSec("/x/v.mp4", { runner: probe.runner, env: { FFPROBE_BIN: "/opt/ffprobe" } })).resolves.toBe(12.5);
    expect(probe.calls[0].command).toBe("/opt/ffprobe");

    const bad = createFakeSubprocess({ stdout: "N/A\n" });
    await expect(probeDurationSec("/x/v.mp4", { runner: bad.runner, env: {} })).rejects.toMatchObject({ kind: "frames_failed" });
  });
});

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"]).status === 0;

describe.skipIf(!ffmpegAvailable)("extractFrames (GERÇEK ffmpeg: testsrc + sine, 5 sn)", () => {
  it("videodan küçük JPEG kareleri çıkarır (≤ 12, uzun kenar ≤ 768)", async () => {
    const video = path.join(dir, "video.mp4");
    const made = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=5:size=1280x720:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:duration=5", "-shortest", video]);
    expect(made.status).toBe(0);

    const result = await extractFrames({ filePath: video, dir }, { runner: runSubprocess, env: {} });
    expect(result.durationSec).toBeGreaterThan(4.5);
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.frames.length).toBeLessThanOrEqual(MAX_FRAMES);
    for (const frame of result.frames) {
      const file = path.join(dir, frame.fileName);
      expect(statSync(file).size).toBeGreaterThan(500);
      const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]);
      const [width, height] = probe.stdout.toString().trim().split(",").map(Number);
      expect(Math.max(width, height)).toBeLessThanOrEqual(FRAME_LONG_EDGE);
      expect(width).toBeGreaterThan(height);
    }
  });
});
