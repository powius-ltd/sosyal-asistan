/**
 * Uçtan uca güvenlik sınaması: action → GERÇEK başlatıcı (`launch.ts`) → SAHTE `spawn`. İstekten gelen hiçbir değer komut satırına ya da
 * ortama girmez; süreç ayrık başlar, `stdio` boru değildir; dürtme idempotenttir. Gerçek süreç doğmaz, günlük dosyası yazılmaz (dosya
 * sisteminin yazan çağrıları sahtedir).
 */
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawn, opened, getPanelContext } = vi.hoisted(() => ({ spawn: vi.fn(), opened: [] as string[], getPanelContext: vi.fn() }));

vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return { ...original, default: { ...original, spawn }, spawn };
});
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  const fake = {
    // İşçinin sır dosyası worktree'de olmayabilir: var say. Diğer her şey gerçek diske bakar (işçi betiği, tsx yükleyicisi).
    existsSync: (file: import("node:fs").PathLike) => String(file).endsWith(".env.local") || original.existsSync(file),
    mkdirSync: () => undefined,
    openSync: (file: import("node:fs").PathLike) => opened.push(String(file)) + 100,
    writeSync: () => 0,
    closeSync: () => undefined,
  };
  return { ...original, ...fake, default: { ...original, ...fake } };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/data")>()), getPanelContext }));
vi.mock("@/lib/workspace/registry", () => ({ listWorkspaces: vi.fn(async () => []) }));

import { kickWorkerAction, requestJobAction } from "@/app/actions/jobs";
import { createMockRepository, type MockPanelRepository } from "@/lib/data/mock/mock-repository";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

const NOW = new Date("2026-10-05T08:15:00.000Z");
/** İstekten gelen değerler: komut satırını ve ortamı DEĞİŞTİRMEMELİ. */
const WEEK = "2026-10-12";
const AMOUNT = 1.37;
const LIMIT = 23;

interface FakeChild {
  pid: number;
  on: (event: string, listener: () => void) => void;
  unref: () => void;
  exit: () => void;
}
const children: FakeChild[] = [];
let repo: MockPanelRepository;

beforeEach(() => {
  vi.clearAllMocks();
  opened.length = 0;
  // Sahte işçi: süreç kimliği test sürecininkidir ("yaşıyor" denetimi gerçek süreç tablosuna bakar), çıkışı elle tetiklenir.
  spawn.mockImplementation(() => {
    const listeners: Record<string, (() => void)[]> = {};
    const child: FakeChild = {
      pid: process.pid,
      on: (event, listener) => void (listeners[event] ??= []).push(listener),
      unref: vi.fn(),
      exit: () => listeners.exit?.forEach((listener) => listener()),
    };
    children.push(child);
    return child;
  });
  repo = createMockRepository(undefined, { jobQueue: "test-k-spawn" });
  getPanelContext.mockImplementation(async () => ({ repo, wsId: WS, now: new Date(NOW) }));
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("OPERATOR_MODE", "local");
  vi.stubEnv("DATA_SOURCE", "supabase");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "gizli-servis-anahtari");
  vi.stubEnv("APIFY_TOKEN", "gizli-apify");
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("__NEXT_PRIVATE_ORIGIN", "http://localhost:3103");
});

afterEach(() => {
  for (const child of children.splice(0)) child.exit(); // kayıt süreç genelindedir: geride "yaşayan" işçi kalmasın
  vi.unstubAllEnvs();
});

const root = process.cwd();
const FIXED_TAIL = [path.join(root, "scripts", "job-worker.mts"), "--drain"];

