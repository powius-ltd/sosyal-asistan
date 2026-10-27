/**
 * Migration uygulama planı (saf): dosya sırası + `supabase db push --db-url` komutu. Docker gerekmez. Bağlantı adresindeki parola
 * çıktıya girmez (`maskDbUrl`).
 */
export const SUPABASE_CLI = "supabase@2.118.0";

const MIGRATION_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** Dosya adlarını numaraya göre sıralar; desene uymayanı ya da aynı numarayı iki kez içereni reddeder. */
export function orderMigrations(files: readonly string[]): string[] {
  const sql = files.filter((file) => file.endsWith(".sql"));
  const seen = new Set<string>();
  for (const file of sql) {
    const match = MIGRATION_NAME.exec(file);
    if (!match) throw new Error(`Beklenmeyen migration adı: ${file}`);
    if (seen.has(match[1])) throw new Error(`Aynı numaralı iki migration: ${match[1]}`);
    seen.add(match[1]);
  }
  return [...sql].sort();
}

export function parseDbUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("--db-url geçerli bir adres değil (postgresql://kullanıcı:[parola]@sunucu:5432/postgres).");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") throw new Error("--db-url postgresql:// ile başlamalı.");
  return url;
}

export function maskDbUrl(raw: string): string {
  const url = parseDbUrl(raw);
  if (url.password !== "") url.password = "****";
  return url.toString();
}

/**
 * Bağlantı adresini ikiye ayırır: PAROLASIZ adres (argümana / günlüğe girebilir) ve parola (yalnız alt sürecin `PGPASSWORD` ortamına).
 * Parola adreste URL-kodludur (`@` `#` `/` gibi karakterler %40 %23 %2F olmalı); burada çözülür.
 */
export function splitDbUrl(raw: string): { url: string; env: Record<string, string> } {
  const parsed = parseDbUrl(raw);
  const password = decodeURIComponent(parsed.password);
  parsed.password = "";
  return { url: parsed.toString(), env: password === "" ? {} : { PGPASSWORD: password } };
}

/** `npx` bağımsız değişkenleri (kabuk yok; adres tek argümandır). `--yes`: onay sorusunda takılmaz. Parolalı adres vermek yerine `splitDbUrl().url` ver. */
export function buildPushArgs(dbUrl: string, dryRun: boolean): string[] {
  parseDbUrl(dbUrl);
  return ["-y", SUPABASE_CLI, "db", "push", `--db-url=${dbUrl}`, "--yes", ...(dryRun ? ["--dry-run"] : [])];
}
