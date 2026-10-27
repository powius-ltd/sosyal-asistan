/**
 * Yayın formunun saf durum yardımcıları: bir işten form değerleri ("Kopyala ve düzelt"), alan doğrulaması ve sınır cümleleri.
 * Sunucu yine kendi kurallarıyla doğrular (`publish-schemas.ts`, depo); buradaki denetim yalnız hatayı alanın yanında göstermek içindir.
 */
import { formatInTimeZone } from "date-fns-tz";

import { ACCOUNT_REQUIRED_MESSAGE, type PublishField } from "@/components/publish/publish-messages";
import { EMPTY_FLAGS, type PublishFlags } from "@/components/publish/publish-flags";
import {
  CAPTION_MAX,
  HASHTAG_MAX,
  captionRequiredProblem,
  countCaptionChars,
  countHashtags,
  type PublishJob,
} from "@/lib/domain/publish";
import { formatNumber } from "@/lib/format";

/** `<input type="datetime-local">` biçimi. */
const LOCAL_DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm";

/** Forma kopyalanacak değerler (sunucuya serileştirilebilir). */
export interface PublishPrefill {
  socialAccountId: string;
  caption: string;
  scheduledAt: string;
  flags: PublishFlags;
}

/**
 * İşin alanları forma: planlanan zaman workspace saat diliminde; geçmişe düşmüşse boş bırakılır (sunucu "geçmişte olamaz" derdi).
 * `now` çağıranın tek saatidir.
 */
export function prefillFromJob(job: PublishJob, timeZone: string, now: Date): PublishPrefill {
  const at = job.scheduledFor ? new Date(job.scheduledFor) : undefined;
  const scheduledAt =
    at !== undefined && !Number.isNaN(at.getTime()) && at.getTime() >= now.getTime() ? formatInTimeZone(at, timeZone, LOCAL_DATETIME_FORMAT) : "";
  return {
    socialAccountId: job.socialAccountId,
    caption: job.caption ?? "",
    scheduledAt,
    flags: {
      ...EMPTY_FLAGS,
      paidPartnership: job.paidPartnership,
      advertiserName: job.advertiserName ?? "",
      aiGenerated: job.aiGenerated,
      trialEnabled: job.trial?.enabled ?? false,
      trialGraduation: job.trial?.graduation ?? EMPTY_FLAGS.trialGraduation,
    },
  };
}

/** Açıklama sınırı cümlesi (yoksa undefined): kaç karakter fazla olduğunu söyler. */
export function captionLimitText(caption: string): string | undefined {
  const length = countCaptionChars(caption);
  if (length > CAPTION_MAX) {
    return `Açıklama ${formatNumber(length)} karakter; en fazla ${formatNumber(CAPTION_MAX)} olabilir (${formatNumber(length - CAPTION_MAX)} karakter fazla). Kısalt.`;
  }
  const hashtags = countHashtags(caption);
  if (hashtags > HASHTAG_MAX) return `Açıklamada ${hashtags} hashtag var; en fazla ${HASHTAG_MAX} olabilir.`;
  return undefined;
}

export interface FieldError {
  field: PublishField;
  message: string;
}

/** Gönderme öncesi ilk sorun (sırayla: hesap, açıklama). Zaman denetimi sunucudadır (tek saat). */
export function firstFieldError(values: { accountId: string; caption: string; status: "draft" | "awaiting_approval" }): FieldError | undefined {
  if (values.accountId === "") return { field: "account", message: ACCOUNT_REQUIRED_MESSAGE };
  const limit = captionLimitText(values.caption);
  if (limit) return { field: "caption", message: limit };
  const required = values.status === "awaiting_approval" ? captionRequiredProblem(values.caption) : undefined;
  if (required) return { field: "caption", message: required };
  return undefined;
}
