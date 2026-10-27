/**
 * Müşteri görünümü için "Ölçülemeyenler" özeti (D3-09): ham tablo (veritabanı adları, yüzlerce tekrar eden satır) yerine en çok
 * 5 satırlık düz özet. Saf; metinler `plain-language-account.ts`'tendir. Ham tablo yalnız yönetici modunda çizilir.
 */
import type { UnmeasuredEntry } from "@/lib/domain/measured";
import { formatNumber } from "@/lib/format";
import { MEASURE_FIELD_FALLBACK, MEASURE_FIELD_PLAIN, UNMEASURED_PLAIN } from "@/lib/plain-language-account";

export const MAX_SUMMARY_LINES = 5;

/** Yalnız hesap sahibine açık alanlar: rakipte görünmez, kendi videolarında içgörü hazır olunca görünür. */
const OWNER_ONLY_FIELDS = new Set(["reach", "saves", "shares", "avgWatchSec"]);
/** Biçim kaynaklı boşluklar (karusel izlenmesi, gizlenen beğeni). */
const FORMAT_FIELDS = new Set(["views", "likes"]);

const fieldName = (field: string): string => MEASURE_FIELD_PLAIN[field] ?? MEASURE_FIELD_FALLBACK;

/** "erişim, kaydetme ve paylaşma" (Türkçe sıralama: sondan önce "ve"). */
function joinFields(fields: Iterable<string>): string {
  const names = [...new Set([...fields].map(fieldName))];
  if (names.length <= 1) return names[0] ?? MEASURE_FIELD_FALLBACK;
  return `${names.slice(0, -1).join(", ")} ve ${names[names.length - 1]}`;
}

/** Satırın öznesindeki kullanıcı adı: "@handle · 44 içerik" → "handle". */
function handleOf(subject: string): string | undefined {
  return /^@([^\s·]+)/.exec(subject)?.[1]?.toLowerCase();
}

/** `ownHandles`: çalışma alanının kendi hesap adları (küçük harf); içerik satırının kendi mi rakip mi olduğunu buradan anlarız. */
export function summarizeUnmeasured(entries: readonly UnmeasuredEntry[], ownHandles: ReadonlySet<string>): string[] {
  const ownFields = new Set<string>();
  const rivalFields = new Set<string>();
  const rivalGone = new Set<string>();
  const rivalProfile = new Set<string>();
  let hasAccount = false;
  let hasFormatGap = false;

  for (const entry of entries) {
    const handle = handleOf(entry.subject);
    const field = entry.field;
    if (entry.scope === "account") hasAccount = true;
    else if (entry.scope === "competitor") (field === undefined ? rivalGone : rivalProfile).add(handle ?? entry.subject);
    else if (entry.scope === "content" && field !== undefined) {
      if (FORMAT_FIELDS.has(field)) hasFormatGap = true;
      else if (OWNER_ONLY_FIELDS.has(field)) (handle !== undefined && ownHandles.has(handle) ? ownFields : rivalFields).add(field);
    }
  }

  const lines: string[] = [];
  if (hasAccount) lines.push(UNMEASURED_PLAIN.account);
  if (ownFields.size > 0) lines.push(UNMEASURED_PLAIN.ownInsights(joinFields(ownFields)));
  if (rivalFields.size > 0) lines.push(UNMEASURED_PLAIN.publicOnly(joinFields(rivalFields)));
  if (hasFormatGap) lines.push(UNMEASURED_PLAIN.formatGap);
  if (rivalGone.size > 0) lines.push(UNMEASURED_PLAIN.rivalUnavailable(formatNumber(rivalGone.size) ?? String(rivalGone.size)));
  if (rivalProfile.size > 0) lines.push(UNMEASURED_PLAIN.rivalProfile(formatNumber(rivalProfile.size) ?? String(rivalProfile.size)));
  return lines.slice(0, MAX_SUMMARY_LINES);
}
