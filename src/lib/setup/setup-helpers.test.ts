import { describe, expect, it } from "vitest";

import { backupFileName, backupsToDelete, isBackupDue } from "./backup";
import { hasZernioKey, planDaily, workerNodeArgs } from "./daily-plan";
import { upsertEnv } from "./env-file";
import { buildPushArgs, maskDbUrl, orderMigrations, splitDbUrl } from "./migrations";

describe("upsertEnv", () => {
  it("var olan satırı günceller, yorum ve öteki satırlara dokunmaz", () => {
    const out = upsertEnv("# LOCAL_USER_ID=eski\nAPIFY_TOKEN=a\nLOCAL_USER_ID=x\n", { LOCAL_USER_ID: "y", LOCAL_WORKSPACE_ID: "w" });
    expect(out).toBe("# LOCAL_USER_ID=eski\nAPIFY_TOKEN=a\nLOCAL_USER_ID=y\nLOCAL_WORKSPACE_ID=w\n");
  });
  it("boş dosyada kurar, CRLF'yi korur", () => {
    expect(upsertEnv("", { A: "1" })).toBe("A=1\n");
    expect(upsertEnv("B=2\r\n", { A: "1" })).toBe("B=2\r\nA=1\r\n");
  });
  it("geçersiz ad ya da çok satırlı değeri reddeder", () => {
    expect(() => upsertEnv("", { "a b": "1" })).toThrow();
    expect(() => upsertEnv("", { A: "1\n2" })).toThrow();
  });
});

describe("migrations", () => {
  it("sıralar, kötü adı ve çift numarayı reddeder", () => {
    expect(orderMigrations(["0002_b.sql", "0001_a.sql", "notlar.txt"])).toEqual(["0001_a.sql", "0002_b.sql"]);
    expect(() => orderMigrations(["x.sql"])).toThrow();
    expect(() => orderMigrations(["0001_a.sql", "0001_b.sql"])).toThrow();
  });
  it("parolayı maskeler, komutu kabuksuz kurar", () => {
    expect(maskDbUrl("postgresql://postgres:gizli@db.x.co:5432/postgres")).not.toContain("gizli");
    expect(buildPushArgs("postgresql://u@h:5432/d", true)).toEqual(["-y", "supabase@2.118.0", "db", "push", "--db-url=postgresql://u@h:5432/d", "--yes", "--dry-run"]);
    expect(buildPushArgs("postgresql://u@h:5432/d", false)).toContain("--yes");
    expect(() => buildPushArgs("http://x", false)).toThrow();
    expect(() => maskDbUrl("saçma")).toThrow();
  });
});

describe("splitDbUrl", () => {
  it("parolayı adresten ayırır: argümanda / çıktıda parola yok, PGPASSWORD'de çözülmüş hâli var", () => {
    const { url, env } = splitDbUrl(["postgresql://kullanici", "p%40s%23s%2Fx@sunucu:5432/postgres"].join(":"));
    expect(url).toBe("postgresql://kullanici@sunucu:5432/postgres");
    expect(env).toEqual({ PGPASSWORD: "p@s#s/x" });
    const shown = [url, ...buildPushArgs(url, false)].join(" ");
    expect(shown).not.toMatch(/p%40s|p@s|gizli/);
  });
  it("parolasız adreste PGPASSWORD yazmaz, geçersiz adresi reddeder", () => {
    expect(splitDbUrl("postgresql://u@h:5432/d").env).toEqual({});
    expect(() => splitDbUrl("saçma")).toThrow();
  });
});

describe("yedek", () => {
  const now = new Date("2026-10-27T10:00:00Z");
  it("dosya adı ve zamanı", () => {
    expect(backupFileName(now)).toBe("yedek-2026-10-27.dump");
    expect(isBackupDue([], now)).toBe(true);
    expect(isBackupDue(["yedek-2026-10-21.dump"], now)).toBe(false);
    expect(isBackupDue(["yedek-2026-10-20.dump", "baska.txt"], now)).toBe(true);
  });
  it("son 4'ü tutar, yabancı dosyaya dokunmaz", () => {
    const files = ["yedek-2026-10-01.dump", "yedek-2026-10-08.dump", "yedek-2026-10-15.dump", "yedek-2026-10-22.dump", "yedek-2026-10-29.dump", "notlarim.txt"];
    expect(backupsToDelete(files)).toEqual(["yedek-2026-10-01.dump"]);
    expect(backupsToDelete(files.slice(0, 4))).toEqual([]);
  });
});

describe("günlük plan", () => {
  it("AGENT_AUTO ajanı, yoksa zinciri seçer; Zernio varsa ölçüm", () => {
    expect(planDaily({ AGENT_AUTO: "on", CYCLE_AUTO: "on", ZERNIO_API_KEY_X: "k" }, { dryRun: false }).steps).toEqual(["agent", "worker", "measure", "backup"]);
    expect(planDaily({ CYCLE_AUTO: "on" }, { dryRun: false }).steps).toEqual(["cycle", "worker", "backup"]);
  });
  it("ikisi de kapalıyken gerçek koşuda tur yok (not düşer), kuru koşuda zincir bakılır", () => {
    const real = planDaily({}, { dryRun: false });
    expect(real.steps).toEqual(["backup"]);
    expect(real.notes.join(" ")).toContain("atlandı");
    expect(planDaily({}, { dryRun: true }).steps[0]).toBe("cycle");
  });
  it("işçi adımı turdan sonra gelir; kuru koşuda ve tursuz planda yoktur", () => {
    expect(planDaily({ AGENT_AUTO: "on" }, { dryRun: false }).steps).toEqual(["agent", "worker", "backup"]);
    expect(planDaily({ AGENT_AUTO: "on" }, { dryRun: true }).steps).toEqual(["agent", "backup"]);
    expect(planDaily({}, { dryRun: true }).steps).not.toContain("worker");
    expect(planDaily({}, { dryRun: false }).steps).not.toContain("worker");
  });
  it("işçi argümanları sabittir: drain, tsx yükleyicisi, kabuksuz", () => {
    const args = workerNodeArgs("/k/panel");
    expect(args.at(-1)).toBe("--drain");
    expect(args).toContain("scripts/job-worker.mts");
    expect(args.join(" ")).toContain("file:///k/panel/node_modules/tsx/dist/loader.mjs");
  });
  it("Zernio anahtarı yalnız dolu değerle sayılır", () => {
    expect(hasZernioKey({ ZERNIO_API_KEY: "" })).toBe(false);
    expect(hasZernioKey({ ZERNIO_API_KEY: "k" })).toBe(true);
  });
});
