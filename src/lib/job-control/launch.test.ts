/**
 * İşçi başlatıcı — `spawn` ve dosya sistemi SAHTE (gerçek süreç doğmaz, günlük dosyası yazılmaz). Sınanan: komut satırı sabit, ortam
 * izin listesinden, süreç ayrık, `stdio` boru değil; başlatılamama dalları; "işçi yaşıyor mu" kaydı.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  findUp,
  launchedWorkerAlive,
  launchWorker,
  WorkerLaunchError,
  workerLaunchProblem,
  workerLogFile,
  type LaunchDeps,
  type LaunchFs,
} from "@/lib/job-control/launch";

const ROOT = path.resolve("/srv/panel/.claude/worktrees/x");
/** `node_modules` worktree'de değil, üç dizin yukarıdaki ana depodadır. */
const LOADER = path.join(path.resolve("/srv/panel"), "node_modules", "tsx", "dist", "loader.mjs");
const NOW = new Date("2026-10-05T21:30:00.000Z");
const FD = 41;

interface FakeChild {
  pid?: number;
  on: (event: "exit" | "error", listener: () => void) => void;
  unref: () => void;
  emit: (event: "exit" | "error") => void;
}

/** Sahte süreç: olayları elle tetiklenir. */
function fakeChild(pid: number | undefined): FakeChild {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    pid,
    on: (event, listener) => void (listeners[event] ??= []).push(listener),
    unref: vi.fn(),
    emit: (event) => listeners[event]?.forEach((listener) => listener()),
  };
}

function setup(overrides: { missing?: string[]; pid?: number | undefined; openThrows?: boolean; spawnThrows?: boolean; env?: Record<string, string | undefined> } = {}) {
  const missing = overrides.missing ?? [];
  const existing = [path.join(ROOT, ".env.local"), path.join(ROOT, "scripts", "job-worker.mts"), LOADER].filter((file) => !missing.some((part) => file.includes(part)));
  const fs: LaunchFs = {
    exists: (file) => existing.includes(file),
    mkdir: vi.fn(),
    openAppend: vi.fn(() => {
      if (overrides.openThrows) throw new Error("EACCES");
      return FD;
    }),
    write: vi.fn(),
    close: vi.fn(),
  };
  const child = fakeChild("pid" in overrides ? overrides.pid : 9001);
  const spawn = vi.fn<NonNullable<LaunchDeps["spawn"]>>(() => {
    if (overrides.spawnThrows) throw new Error("EPERM");
    return child;
  });
  const deps: LaunchDeps = { spawn, fs, root: ROOT, execPath: "/usr/bin/node", env: overrides.env ?? { PATH: "/usr/bin" } };
  return { deps, spawn, fs, child };
}

const children: FakeChild[] = [];
afterEach(() => {
  // Kayıt süreç genelindedir: her test başlattığı sahte işçiyi "çıkmış" bırakır.
  for (const child of children.splice(0)) child.emit("exit");
});

