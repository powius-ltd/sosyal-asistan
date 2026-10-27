import { existsSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { makeBaseDir, NOW } from "@/lib/video-analysis/test-support";
import { sweepStaleTempDirs, TEMP_ROOT_NAME, tempRootDir, withTempDir } from "@/lib/video-analysis/temp-dir";

// `rmSync` ESM içe aktarması spy'lanamaz: silme hatasını taklit etmek için modül sarılır (varsayılan: gerçek davranış).
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});

const base = makeBaseDir();
afterAll(() => base.cleanup());
afterEach(() => {
  rmSync(tempRootDir(base.dir), { recursive: true, force: true }); // gerçek `rmSync` (mock yalnız temp-dir.ts'in çağrısını etkiler)
});

describe("withTempDir", () => {
  it("os.tmpdir()/panel-video/<uuid> altında klasör açar ve bitince siler", async () => {
    let seen = "";
    await withTempDir(
      async (dir) => {
        seen = dir;
        writeFileSync(path.join(dir, "video.mp4"), "x");
        expect(existsSync(dir)).toBe(true);
        expect(path.dirname(dir)).toBe(tempRootDir(base.dir));
        expect(path.basename(path.dirname(dir))).toBe(TEMP_ROOT_NAME);
      },
      { baseDir: base.dir },
    );
    expect(seen).not.toBe("");
    expect(existsSync(seen)).toBe(false);
  });

  it("işlev hata fırlatsa da klasörü siler ve hatayı aynen iletir", async () => {
    let seen = "";
    await expect(
      withTempDir(
        async (dir) => {
          seen = dir;
          writeFileSync(path.join(dir, "video.mp4"), "gizli rakip videosu");
          throw new Error("agy çöktü");
        },
        { baseDir: base.dir },
      ),
    ).rejects.toThrow("agy çöktü");
    expect(seen).not.toBe("");
    expect(existsSync(seen)).toBe(false);
  });

  it("her çağrı ayrı klasör kullanır ve sonucu döndürür", async () => {
    const [a, b] = await Promise.all([withTempDir(async (d) => d, { baseDir: base.dir }), withTempDir(async (d) => d, { baseDir: base.dir })]);
    expect(a).not.toBe(b);
  });

  it("silme başarısız olursa asıl sonucu ezmez; onCleanupError çağrılır", async () => {
    vi.mocked(rmSync).mockImplementationOnce(() => {
      throw new Error("EBUSY: resource busy");
    });
    const onCleanupError = vi.fn();
    const result = await withTempDir(async () => "tamam", { baseDir: base.dir, onCleanupError });
    expect(result).toBe("tamam");
    expect(onCleanupError).toHaveBeenCalledTimes(1);
  });

  it("silme hatası, işlevin kendi hatasını ezmez", async () => {
    vi.mocked(rmSync).mockImplementationOnce(() => {
      throw new Error("EBUSY: resource busy");
    });
    await expect(withTempDir(async () => Promise.reject(new Error("asıl hata")), { baseDir: base.dir, onCleanupError: () => undefined })).rejects.toThrow("asıl hata");
  });
});

describe("sweepStaleTempDirs", () => {
  const OLD = "11111111-1111-4111-8111-111111111111";
  const YOUNG = "22222222-2222-4222-8222-222222222222";

  function seed(name: string, ageMs: number): string {
    const dir = path.join(tempRootDir(base.dir), name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "video.mp4"), "x");
    const when = new Date(NOW.getTime() - ageMs);
    utimesSync(dir, when, when);
    return dir;
  }

  it("eşikten eski UUID klasörlerini siler; gençlere ve UUID olmayanlara dokunmaz", () => {
    const old = seed(OLD, 3 * 3600_000);
    const young = seed(YOUNG, 60_000);
    const foreign = seed("not-a-uuid", 10 * 3600_000);

    expect(sweepStaleTempDirs(3600_000, { baseDir: base.dir, now: () => NOW })).toEqual({ removed: 1, failed: 0 });
    expect(existsSync(old)).toBe(false);
    expect(existsSync(young)).toBe(true);
    expect(existsSync(foreign)).toBe(true);
    expect(readdirSync(tempRootDir(base.dir)).sort()).toEqual([YOUNG, "not-a-uuid"].sort());
  });

  it("kök hiç yoksa sessizce 0 döner", () => {
    const empty = makeBaseDir();
    try {
      expect(sweepStaleTempDirs(1000, { baseDir: empty.dir })).toEqual({ removed: 0, failed: 0 });
    } finally {
      empty.cleanup();
    }
  });
});
