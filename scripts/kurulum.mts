/**
 * Müşteri kopyası kurulumu: `npm run kurulum -- denetle | veritabani --db-url=… [--dry-run] | hesap --handle=… --platform=… [--type=…]`.
 *
 *  - `denetle`: env, Claude CLI girişi, ffmpeg, Whisper, Apify anahtarı (yalnız varlık; ağ çağrısı YOK), veritabanı bağlantısı. Her madde
 *    tamam / eksik + ne yapmalı. Eksik varsa çıkış 1.
 *  - `veritabani`: `supabase/migrations`'ı sırayla müşterinin projesine uygular (`supabase db push --db-url`, Docker gerekmez).
 *    `--dry-run` yalnız bekleyenleri listeler, hiçbir şey uygulamaz. Parola çıktıya yazılmaz.
 *  - `hesap`: yerel kullanıcı (auth) + ilk çalışma alanı (`create_workspace`), `.env.local`'a LOCAL_USER_ID / LOCAL_WORKSPACE_ID yazar
 *    (dosyanın öteki satırlarına dokunmaz), ajan aylık tavanını 4,5 USD yapar (`workspace set --agent-cap=4.5` eşdeğeri; tavanı vermek onaydır).
 *    Hesap bilgisi önce kontrol edilir; `.env.local`'da LOCAL_WORKSPACE_ID varsa ikinci hesap AÇILMAZ.
 *
 * `.env.local` yoksa da çalışır (`--env-file-if-exists`). Çıkış: 0 tamam · 1 eksik ya da hata · 2 geçersiz kullanım.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { checksExitCode, formatChecks, runChecks, type CheckDeps } from "@/lib/setup/checks";
import { upsertEnv } from "@/lib/setup/env-file";
import { execCommand } from "@/lib/setup/exec";
import { buildPushArgs, orderMigrations, splitDbUrl } from "@/lib/setup/migrations";
import { getAdminClient } from "@/lib/supabase/admin";
import { parseCreateArgs, parseSetArgs } from "@/lib/workspace/create-args";
import { createSupabaseWorkspace, updateSupabaseWorkspaceSettings } from "@/lib/workspace/registry-db";

const USAGE = "Kullanım: npm run kurulum -- denetle | veritabani [--db-url=<postgresql://…>] [--dry-run] | hesap --handle=<kullanıcı adı> --platform=instagram [--type=business|creator|mixed]";
/** Kopyada yeni hesabın aylık ajan tavanı (SPEC Kararlar d: Apify'ın ücretsiz 5 USD'sinin altı). */
const COPY_AGENT_CAP_USD = "4.5";
const LOCAL_USER_EMAIL = "yerel@panel.local";
const ENV_FILE = ".env.local";

async function pingDb(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { error } = await getAdminClient().from("workspaces").select("id").limit(1);
    if (error === null) return { ok: true };
    return { ok: false, reason: error.code === "42P01" || error.code === "PGRST205" ? "Bağlanıldı ama tablolar yok (veritabani adımı çalışmamış)." : `Sorgu başarısız (${error.code ?? "kod yok"}).` };
  } catch {
    return { ok: false, reason: "Bağlanılamadı (adres ya da anahtar hatalı)." };
  }
}

async function denetle(): Promise<number> {
  const deps: CheckDeps = { env: process.env, run: (command, args) => execCommand(command, args), exists: existsSync, homeDir: os.homedir(), pingDb };
  const results = await runChecks(deps);
  for (const line of formatChecks(results)) console.log(line);
  return checksExitCode(results);
}