describe("launchWorker", () => {
  it("komut satırı SABİTTİR: node + tsx yükleyicisi + işçi betiği + --drain; kabuk yok", () => {
    const { deps, spawn, child } = setup();
    children.push(child);
    expect(launchWorker({ now: NOW }, deps)).toEqual({ pid: 9001, logFile: "docs/isler/isci-2026-10-05.log" });
    expect(spawn).toHaveBeenCalledOnce();
    const [command, args, options] = spawn.mock.calls[0];
    expect(command).toBe("/usr/bin/node");
    expect(args).toEqual(["--conditions=react-server", "--env-file=.env.local", "--import", pathToFileURL(LOADER).href, path.join(ROOT, "scripts", "job-worker.mts"), "--drain"]);
    expect(options.shell).toBe(false);
    expect(options.cwd).toBe(ROOT);
  });

  it("süreç AYRIK başlar ve stdio boru değildir: stdin kapalı, çıktı günlük dosyasına", () => {
    const { deps, spawn, fs, child } = setup();
    children.push(child);
    launchWorker({ now: NOW }, deps);
    const options = spawn.mock.calls[0][2];
    expect(options.detached).toBe(true);
    expect(options.windowsHide).toBe(true);
    expect(options.stdio).toEqual(["ignore", FD, FD]);
    expect(JSON.stringify(options.stdio)).not.toContain("pipe");
    expect(child.unref).toHaveBeenCalledOnce();
    expect(fs.mkdir).toHaveBeenCalledWith(path.join(ROOT, "docs/isler"));
    expect(fs.openAppend).toHaveBeenCalledWith(path.join(ROOT, "docs/isler/isci-2026-10-05.log"));
    expect(fs.close).toHaveBeenCalledExactlyOnceWith(FD); // panel kendi kopyasını kapatır
  });

  it("ortam İZİN LİSTESİNDEN gelir: sırlar ve Next / Node iç değişkenleri işçiye geçmez", () => {
    const env = {
      Path: "C:\\Windows",
      SystemRoot: "C:\\Windows",
      USERPROFILE: "C:\\Users\\u",
      APPDATA: "C:\\Users\\u\\AppData\\Roaming",
      TEMP: "C:\\Temp",
      NUMBER_OF_PROCESSORS: "8",
      SUPABASE_SERVICE_ROLE_KEY: "gizli-servis",
      APIFY_TOKEN: "gizli-apify",
      CRON_SECRET: "gizli-cron",
      DATA_SOURCE: "supabase",
      OPERATOR_MODE: "local",
      LOCAL_WORKSPACE_ID: "7a3f0000-0000-4000-8000-000000000001",
      NODE_ENV: "production",
      NODE_OPTIONS: "--inspect",
      NEXT_RUNTIME: "nodejs",
      TURBOPACK: "1",
      __NEXT_PRIVATE_ORIGIN: "http://localhost:3100",
    };
    const { deps, spawn, child } = setup({ env });
    children.push(child);
    launchWorker({ now: NOW }, deps);
    expect(spawn.mock.calls[0][2].env).toEqual({
      Path: "C:\\Windows",
      SystemRoot: "C:\\Windows",
      USERPROFILE: "C:\\Users\\u",
      APPDATA: "C:\\Users\\u\\AppData\\Roaming",
      TEMP: "C:\\Temp",
      NUMBER_OF_PROCESSORS: "8",
    });
  });

  it("günlüğe yalnız başlatma satırı yazar (istek anı + süreç kimliği)", () => {
    const { deps, fs, child } = setup();
    children.push(child);
    launchWorker({ now: NOW }, deps);
    expect(fs.write).toHaveBeenCalledExactlyOnceWith(FD, "[2026-10-05T21:30:00.000Z] panel: işçi başlatıldı (pid 9001)\n");
  });

  it("başlatılamama dalları WorkerLaunchError verir ve süreç doğurmaz", () => {
    const cases: [Parameters<typeof setup>[0], string][] = [
      [{ missing: [".env.local"] }, "env_file_missing"],
      [{ missing: ["job-worker.mts"] }, "script_missing"],
      [{ missing: ["loader.mjs"] }, "tsx_missing"],
      [{ openThrows: true }, "log_unwritable"],
    ];
    for (const [overrides, code] of cases) {
      const { deps, spawn, fs } = setup(overrides);
      expect(() => launchWorker({ now: NOW }, deps), code).toThrowError(expect.objectContaining({ name: "WorkerLaunchError", code }));
      expect(spawn, code).not.toHaveBeenCalled();
      expect(fs.close, code).not.toHaveBeenCalled();
    }
  });

  it("spawn fırlatırsa ya da süreç kimliği yoksa spawn_failed; günlük tanıtıcısı yine kapanır, kayıt tutulmaz", () => {
    for (const overrides of [{ spawnThrows: true }, { pid: undefined }]) {
      const { deps, fs } = setup(overrides);
      expect(() => launchWorker({ now: NOW }, deps)).toThrowError(WorkerLaunchError);
      expect(() => launchWorker({ now: NOW }, deps)).toThrowError(expect.objectContaining({ code: "spawn_failed" }));
      expect(fs.close).toHaveBeenCalledWith(FD);
    }
    expect(launchedWorkerAlive(() => true)).toBe(false);
  });
});

