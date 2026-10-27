/**
 * İşçi başlatıcı: panel sürecinden AYRIK alt süreç (`scripts/job-worker.mts --drain`). Panel işi KOŞTURMAZ; yalnız işçiyi doğurur, işçi
 * işi DB'den alır. Tarif ölçülmüştür (plan `docs/PANEL-KONTROL-PLAN.md` §6 "Ayrık süreç denemesi"); değiştirme:
 *  - `node --import <tsx loader>` (tsx CLI DEĞİL: CLI iki süreç doğurur, `pid` sarmalayıcının olur ve konsol penceresi açar);
 *  - yol çözümü çalışma dizininden YUKARI yürür (`require.resolve` Turbopack altında yol değil modül kimliği döndürür; worktree'de
 *    `node_modules` üst dizindedir);
 *  - `detached: true` (yoksa işçi sunucuyla ölür) ve `stdio` dosyaya (boru olursa sunucu ölünce ilk yazımda `EPIPE`);
 *  - ortam İZİN LİSTESİNDEN (`buildChildEnv`): `NODE_ENV`, `NEXT_RUNTIME`, `TURBOPACK`, `__NEXT_PRIVATE_*`, `NODE_OPTIONS` ve `.env.local`
 *    sırları işçiye MİRAS KALMAZ; işçi sırlarını kendi `--env-file`'ından okur.
 * GÜVENLİK: komut satırı ve ortam SABİTTİR. Bu modülün girdisi yalnız istek anıdır (`now`: günlük dosyasının adı); iş kimliği, tür,
 * çalışma alanı, tutar gibi istekten gelen HİÇBİR değer buraya ulaşamaz (imzada yeri yoktur). Kabuk kullanılmaz.
 * Dürtme idempotenttir: fazla işçi iş alamaz (`claim_panel_job`) ve çıkar. `launchedWorkerAlive` yalnız gereksiz süreç doğurmamak içindir.
 */
import "server-only";

import { spawn as nodeSpawn, type SpawnOptions } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, writeSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { JOB_WORKER_MODES, JOB_WORKER_SCRIPT } from "@/lib/domain/panel-job";
import { projectRoot } from "@/lib/job-control/availability";
import { buildChildEnv } from "@/lib/llm/subprocess";

/** İşçi günlüklerinin klasörü (proje köküne göre; `.gitignore`'da: rakip metni / harcama içerebilir, commit edilmez). */
export const JOB_LOG_DIR = "docs/isler";
/** İşçinin sırlarını okuduğu dosya (proje köküne göre; betiklerle aynı: `npm run worker`). */
const WORKER_ENV_FILE = ".env.local";
const TSX_LOADER = path.join("node_modules", "tsx", "dist", "loader.mjs");
/** `CHILD_ENV_ALLOWED`'a ek sistem değişkeni (plan §6 listesindeki tek fark). Sır adı EKLENMEZ. */
const WORKER_EXTRA_ENV = ["NUMBER_OF_PROCESSORS"] as const;

export type WorkerLaunchErrorCode = "env_file_missing" | "script_missing" | "tsx_missing" | "log_unwritable" | "spawn_failed";

/** İşçi başlatılamadı. `message` teknik (sunucu günlüğü içindir); kullanıcıya `job-control/messages.ts` cümlesi gösterilir. */
export class WorkerLaunchError extends Error {
  constructor(
    readonly code: WorkerLaunchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkerLaunchError";
  }
}

/** Başlatılan sürecin kullanılan yüzü (test sahtesi bunu sağlar). */
export interface LaunchedChild {
  pid?: number;
  on(event: "exit" | "error", listener: () => void): unknown;
  unref(): void;
}

export type WorkerSpawn = (command: string, args: readonly string[], options: SpawnOptions) => LaunchedChild;

export interface LaunchFs {
  exists(file: string): boolean;
  mkdir(dir: string): void;
  /** Dosyayı ekleme kipinde açar, tanıtıcıyı döndürür. */
  openAppend(file: string): number;
  write(fd: number, text: string): void;
  close(fd: number): void;
}

export interface LaunchDeps {
  spawn?: WorkerSpawn;
  /** Kaynak ortam (izin listesinden süzülür). */
  env?: Record<string, string | undefined>;
  /** Proje kökü (varsayılan çalışma dizini). */
  root?: string;
  execPath?: string;
  fs?: LaunchFs;
}

const realFs: LaunchFs = {
  exists: existsSync,
  mkdir: (dir) => void mkdirSync(dir, { recursive: true }),
  openAppend: (file) => openSync(file, "a"),
  write: (fd, text) => void writeSync(fd, text),
  close: closeSync,
};

/** `start`'tan köke doğru yürüyerek `rel` yolunu arar; ilk bulunan tam yol, yoksa undefined. */
export function findUp(start: string, rel: string, exists: (file: string) => boolean = existsSync): string | undefined {
  for (let dir = start; ; dir = path.dirname(dir)) {
    const hit = path.join(dir, rel);
    if (exists(hit)) return hit;
    if (path.dirname(dir) === dir) return undefined;
  }
}

/** Günlük dosyası (proje köküne göre): gün başına tek dosya, ekleme kipinde. Ad yalnız istek anından türer (UTC günü). */
export function workerLogFile(now: Date): string {
  return `${JOB_LOG_DIR}/isci-${now.toISOString().slice(0, 10)}.log`;
}

/** İşçinin SABİT argümanları: istekten hiçbir değer almaz. */
export function workerArgs(root: string, loader: string): string[] {
  return ["--conditions=react-server", `--env-file=${WORKER_ENV_FILE}`, "--import", pathToFileURL(loader).href, path.join(root, JOB_WORKER_SCRIPT), JOB_WORKER_MODES[0]];
}

