/**
 * Kredi bakiyesi ve elle kredi verme (yerel, yönetici): `npm run credits -- balance | grant …`.
 *
 *   balance [--user=<uuid>]
 *   grant --amount=<kredi> --bucket=monthly|purchased --reason=<metin> [--expires=<YYYY-AA-GG>] [--user=<uuid>] [--key=<anahtar>]
 *
 * Kredi KULLANICIYA aittir (çalışma alanına değil): hedef `--user`, verilmezse yerel kullanıcı (`LOCAL_USER_ID`). `grant` defterde `adjust`
 * satırı açar (başlangıç bakiyesi / düzeltme); defter yalnız eklenir, verilen kredi bu betikle GERİ ALINAMAZ. İdempotenttir: anahtar
 * kullanıcıyı, günü ve girdinin özetini içerir (`lib/credits/cli-args.ts`); aynı komut aynı gün ikinci kez vermez. Sağlayıcı çağrısı yok,
 * para harcamaz. `.env.local` Node'un `--env-file`'ıyla yüklenir; gizli değer yazdırılmaz. Çıkış kodu: 0 tamam · 1 hata / geçersiz girdi.
 */
import { CREDITS_USAGE, manualGrantKey, parseCreditsArgs } from "@/lib/credits/cli-args";
import { isCreditsEnforced } from "@/lib/credits/enforcement";
import { grantCredits, readCreditBalance } from "@/lib/credits/ledger";
import { readLocalSupabaseEnv } from "@/lib/data/supabase/from-env";
import type { CreditBalance } from "@/lib/domain/credits";
import { formatDate, formatNumber } from "@/lib/format";
import { missingEnv } from "@/lib/intel/context";
import { getAdminClient } from "@/lib/supabase/admin";

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LOCAL_WORKSPACE_ID", "LOCAL_USER_ID"] as const;
const n = (value: number) => formatNumber(value) ?? "0";

function printBalance(userId: string, balance: CreditBalance): void {
  console.log(`Kullanıcı ${userId}`);
  console.log(`  kullanılabilir ${n(balance.available)} kredi (aylık ${n(balance.monthly)} · ek ${n(balance.purchased)}) · işlere ayrılmış ${n(balance.held)}`);
  if (balance.nextExpiry !== undefined) {
    console.log(`  ilk dolacak: ${n(balance.nextExpiry.amount)} kredi (${balance.nextExpiry.bucket}), ${formatDate(balance.nextExpiry.at, "UTC") ?? balance.nextExpiry.at}`);
  }
  console.log(`  kredi zorlaması: ${isCreditsEnforced() ? "AÇIK (işler kredi düşer)" : "kapalı (işler kredi düşmez; CREDITS_ENFORCED=on ile açılır)"}`);
}

async function main(): Promise<number> {
  const now = new Date();
  const args = parseCreditsArgs(process.argv.slice(2), now);
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) {
    console.error(`Eksik ortam değişkeni (.env.local): ${missing.join(", ")}`);
    return 1;
  }
  const userId = args.userId ?? readLocalSupabaseEnv().userId;
  const client = getAdminClient();

  if (args.command === "grant") {
    const key = args.key ?? manualGrantKey(userId, args, now);
    const before = await readCreditBalance(client, userId, now);
    const entry = await grantCredits(client, userId, { type: "adjust", amount: args.amount, key, bucket: args.bucket, expiresAt: args.expiresAt, note: args.reason });
    const after = await readCreditBalance(client, userId, new Date());
    const fresh = after.available !== before.available || after.held !== before.held;
    console.log(fresh ? `Verildi: ${n(entry.amount)} kredi (${entry.bucket}${entry.expiresAt === undefined ? ", süresiz" : `, son kullanma ${entry.expiresAt}`}).` : "Bu kredi daha önce verilmiş (aynı anahtar): ikinci kez verilmedi.");
    console.log(`  anahtar ${key} · defter satırı ${entry.id}`);
    printBalance(userId, after);
    return 0;
  }

  printBalance(userId, await readCreditBalance(client, userId, now));
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : "bilinmeyen hata");
    if (!(error instanceof Error) || error.message.startsWith("Kullanım")) console.error(CREDITS_USAGE);
    process.exitCode = 1;
  },
);