describe("action → başlatıcı → spawn", () => {
  it("istekten gelen HİÇBİR değer komut satırına / ortama girmez; argümanlar her istekte aynıdır", async () => {
    expect((await requestJobAction({ kind: "plan", week: WEEK })).ok).toBe(true);
    const first = spawn.mock.calls[0];
    children[0].exit();
    await repo.cancelJob(WS, (await repo.listJobs(WS, { active: true }))[0].id);
    expect((await requestJobAction({ kind: "collect", limit: LIMIT, approval: { basis: "one_time", maxUsd: AMOUNT } })).ok).toBe(true);
    const second = spawn.mock.calls[1];

    expect(spawn).toHaveBeenCalledTimes(2);
    // Komut satırı yalnız proje kökünden ve tsx yükleyicisinin yolundan kurulur: altı sabit argüman, başka hiçbir şey.
    expect(first[0]).toBe(process.execPath);
    expect(first[1]).toHaveLength(6);
    expect(first[1].slice(0, 3)).toEqual(["--conditions=react-server", "--env-file=.env.local", "--import"]);
    expect(first[1][3]).toMatch(/^file:\/\/.*\/node_modules\/tsx\/dist\/loader\.mjs$/);
    expect(first[1].slice(4)).toEqual(FIXED_TAIL);
    // Tür, parametre ve tutar değişti; komut satırı değişmedi.
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toEqual(first[1]);
    // Ortamdaki her değer panel sürecinin kendi ortamından gelir: istekten türeyen değer yoktur.
    for (const call of [first, second]) {
      for (const [name, value] of Object.entries(call[2].env as Record<string, string>)) expect(process.env[name], name).toBe(value);
    }
  });

  it("süreç ayrık, penceresiz, kabuksuz; stdio boru değil (çıktı günlük dosyasına); ortam izin listesinden", async () => {
    await requestJobAction({ kind: "analyze" });
    const options = spawn.mock.calls[0][2];
    expect(options).toMatchObject({ detached: true, windowsHide: true, shell: false, cwd: root });
    expect(options.stdio).toEqual(["ignore", 101, 101]);
    expect(opened).toEqual([path.join(root, "docs/isler/isci-2026-10-05.log")]);
    expect(children[0].unref).toHaveBeenCalledOnce();

    const names = Object.keys(options.env).map((name) => name.toUpperCase());
    expect(names).toContain("PATH");
    for (const blocked of ["SUPABASE_SERVICE_ROLE_KEY", "APIFY_TOKEN", "NODE_OPTIONS", "NODE_ENV", "NEXT_RUNTIME", "__NEXT_PRIVATE_ORIGIN", "DATA_SOURCE", "OPERATOR_MODE", "VERCEL"]) {
      expect(names, blocked).not.toContain(blocked);
    }
    expect(JSON.stringify(options.env)).not.toContain("gizli");
  });

  it("dürtme idempotent: işçi yaşarken yeni süreç doğmaz; çıkınca (iş hâlâ sıradaysa) yeniden başlar; iş satırı değişmez", async () => {
    await requestJobAction({ kind: "analyze" });
    const before = await repo.listJobs(WS, { active: true });
    expect(spawn).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 3; i += 1) expect(await kickWorkerAction()).toEqual({ ok: true, started: false });
    expect(spawn).toHaveBeenCalledTimes(1);

    children[0].exit(); // işçi iş alamadan çıktı (ya da öldü)
    expect(await kickWorkerAction()).toEqual({ ok: true, started: true });
    expect(await kickWorkerAction()).toEqual({ ok: true, started: false });
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[1][1]).toEqual(spawn.mock.calls[0][1]);
    expect(await repo.listJobs(WS, { active: true })).toEqual(before);
  });

  it("geçersiz ya da reddedilen istek süreç doğurmaz", async () => {
    await requestJobAction({ kind: "analyze; calc.exe" });
    await requestJobAction({ kind: "analyze", args: ["--watch"] });
    await requestJobAction({ kind: "collect", approval: { basis: "one_time", maxUsd: 2.5 } });
    vi.stubEnv("OPERATOR_MODE", "off");
    await requestJobAction({ kind: "analyze" });
    await kickWorkerAction();
    expect(spawn).not.toHaveBeenCalled();
  });
});
