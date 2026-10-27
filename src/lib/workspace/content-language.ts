/**
 * Çalışma alanının İÇERİK dilini çözer (saf; DB/LLM yok): hesabın yayınlayacağı hook/script/açıklama taslağı hangi dilde yazılır.
 * Panel metinleri (gerekçe, başlık) bundan bağımsız hep Türkçedir. Sıra:
 *   1. çalışma alanı ayarı (`Workspace.contentLanguage`; NULL = ayarlanmadı)
 *   2. çıkarım: kendi içeriklerinin konuşma dili (`transcripts.language`) — dili bilinen en az `INFER_MIN_SAMPLES` içerik ve
 *      tek bir dilin KESİN çoğunluğu (> yarı). Desteklenmeyen/bilinmeyen dil ("und", "de") örnek sayılmaz.
 *   3. uyum bölgesi: TR → tr; US, TR_US → en
 *   4. varsayılan: en
 * Hangi kaynaktan geldiği de döner (`source`, Türkçe `note`): haftalık plan notuna yazılır, kullanıcı varsayımı görür.
 */
import type { ComplianceRegion } from "@/lib/domain/compliance";
import { CONTENT_LANGUAGE_LABEL, toContentLanguage, type ContentLanguage } from "@/lib/domain/content-language";

/** Çıkarım için dili bilinen en az kendi içerik sayısı. */
export const INFER_MIN_SAMPLES = 3;
export const DEFAULT_CONTENT_LANGUAGE: ContentLanguage = "en";

export type ContentLanguageSource = "setting" | "inferred" | "region" | "default";

export const CONTENT_LANGUAGE_SOURCE_LABEL: Record<ContentLanguageSource, string> = {
  setting: "ayar",
  inferred: "çıkarım",
  region: "uyum bölgesi",
  default: "varsayılan",
};

/** Uyum bölgesinin ana dili (bölge yalnız ülke kuralıdır; dil için son çaredir). */
const REGION_LANGUAGE: Record<ComplianceRegion, ContentLanguage> = { TR: "tr", US: "en", TR_US: "en" };

/** Uyum bölgesinden hedef kitle bölgesi (yalnız üslup ipucu: İngilizce'de Amerikan/İngiliz ayrımı). TR_US'te kitle ABD'dedir. */
const REGION_AUDIENCE: Record<ComplianceRegion, string> = { TR: "TR", US: "US", TR_US: "US" };
export const audienceRegionOf = (region: ComplianceRegion): string => REGION_AUDIENCE[region];

export interface ResolveContentLanguageInput {
  /** `workspace.contentLanguage`. */
  configured?: ContentLanguage;
  /** Kendi içeriklerinin konuşma dili kodları (içerik başına en çok biri; bilinmeyen undefined/"und"). */
  ownContentLanguages?: readonly (string | undefined | null)[];
  complianceRegion?: ComplianceRegion;
}

export interface ResolvedContentLanguage {
  language: ContentLanguage;
  source: ContentLanguageSource;
  /** Plan notuna yazılan tek Türkçe cümle (dil + kaynak + dayanak). */
  note: string;
}

/** Desteklenen dillere göre örnek sayımı (bilinmeyen/desteklenmeyen kod sayılmaz). */
function countSamples(codes: readonly (string | undefined | null)[]): Map<ContentLanguage, number> {
  const counts = new Map<ContentLanguage, number>();
  for (const code of codes) {
    const language = toContentLanguage(code);
    if (language !== undefined) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return counts;
}

export function resolveContentLanguage(input: ResolveContentLanguageInput): ResolvedContentLanguage {
  const label = (language: ContentLanguage): string => CONTENT_LANGUAGE_LABEL[language];

  if (input.configured !== undefined) {
    return { language: input.configured, source: "setting", note: `İçerik dili: ${label(input.configured)} (çalışma alanı ayarı).` };
  }

  const counts = countSamples(input.ownContentLanguages ?? []);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const leader = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (leader !== undefined && total >= INFER_MIN_SAMPLES && leader[1] * 2 > total) {
    const [language, count] = leader;
    return {
      language,
      source: "inferred",
      note: `İçerik dili: ${label(language)} (çıkarım: konuşma dili bilinen ${total} kendi videonun ${count}'i ${label(language)}).`,
    };
  }

  const reason = total < INFER_MIN_SAMPLES ? `kendi videolarından çıkarım için yeterli örnek yok (${total}/${INFER_MIN_SAMPLES})` : "kendi videolarının dili tek bir dilde çoğunluk oluşturmuyor";
  if (input.complianceRegion !== undefined) {
    const language = REGION_LANGUAGE[input.complianceRegion];
    return { language, source: "region", note: `İçerik dili: ${label(language)} (uyum bölgesi ${input.complianceRegion}; ${reason}).` };
  }
  return { language: DEFAULT_CONTENT_LANGUAGE, source: "default", note: `İçerik dili: ${label(DEFAULT_CONTENT_LANGUAGE)} (varsayılan; ayar yok, ${reason}, uyum bölgesi bilinmiyor).` };
}
