/**
 * `npm run credits` argümanları (saf ayrıştırma; betik `scripts/credits.mts`). Kredi KULLANICIYA aittir: hedef `--user=<uuid>`, verilmezse
 * yerel kullanıcı (`LOCAL_USER_ID`); çalışma alanı bayrağı yoktur.
 *
 *   balance [--user=<uuid>]
 *   grant --amount=<kredi> --bucket=monthly|purchased --reason=<metin> [--expires=<YYYY-AA-GG | ISO an>] [--user=<uuid>] [--key=<anahtar>]
 *
 * `grant` elle verilen kredidir (defterde `adjust`: başlangıç bakiyesi / düzeltme): `monthly` kovası dönem sonu İSTER (`--expires`; aylık kredi
 * dönem sonunda yanar), `purchased` kovasında verilmezse kredi süresizdir. İdempotency anahtarı verilmezse KULLANICIYI içeren, günle ve
 * girdiyle belirlenen bir anahtar türetilir: aynı komut aynı gün ikinci kez çalışırsa ikinci kez vermez.
 */
import { createHash } from "node:crypto";

import { isUuid } from "@/lib/data/supabase/errors";
import { CREDIT_BUCKETS, CREDIT_GRANT_MAX, CREDIT_KEY_PATTERN, CREDIT_NOTE_MAX_CHARS, type CreditBucket } from "@/lib/domain/credits";

export const CREDITS_USAGE = [
  "Kullanım:",
  "  npm run credits -- balance [--user=<uuid>]",
  "  npm run credits -- grant --amount=<kredi> --bucket=monthly|purchased --reason=<metin> [--expires=<YYYY-AA-GG>] [--user=<uuid>] [--key=<anahtar>]",
  "Kredi kullanıcıya aittir (çalışma alanına değil); --user verilmezse yerel kullanıcı. monthly kovası --expires (dönem sonu) ister.",
].join("\n");

export type CreditsCommand =
  | { command: "balance"; userId?: string }
  | { command: "grant"; userId?: string; amount: number; bucket: CreditBucket; reason: string; expiresAt?: string; key?: string };

const FLAG = /^--([a-z]+)=(.*)$/;

function flagsOf(argv: readonly string[], allowed: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = FLAG.exec(arg);
    if (match === null || !allowed.includes(match[1])) throw new Error(`Bilinmeyen argüman: ${arg}\n${CREDITS_USAGE}`);
    if (flags.has(match[1])) throw new Error(`--${match[1]} bir kez verilebilir.`);
    const value = match[2].trim();
    if (value === "") throw new Error(`--${match[1]} boş olamaz.`);
    flags.set(match[1], value);
  }
  return flags;
}

function userOf(flags: Map<string, string>): string | undefined {
  const user = flags.get("user");
  if (user !== undefined && !isUuid(user)) throw new Error("--user bir kullanıcı kimliği (UUID) olmalı.");
  return user;
}

/** Son kullanma: `YYYY-AA-GG` günün SONU (UTC) sayılır; tam ISO an aynen alınır. Geçmiş an reddedilir (verilen kredi harcanamaz olurdu). */
function expiryOf(raw: string, now: Date): string {
  const at = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T23:59:59.999Z`) : new Date(raw);
  if (Number.isNaN(at.getTime())) throw new Error("--expires geçerli bir tarih olmalı (YYYY-AA-GG ya da ISO an).");
  if (at.getTime() <= now.getTime()) throw new Error("--expires geçmişte olamaz (kredi doğduğu anda harcanamaz olurdu).");
  return at.toISOString();
}

export function parseCreditsArgs(argv: readonly string[], now: Date = new Date()): CreditsCommand {
  const [command, ...rest] = argv;
  if (command === "balance") {
    const userId = userOf(flagsOf(rest, ["user"]));
    return { command, ...(userId === undefined ? {} : { userId }) };
  }
  if (command !== "grant") throw new Error(CREDITS_USAGE);

  const flags = flagsOf(rest, ["amount", "bucket", "reason", "expires", "user", "key"]);
  const amountText = flags.get("amount");
  const amount = amountText !== undefined && /^\d+$/.test(amountText) ? Number(amountText) : Number.NaN;
  if (!Number.isInteger(amount) || amount < 1 || amount > CREDIT_GRANT_MAX) throw new Error(`--amount 1 ile ${CREDIT_GRANT_MAX} arasında tam sayı olmalı.`);
  const bucket = CREDIT_BUCKETS.find((candidate) => candidate === flags.get("bucket"));
  if (bucket === undefined) throw new Error(`--bucket ${CREDIT_BUCKETS.join(" ya da ")} olmalı.`);
  const reason = flags.get("reason");
  if (reason === undefined) throw new Error("--reason zorunlu (kredinin neden verildiği deftere yazılır).");
  if (Array.from(reason).length > CREDIT_NOTE_MAX_CHARS) throw new Error(`--reason en çok ${CREDIT_NOTE_MAX_CHARS} karakter olabilir.`);
  const expires = flags.get("expires");
  if (bucket === "monthly" && expires === undefined) throw new Error("monthly kovası --expires ister (aylık kredi dönem sonunda yanar).");
  const key = flags.get("key");
  if (key !== undefined && !CREDIT_KEY_PATTERN.test(key)) throw new Error("--key 1–120 karakter olmalı (harf, rakam, nokta, alt çizgi, iki nokta, tire).");
  const userId = userOf(flags);
  return {
    command,
    amount,
    bucket,
    reason,
    ...(expires === undefined ? {} : { expiresAt: expiryOf(expires, now) }),
    ...(userId === undefined ? {} : { userId }),
    ...(key === undefined ? {} : { key }),
  };
}

/**
 * Elle vermenin idempotency anahtarı: KULLANICIYI, günü (UTC) ve girdinin özetini içerir. Aynı kullanıcıya aynı gün aynı tutar / kova /
 * gerekçe / son kullanma ikinci kez verilmez; herhangi biri değişirse yeni vermedir.
 */
export function manualGrantKey(userId: string, grant: Pick<Extract<CreditsCommand, { command: "grant" }>, "amount" | "bucket" | "reason" | "expiresAt">, now: Date): string {
  const digest = createHash("sha256").update(JSON.stringify([grant.amount, grant.bucket, grant.reason, grant.expiresAt ?? null])).digest("hex").slice(0, 12);
  return `manual:${userId}:${now.toISOString().slice(0, 10)}:${digest}`;
}