describe("workerLaunchProblem (iş yazılmadan önceki denetim)", () => {
  it("dosyalar yerindeyse undefined; eksik olanın kodunu verir; süreç doğurmaz, dosya açmaz", () => {
    const ready = setup();
    expect(workerLaunchProblem(ready.deps)).toBeUndefined();
    for (const [missing, code] of [[".env.local", "env_file_missing"], ["job-worker.mts", "script_missing"], ["loader.mjs", "tsx_missing"]]) {
      const { deps, spawn, fs } = setup({ missing: [missing] });
      expect(workerLaunchProblem(deps), code).toBe(code);
      expect(spawn).not.toHaveBeenCalled();
      expect(fs.openAppend).not.toHaveBeenCalled();
    }
    expect(ready.spawn).not.toHaveBeenCalled();
    expect(ready.fs.mkdir).not.toHaveBeenCalled();
  });
});

describe("launchedWorkerAlive (bu panelin başlattığı işçi yaşıyor mu)", () => {
  it("başlatınca yaşıyor; çıkış olayıyla düşer", () => {
    expect(launchedWorkerAlive(() => true)).toBe(false);
    const { deps, child } = setup({ pid: 9101 });
    launchWorker({ now: NOW }, deps);
    expect(launchedWorkerAlive(() => true)).toBe(true);
    child.emit("exit");
    expect(launchedWorkerAlive(() => true)).toBe(false);
  });

  it("geç gelen başlatma hatası (error olayı) da kaydı düşürür", () => {
    const { deps, child } = setup({ pid: 9102 });
    launchWorker({ now: NOW }, deps);
    child.emit("error");
    expect(launchedWorkerAlive(() => true)).toBe(false);
  });

  it("çıkış olayı kaçsa bile süreç yoksa yaşamıyor sayılır ve kayıttan silinir", () => {
    const { deps, child } = setup({ pid: 9103 });
    children.push(child);
    launchWorker({ now: NOW }, deps);
    expect(launchedWorkerAlive((pid) => pid !== 9103)).toBe(false);
    expect(launchedWorkerAlive(() => true)).toBe(false); // silindi: sonraki bakışta geri gelmez
  });

  it("birden çok işçi: biri çıksa da diğeri yaşıyorsa yaşıyor", () => {
    const first = setup({ pid: 9104 });
    const second = setup({ pid: 9105 });
    children.push(first.child, second.child);
    launchWorker({ now: NOW }, first.deps);
    launchWorker({ now: NOW }, second.deps);
    second.child.emit("exit");
    expect(launchedWorkerAlive(() => true)).toBe(true);
    first.child.emit("exit");
    expect(launchedWorkerAlive(() => true)).toBe(false);
  });
});

describe("yol ve ad yardımcıları", () => {
  it("findUp yukarı yürür: worktree'den ana deponun node_modules'ünü bulur; yoksa undefined", () => {
    const rel = path.join("node_modules", "tsx", "dist", "loader.mjs");
    expect(findUp(ROOT, rel, (file) => file === LOADER)).toBe(LOADER);
    expect(findUp(ROOT, rel, () => false)).toBeUndefined();
  });

  it("günlük dosyası adı yalnız istek anının gününden türer", () => {
    expect(workerLogFile(new Date("2026-12-31T23:59:59.000Z"))).toBe("docs/isler/isci-2026-12-31.log");
  });
});
