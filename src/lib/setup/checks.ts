/**
 * Kurulum denetimi (saf): her madde tamam / eksik + "ne yapmalı" (Türkçe). Dış dünya (ortam, alt süreç, dosya sistemi, veritabanı)
 * `CheckDeps` ile enjekte edilir; testte sahte verilir, betik (`scripts/kurulum.mts`) gerçeklerini bağlar. Ağ çağrısı YOK
 * (Apify yalnız anahtarın varlığına bakılır). Gizli değer hiçbir çıktıya girmez; yalnız değişken ADI yazılır.
 */
import path from "node:path";

export type SetupEnv = Readonly<Record<string, string | undefined>>;

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
}

export interface CheckDeps {
  env: SetupEnv;
  /** Komutu çalıştırır; başlatılamazsa (program yok) `undefined`. */
  run(command: string, args: readonly string[]): Promise<CommandResult | undefined>;
  exists(filePath: string): boolean;
  /** Kullanıcı ana dizini (Whisper model önbelleği için). */
  homeDir: string;
  /** Veritabanına bağlanıp bir okuma dener. */
  pingDb(): Promise<{ ok: boolean; reason?: string }>;
}

export interface CheckResult {
  id: string;
  label: string;
  ok: boolean;
  /** Tamamsa kısa not, eksikse neyin eksik olduğu. */
  detail: string;
  /** Eksikse ne yapılacağı. */
  fix?: string;
}

/** Panelin çalışması için `.env.local`'da dolu olması gereken anahtarlar (hesap adımından gelenler ayrı madde). */
export const REQUIRED_ENV_KEYS: readonly string[] = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const ACCOUNT_ENV_KEYS: readonly string[] = ["LOCAL_USER_ID", "LOCAL_WORKSPACE_ID"];

const done = (id: string, label: string, detail: string): CheckResult => ({ id, label, ok: true, detail });
const missing = (id: string, label: string, detail: string, fix: string): CheckResult => ({ id, label, ok: false, detail, fix });

const blank = (env: SetupEnv, key: string): boolean => !env[key]?.trim();

export function checkEnv(env: SetupEnv): CheckResult[] {
  const absent = REQUIRED_ENV_KEYS.filter((key) => blank(env, key));
  const results: CheckResult[] = [
    absent.length === 0
      ? done("env", "Ortam anahtarları (.env.local)", "Supabase anahtarları dolu.")
      : missing("env", "Ortam anahtarları (.env.local)", `Eksik: ${absent.join(", ")}.`, ".env.example dosyasını .env.local olarak kopyala; Supabase panelindeki proje adresini ve anahtarları yapıştır."),
  ];
  const wrongSource = env.DATA_SOURCE?.trim() !== "supabase";
  results.push(
    wrongSource
      ? missing("env-kaynak", "Veri kaynağı (DATA_SOURCE)", "DATA_SOURCE=supabase değil.", ".env.local içine DATA_SOURCE=supabase yaz.")
      : done("env-kaynak", "Veri kaynağı (DATA_SOURCE)", "supabase"),
  );
  const noAccount = ACCOUNT_ENV_KEYS.filter((key) => blank(env, key));
  results.push(
    noAccount.length === 0
      ? done("env-hesap", "Yerel kullanıcı ve çalışma alanı", "LOCAL_USER_ID ve LOCAL_WORKSPACE_ID dolu.")
      : missing("env-hesap", "Yerel kullanıcı ve çalışma alanı", `Eksik: ${noAccount.join(", ")}.`, "npm run kurulum -- hesap --handle=<kullanıcı adı> --platform=instagram komutunu çalıştır (veritabanı kurulduktan sonra)."),
  );
  return results;
}

export async function checkClaude(deps: CheckDeps): Promise<CheckResult> {
  const label = "Claude CLI girişi";
  const version = await deps.run("claude", ["--version"]);
  if (version === undefined || version.exitCode !== 0) {
    return missing("claude", label, "claude komutu bulunamadı.", "Claude Code'u kur (https://claude.com/claude-code) ve terminali yeniden aç.");
  }
  const status = await deps.run("claude", ["auth", "status"]);
  if (status === undefined || status.exitCode !== 0 || /"loggedIn"\s*:\s*false/.test(status.stdout)) {
    return missing("claude", label, "Claude'a giriş yapılmamış.", "Terminalde `claude` yaz ve giriş yap (Claude aboneliğinle).");
  }
  return done("claude", label, "Giriş yapılmış.");
}

export async function checkFfmpeg(deps: CheckDeps): Promise<CheckResult> {
  const label = "ffmpeg";
  const bin = deps.env.FFMPEG_BIN?.trim() || "ffmpeg";
  const result = await deps.run(bin, ["-version"]);
  return result !== undefined && result.exitCode === 0
    ? done("ffmpeg", label, "Kurulu.")
    : missing("ffmpeg", label, `${bin} çalıştırılamadı.`, "ffmpeg kur (Windows: winget install ffmpeg · macOS: brew install ffmpeg · Linux: sudo apt install ffmpeg); kuruluysa FFMPEG_BIN ile tam yolu ver.");
}