// Bu panel sürecinin başlattığı ve henüz çıkmamış işçiler. `globalThis`'te durur: action ve route handler ayrı modül kopyaları yüklese de
// (ve geliştirme sunucusu modülü yeniden yüklese de) aynı kümeyi görsünler.
const REGISTRY_KEY = Symbol.for("panel.job-control.launched-workers");

function launchedPids(): Set<number> {
  const holder = globalThis as unknown as Record<symbol, Set<number> | undefined>;
  return (holder[REGISTRY_KEY] ??= new Set<number>());
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // 0 sinyali: süreci öldürmez, yalnız var mı diye bakar
    return true;
  } catch {
    return false;
  }
}

/**
 * Bu panel sürecinin başlattığı bir işçi hâlâ yaşıyor mu? Yaşıyorsa dürtme yeni süreç doğurmaz (o işçi kuyruğu boşaltır). Sunucu yeniden
 * başladıysa küme boştur: dürtme fazladan bir işçi doğurabilir, o da iş alamayıp çıkar (zararsız). Çıkış olayı kaçsa bile süreç var mı
 * diye ayrıca bakılır.
 */
export function launchedWorkerAlive(isAlive: (pid: number) => boolean = pidAlive): boolean {
  const pids = launchedPids();
  for (const pid of pids) if (!isAlive(pid)) pids.delete(pid);
  return pids.size > 0;
}

export interface LaunchedWorker {
  /** İşçinin kendi süreç kimliği (tek süreç: sarmalayıcı yok). */
  pid: number;
  /** Günlük dosyası (proje köküne göre). */
  logFile: string;
}

/** İşçinin diskte bulunması gereken parçaları: sır dosyası, betik, tsx yükleyicisi. Biri yoksa `WorkerLaunchError`. */
function resolveWorker(deps: Pick<LaunchDeps, "root" | "fs">): { root: string; loader: string } {
  const fs = deps.fs ?? realFs;
  const root = deps.root ?? projectRoot();
  if (!fs.exists(path.join(root, WORKER_ENV_FILE))) throw new WorkerLaunchError("env_file_missing", `${WORKER_ENV_FILE} bulunamadı: ${root}`);
  if (!fs.exists(path.join(root, JOB_WORKER_SCRIPT))) throw new WorkerLaunchError("script_missing", `${JOB_WORKER_SCRIPT} bulunamadı: ${root}`);
  const loader = findUp(root, TSX_LOADER, fs.exists);
  if (loader === undefined) throw new WorkerLaunchError("tsx_missing", "tsx yükleyicisi bulunamadı (node_modules/tsx).");
  return { root, loader };
}

/**
 * İşçi bu kurulumda başlatılabilir mi (yalnız dosya varlığı; süreç doğurmaz)? Sorun yoksa undefined. İş satırı YAZILMADAN önce sorulur:
 * başlatılamayacak işçi için sıraya sahipsiz iş bırakılmasın.
 */
export function workerLaunchProblem(deps: Pick<LaunchDeps, "root" | "fs"> = {}): WorkerLaunchErrorCode | undefined {
  try {
    resolveWorker(deps);
    return undefined;
  } catch (error) {
    if (error instanceof WorkerLaunchError) return error.code;
    throw error;
  }
}

/** İşçiyi ayrık süreç olarak başlatır ve beklemeden döner. Başlatılamazsa `WorkerLaunchError` (iş satırına dokunmaz: iş sırada kalır). */
export function launchWorker(options: { now: Date }, deps: LaunchDeps = {}): LaunchedWorker {
  const fs = deps.fs ?? realFs;
  const { root, loader } = resolveWorker(deps);

  const logFile = workerLogFile(options.now);
  let fd: number;
  try {
    fs.mkdir(path.join(root, JOB_LOG_DIR));
    fd = fs.openAppend(path.join(root, logFile));
  } catch (error) {
    throw new WorkerLaunchError("log_unwritable", `Günlük dosyası açılamadı (${logFile}): ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
  }

  try {
    const spawn: WorkerSpawn = deps.spawn ?? ((command, args, spawnOptions) => nodeSpawn(command, args, spawnOptions));
    const child = spawn(deps.execPath ?? process.execPath, workerArgs(root, loader), {
      cwd: root,
      // Next'in ProcessEnv eki NODE_ENV'i zorunlu kılar; izin listesi onu taşımaz (işçiye sızmamalı).
      env: buildChildEnv(deps.env ?? process.env, { passEnv: WORKER_EXTRA_ENV }) as NodeJS.ProcessEnv,
      detached: true,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", fd, fd],
    });
    const pid = child.pid;
    const forget = () => {
      if (pid !== undefined) launchedPids().delete(pid);
    };
    child.on("error", forget); // başlatma hatası olayla gelir; dinleyici yoksa süreç çöker
    child.on("exit", forget);
    child.unref();
    if (pid === undefined) throw new WorkerLaunchError("spawn_failed", "İşçi süreci başlatılamadı (süreç kimliği yok).");
    launchedPids().add(pid);
    try {
      fs.write(fd, `[${options.now.toISOString()}] panel: işçi başlatıldı (pid ${pid})\n`);
    } catch {
      // başlık satırı yazılamadı: işçi yine de başladı
    }
    return { pid, logFile };
  } catch (error) {
    if (error instanceof WorkerLaunchError) throw error;
    throw new WorkerLaunchError("spawn_failed", `İşçi süreci başlatılamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
  } finally {
    fs.close(fd); // alt süreç kendi kopyasını tutar
  }
}
