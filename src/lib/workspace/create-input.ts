/**
 * Çalışma alanı oluşturma girdisi (saf): panel action'ı, `scripts/workspace.mts` ve kayıt (`registry.ts`) AYNI şemayı kullanır.
 * Boş metin "verilmedi" sayılır (form boş alanı `""` gönderir). Mesajlar Türkçe; `parseOrThrow` ilkini `invalid_input` olarak taşır.
 */
import { z } from "zod";

import { NICHE_BRIEF_MAX_LENGTH } from "@/lib/data/queries";
import { isValidPlatformHandle } from "@/lib/data/handle-input";
import { workspacePatchSchema } from "@/lib/data/workspace-patch";
import { ACCOUNT_TYPES, DEFAULT_ACCOUNT_TYPE } from "@/lib/domain/account-type";
import { COMPLIANCE_REGIONS, DEFAULT_COMPLIANCE_REGION } from "@/lib/domain/compliance";
import { CONTENT_LANGUAGES } from "@/lib/domain/content-language";
import { HANDLE_PATTERN } from "@/lib/domain/competitor";
import { PLATFORMS } from "@/lib/domain/platform";
import { DEFAULT_TIMEZONE, LOCALE } from "@/lib/format";
import { hasPlatformModule } from "@/lib/platforms/registry";
import { foldTurkish } from "@/lib/text";

export const WORKSPACE_NAME_MAX = 100;
/** DB `slug` kuralı `^[a-z0-9][a-z0-9-]{0,62}$`; `-2` gibi sonek için 3 karakter pay bırakılır. */
const SLUG_BASE_MAX = 60;
const FALLBACK_SLUG = "calisma-alani";

const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone });
    return true;
  } catch {
    return false;
  }
}

const timeZoneSchema = z
  .string()
  .trim()
  .max(64, "Saat dilimi en çok 64 karakter olabilir.")
  .refine(isValidTimeZone, "Geçersiz saat dilimi (örn. Europe/Istanbul, America/New_York).");

/** Kullanıcı adı: baştaki @ atılır, küçük harfe çevrilir, `HANDLE_PATTERN` (küçük harf, rakam, `.`, `_`, `-`; ≤ 50) ile denetlenir. */
const handleSchema = z
  .string({ error: "Kendi hesabın kullanıcı adı gerekli." })
  .trim()
  .transform((value) => value.replace(/^@/, "").toLowerCase())
  .refine((value) => HANDLE_PATTERN.test(value), "Kullanıcı adı yalnız harf, rakam, nokta, alt çizgi ve tire içerebilir (en çok 50 karakter).");

export const createWorkspaceSchema = z
  .object({
  name: z
    .string({ error: "Çalışma alanı adı gerekli." })
    .trim()
    .min(1, "Çalışma alanı adı boş olamaz.")
    .max(WORKSPACE_NAME_MAX, `Çalışma alanı adı en çok ${WORKSPACE_NAME_MAX} karakter olabilir.`),
  handle: handleSchema,
  platform: z
    .preprocess(blankToUndefined, z.enum(PLATFORMS, { error: "Geçersiz platform." }).default("instagram"))
    .refine((platform) => hasPlatformModule(platform), "Bu platform için henüz destek yok."),
  nicheBrief: z.preprocess(
    blankToUndefined,
    z
      .string({ error: "Niş özeti metin olmalı." })
      .trim()
      .refine((text) => Array.from(text).length <= NICHE_BRIEF_MAX_LENGTH, `Niş özeti en çok ${NICHE_BRIEF_MAX_LENGTH} karakter olabilir.`)
      .optional(),
  ),
  timezone: z.preprocess(blankToUndefined, timeZoneSchema.default(DEFAULT_TIMEZONE)),
  /** Boşsa çalışma alanı saat dilimi kullanılır (DB'de NULL). */
  audienceTimezone: z.preprocess(blankToUndefined, timeZoneSchema.optional()),
  complianceRegion: z.preprocess(
    blankToUndefined,
    z.enum(COMPLIANCE_REGIONS, { error: "Uyum bölgesi TR, US ya da TR_US olmalı." }).default(DEFAULT_COMPLIANCE_REGION),
  ),
  /** Boşsa ayarlanmaz (DB'de NULL): dil kendi transcript dillerinden / uyum bölgesinden çözülür. */
  contentLanguage: z.preprocess(blankToUndefined, z.enum(CONTENT_LANGUAGES, { error: "İçerik dili tr ya da en olmalı." }).optional()),
  /** Boşsa işletme (`DEFAULT_ACCOUNT_TYPE`, DB varsayılanı). */
  accountType: z.preprocess(blankToUndefined, z.enum(ACCOUNT_TYPES, { error: "Hesap türü business, creator ya da mixed olmalı." }).default(DEFAULT_ACCOUNT_TYPE)),
  })
  // Platformun KESİN kullanıcı adı kuralı (uzunluk, karakter kümesi) modülden: genel biçimi geçen ad o platformda geçersiz olabilir.
  .refine((value) => isValidPlatformHandle(value.platform, value.handle), { path: ["handle"], error: "Bu kullanıcı adı seçilen platformda geçerli değil." });

export type CreateWorkspaceInput = z.output<typeof createWorkspaceSchema>;

/**
 * `npm run workspace -- set` girdisi: yalnız hesap türü ve/veya içerik dili (başka alan yok); en az biri verilmelidir. Doğrulama panel
 * ayarlarıyla aynı şemadan (`workspacePatchSchema`); komut satırı boş değeri "verilmedi" sayar.
 */
/** Komut satırı sayısı: boş = verilmedi; sayıya çevrilemeyen metin doğrulamada "sayı olmalı" hatası verir. */
const cliNumber = (field: z.ZodType<number | undefined>) => z.preprocess((value) => (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : blankToUndefined(value)), field) as z.ZodType<number | undefined>;

export const workspaceSettingsSchema = z
  .object({
    accountType: z.preprocess(blankToUndefined, workspacePatchSchema.shape.accountType),
    contentLanguage: z.preprocess(blankToUndefined, z.enum(CONTENT_LANGUAGES, { error: "İçerik dili tr ya da en olmalı." }).optional()),
    /** Yönetici ajan: aylık tavan (USD; vermek ONAYDIR), toplama sıklığı, video sayısı, hedef rakip. Sınırlar `workspacePatchSchema`'dan. */
    agentMonthlyCapUsd: cliNumber(workspacePatchSchema.shape.agentMonthlyCapUsd),
    collectEveryDays: cliNumber(workspacePatchSchema.shape.collectEveryDays),
    collectVideoLimit: cliNumber(workspacePatchSchema.shape.collectVideoLimit),
    rivalTarget: cliNumber(workspacePatchSchema.shape.rivalTarget),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: "En az bir alan ver: --type=… --lang=… --agent-cap=<usd> --collect-every=<gün> --videos=<sayı> --rivals=<sayı>.",
  });

export type WorkspaceSettingsInput = z.output<typeof workspaceSettingsSchema>;

/** Ad → slug tabanı (`foldTurkish`: "Ayşe'nin Kahvesi" → "ayse-nin-kahvesi"). Boşsa sabit ad; benzersizlik SQL fonksiyonunda (`-2`, `-3` …). */
export function slugBase(name: string): string {
  const slug = foldTurkish(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_BASE_MAX)
    .replace(/-+$/g, "");
  return slug === "" ? FALLBACK_SLUG : slug;
}