/** Hugging Face önbelleğinde `small` (ya da WHISPER_MODEL) modelinin indirilmiş olup olmadığı. */
export function whisperModelDir(env: SetupEnv, homeDir: string, model: string): string {
  const hub = env.HF_HUB_CACHE?.trim() || path.join(env.HF_HOME?.trim() || path.join(homeDir, ".cache", "huggingface"), "hub");
  return path.join(hub, `models--Systran--faster-whisper-${model}`, "snapshots");
}

export async function checkWhisper(deps: CheckDeps): Promise<CheckResult> {
  const label = "Whisper (konuşma metni)";
  const python = deps.env.WHISPER_PYTHON?.trim();
  if (!python) {
    return missing("whisper", label, "WHISPER_PYTHON boş.", "python3 -m venv .venv && .venv/bin/pip install faster-whisper kur, sonra .env.local'a WHISPER_PYTHON=<venv içindeki python yolu> yaz (ayrıntı KURULUM.md).");
  }
  const imported = await deps.run(python, ["-c", "import faster_whisper"]);
  if (imported === undefined || imported.exitCode !== 0) {
    return missing("whisper", label, "faster-whisper yüklenemedi.", `${python} -m pip install faster-whisper komutunu çalıştır (ya da WHISPER_PYTHON yolunu düzelt).`);
  }
  const model = deps.env.WHISPER_MODEL?.trim() || "small";
  const snapshots = whisperModelDir(deps.env, deps.homeDir, model);
  if (!deps.exists(snapshots)) {
    return missing("whisper", label, `'${model}' modeli indirilmemiş.`, `${python} tools/transcribe.py <kısa bir video> komutunu bir kez çalıştır; model (~480 MB) kendiliğinden iner.`);
  }
  return done("whisper", label, `faster-whisper kurulu, '${model}' modeli indirilmiş.`);
}

/** `pg_dump` haftalık yedek için gerekir (Supabase yedeği); yoksa yedek sessizce atlanır, bu yüzden denetimde madde olur. */
export async function checkPgDump(deps: CheckDeps): Promise<CheckResult> {
  const label = "pg_dump (haftalık yedek)";
  const result = await deps.run("pg_dump", ["--version"]);
  return result !== undefined && result.exitCode === 0
    ? done("pg_dump", label, "Kurulu.")
    : missing("pg_dump", label, "pg_dump bulunamadı: haftalık yedek alınamaz.", "PostgreSQL istemci araçlarını kur (macOS: brew install libpq && brew link --force libpq · Windows: winget install PostgreSQL.PostgreSQL · Linux: sudo apt install postgresql-client).");
}

export function checkApify(env: SetupEnv): CheckResult {
  const label = "Apify anahtarı";
  return blank(env, "APIFY_TOKEN")
    ? missing("apify", label, "APIFY_TOKEN boş.", "apify.com'da hesap aç (ücretsiz), Settings > API'den anahtarı kopyala ve .env.local'a APIFY_TOKEN=… olarak yaz.")
    : done("apify", label, "Anahtar dolu (bağlantı denenmedi).");
}

export async function checkDb(deps: CheckDeps): Promise<CheckResult> {
  const label = "Veritabanı bağlantısı";
  if (blank(deps.env, "NEXT_PUBLIC_SUPABASE_URL") || blank(deps.env, "SUPABASE_SERVICE_ROLE_KEY")) {
    return missing("db", label, "Supabase adresi ya da service role anahtarı yok.", "Önce .env.local anahtarlarını doldur.");
  }
  const ping = await deps.pingDb();
  return ping.ok
    ? done("db", label, "Bağlanıldı, tablolar var.")
    : missing("db", label, ping.reason ?? "Bağlanılamadı.", "Anahtarları kontrol et; tablolar yoksa npm run kurulum -- veritabani --db-url=<bağlantı adresi> çalıştır.");
}

export async function runChecks(deps: CheckDeps): Promise<CheckResult[]> {
  return [
    ...checkEnv(deps.env),
    await checkClaude(deps),
    await checkFfmpeg(deps),
    await checkWhisper(deps),
    await checkPgDump(deps),
    checkApify(deps.env),
    await checkDb(deps),
  ];
}

/** Çıkış kodu: hepsi tamamsa 0, herhangi eksik varsa 1. */
export function checksExitCode(results: readonly CheckResult[]): number {
  return results.every((result) => result.ok) ? 0 : 1;
}

export function formatChecks(results: readonly CheckResult[]): string[] {
  const lines: string[] = [];
  for (const result of results) {
    lines.push(`${result.ok ? "[tamam]" : "[EKSİK]"} ${result.label}: ${result.detail}`);
    if (!result.ok && result.fix !== undefined) lines.push(`         Ne yapmalı: ${result.fix}`);
  }
  const absent = results.filter((result) => !result.ok);
  lines.push(absent.length === 0 ? "Her şey tamam." : `${absent.length} madde eksik: ${absent.map((result) => result.label).join(", ")}.`);
  return lines;
}