async function veritabani(argv: readonly string[]): Promise<number> {
  const dryRun = argv.includes("--dry-run");
  const urlArgs = argv.filter((arg) => arg.startsWith("--db-url="));
  const unknown = argv.filter((arg) => arg !== "--dry-run" && !arg.startsWith("--db-url="));
  if (urlArgs.length > 1 || unknown.length > 0) {
    console.error(`${unknown.length > 0 ? `Bilinmeyen bayrak: ${unknown.join(" ")}. ` : ""}${USAGE}`);
    return 2;
  }
  // Adres önce .env.local'daki SUPABASE_DB_URL'den okunur (parola sohbete / komut satırına düşmesin); --db-url yalnız yedek yol.
  const rawUrl = urlArgs.length === 1 ? urlArgs[0].slice("--db-url=".length) : process.env.SUPABASE_DB_URL?.trim();
  if (rawUrl === undefined || rawUrl === "") {
    console.error(`SUPABASE_DB_URL boş: Supabase panelindeki "Connect" sayfasından Session pooler adresini kopyalayıp ${ENV_FILE} içine SUPABASE_DB_URL=… olarak yapıştır (parolada @ # / varsa %40 %23 %2F yaz).`);
    return 1;
  }
  let target: ReturnType<typeof splitDbUrl>;
  try {
    target = splitDbUrl(rawUrl);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Bağlantı adresi geçersiz.");
    return 1;
  }
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = orderMigrations(readdirSync(dir));
  console.log(`${files.length} migration (${files[0]} … ${files[files.length - 1]}) → ${target.url}`);
  const args = buildPushArgs(target.url, dryRun);
  console.log(`${dryRun ? "Kuru koşu: hiçbir şey uygulanmaz. " : ""}Komut: npx ${args.join(" ")} (parola PGPASSWORD ortamıyla geçer)`);
  const result = await execCommand("npx", args, { timeoutMs: 600_000, inherit: true, env: target.env });
  if (result === undefined) {
    console.error("npx bulunamadı: Node.js'i kur (https://nodejs.org).");
    return 1;
  }
  if (result.exitCode !== 0) {
    console.error("Migration uygulanamadı: yukarıdaki hatayı oku; adres / parola doğru mu, proje uyanık mı (ücretsiz proje 7 gün boşta kalınca uyur)?");
    return 1;
  }
  console.log(dryRun ? "Kuru koşu bitti." : "Migration'lar uygulandı.");
  return 0;
}

/** Yerel kullanıcı: LOCAL_USER_ID varsa o, yoksa auth'ta oluşturulur (aynı e-posta varsa o kullanıcı). Parolası yok, giriş yapamaz. */
async function ensureLocalUser(): Promise<string> {
  const existing = process.env.LOCAL_USER_ID?.trim();
  if (existing) return existing;
  const admin = getAdminClient().auth.admin;
  const created = await admin.createUser({ email: LOCAL_USER_EMAIL, email_confirm: true });
  if (created.data.user) return created.data.user.id;
  const list = await admin.listUsers({ perPage: 200 });
  const found = list.data.users.find((user) => user.email === LOCAL_USER_EMAIL);
  if (!found) throw new Error("Yerel kullanıcı oluşturulamadı (service role anahtarını kontrol et).");
  return found.id;
}

async function hesap(argv: readonly string[]): Promise<number> {
  const raw = parseCreateArgs(argv);
  if (!raw.handle || !raw.platform) {
    console.error(`--handle ve --platform zorunlu.\n${USAGE}`);
    return 2;
  }
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[name]?.trim()) {
      console.error(`Eksik ortam değişkeni (${ENV_FILE}): ${name}`);
      return 1;
    }
  }
  // değeri okumaz, yalnız dolu mu diye bakar (tek çözümleyici kuralı: yalnız from-env.ts değeri okur)
  if (Object.keys(process.env).some((key) => key === "LOCAL_WORKSPACE_ID" && process.env[key]?.trim())) {
    console.error("LOCAL_WORKSPACE_ID zaten dolu: hesap daha önce kurulmuş. İkinci hesap için `npm run workspace -- create …` kullan.");
    return 1;
  }
  const userId = await ensureLocalUser();
  process.env.LOCAL_USER_ID = userId;
  const created = await createSupabaseWorkspace({ name: raw.handle, ...raw }, { userId });
  const updated = await updateSupabaseWorkspaceSettings(created.id, parseSetArgs([`--agent-cap=${COPY_AGENT_CAP_USD}`]), { userId });
  const envPath = path.join(process.cwd(), ENV_FILE);
  const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  writeFileSync(envPath, upsertEnv(current, { LOCAL_USER_ID: userId, LOCAL_WORKSPACE_ID: created.id }), "utf8");
  console.log(`Hesap kuruldu: ${created.name} (${created.accounts.map((a) => `${a.platform} @${a.handle}`).join(", ")}).`);
  console.log(`  ${ENV_FILE} güncellendi (LOCAL_USER_ID, LOCAL_WORKSPACE_ID) · ajan aylık tavanı ${updated.agentMonthlyCapUsd} USD.`);
  console.log("Toplama BAŞLATILMADI. Sonraki adım: npm run kurulum -- denetle");
  return 0;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "denetle" && rest.length === 0) return denetle();
  if (command === "veritabani") return veritabani(rest);
  if (command === "hesap") return hesap(rest);
  console.error(USAGE);
  return 2;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`Kurulum komutu başarısız: ${error instanceof Error ? error.message : "bilinmeyen hata"}`);
    process.exitCode = 1;
  },
);
