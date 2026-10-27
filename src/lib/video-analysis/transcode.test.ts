import { mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { SubprocessError } from "@/lib/llm/subprocess";
import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";
import { VideoAnalysisError } from "@/lib/video-analysis/errors";
import { makeBaseDir } from "@/lib/video-analysis/test-support";
import { buildShrinkArgs, ffmpegBin, SHRINK_THRESHOLD_BYTES, shrinkVideoIfNeeded } from "@/lib/video-analysis/transcode";

const base = makeBaseDir();
afterAll(() => base.cleanup());

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(path.join(base.dir, "tc-"));
});

const MB = 1024 * 1024;

/** ffmpeg taklidi: son argüman (çıktı yolu) için `bytes` uzunlukta dosya yazar. */
function ffmpegWriting(bytes: number) {
  return createFakeSubprocess((options) => {
    const out = options.args?.[options.args.length - 1] as string;
    writeFileSync(out, Buffer.alloc(bytes, 1));
    return {};
  });
}

describe("shrinkVideoIfNeeded", () => {
  it("eşik 18 MB", () => {
    expect(SHRINK_THRESHOLD_BYTES).toBe(18 * MB);
  });

  it("eşiği aşmayan dosyaya dokunmaz: ffmpeg çağrılmaz", async () => {
    const fake = createFakeSubprocess();
    const result = await shrinkVideoIfNeeded({ fileName: "video.mp4", bytes: 18 * MB }, { dir, runner: fake.runner, env: {} });
    expect(result).toEqual({ fileName: "video.mp4", bytes: 18 * MB, shrunk: false });
    expect(fake.calls).toHaveLength(0);
  });

  it("18 MB'ı aşınca ffmpeg ile 480p'ye indirir; yeni dosyayı döndürür", async () => {
    const fake = ffmpegWriting(5 * MB);
    const result = await shrinkVideoIfNeeded({ fileName: "video.mp4", bytes: 30 * MB }, { dir, runner: fake.runner, env: {} });
    expect(result).toEqual({ fileName: "video-480p.mp4", bytes: 5 * MB, shrunk: true });

    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0];
    expect(call.command).toBe("ffmpeg");
    expect(call.cwd).toBe(dir);
    expect(call.args).toEqual(buildShrinkArgs(path.join(dir, "video.mp4"), path.join(dir, "video-480p.mp4")));
    expect(call.args).toContain("scale=-2:'min(480,ih)'"); // yalnız küçültür, büyütmez
    expect(call.args).toContain("libx264");
    const args = call.args ?? [];
    expect(args.slice(args.indexOf("-f"), args.indexOf("-i"))).toEqual(["-f", "mp4"]); // girdi biçimi -i'den önce açık
    expect(call.args?.join(" ")).not.toMatch(/\bhttps?:/); // yalnız yerel dosya yolları
  });

  it("FFMPEG_BIN varsa onu kullanır; boş değer PATH'teki ffmpeg'dir", async () => {
    expect(ffmpegBin({ FFMPEG_BIN: "C:\\tools\\ffmpeg.exe" })).toBe("C:\\tools\\ffmpeg.exe");
    expect(ffmpegBin({ FFMPEG_BIN: "  " })).toBe("ffmpeg");
    expect(ffmpegBin({})).toBe("ffmpeg");

    const fake = ffmpegWriting(1 * MB);
    await shrinkVideoIfNeeded({ fileName: "video.mp4", bytes: 30 * MB }, { dir, runner: fake.runner, env: { FFMPEG_BIN: "D:\\ff\\ffmpeg.exe" } });
    expect(fake.calls[0].command).toBe("D:\\ff\\ffmpeg.exe");
  });

  it("ffmpeg yoksa açık hata türü ffmpeg_missing", async () => {
    const runner = () => Promise.reject(new SubprocessError("spawn_failed", "Süreç başlatılamadı (ENOENT): ffmpeg"));
    await expect(shrinkVideoIfNeeded({ fileName: "video.mp4", bytes: 30 * MB }, { dir, runner, env: {} })).rejects.toMatchObject({
      name: "VideoAnalysisError",
      kind: "ffmpeg_missing",
    });
  });

  it("ffmpeg sıfır olmayan kodla çıkarsa transcode_failed", async () => {
    const fake = createFakeSubprocess({ exitCode: 1, stderr: "Invalid data found when processing input" });
    const promise = shrinkVideoIfNeeded({ fileName: "video.mp4", bytes: 30 * MB }, { dir, runner: fake.runner, env: {} });
    await expect(promise).rejects.toBeInstanceOf(VideoAnalysisError);
    await expect(promise).rejects.toMatchObject({ kind: "transcode_failed" });
  });

  it("ffmpeg çıktı üretmediyse transcode_failed", async () => {
    const fake = createFakeSubprocess({}); // başarılı çıkış ama dosya yok
    await expect(shrinkVideoIfNeeded({ fileName: "video.mp4", bytes: 30 * MB }, { dir, runner: fake.runner, env: {} })).rejects.toMatchObject({
      kind: "transcode_failed",
    });
  });

  it("küçültülmüş dosya özgünden büyükse özgün kalır", async () => {
    const fake = ffmpegWriting(40 * MB);
    const result = await shrinkVideoIfNeeded({ fileName: "video.mp4", bytes: 30 * MB }, { dir, runner: fake.runner, env: {} });
    expect(result).toEqual({ fileName: "video.mp4", bytes: 30 * MB, shrunk: false });
  });

  it("eşik geçersiz kılınabilir (test/sınır ayarı)", async () => {
    const fake = ffmpegWriting(100);
    const result = await shrinkVideoIfNeeded({ fileName: "video.mp4", bytes: 1000 }, { dir, runner: fake.runner, env: {}, thresholdBytes: 500 });
    expect(result.shrunk).toBe(true);
  });
});
