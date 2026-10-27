/**
 * Uyum denetimi ve deneme yayını için ekran etiketleri: panel, rozetler, yayın dialog'u ve Ayarlar bölge alanı aynı
 * metni kullanır (kopya yok). Bölgenin tam adı `COMPLIANCE_REGION_LABEL`'dadır (`lib/domain/compliance.ts`).
 */
import type { ComplianceRegion, ComplianceStatus } from "@/lib/domain/compliance";
import type { TrialGraduation } from "@/lib/domain/publish";
import { TRIAL_GRADUATION_PLAIN } from "@/lib/plain-language-publish";

/** Durum başlığı: ok = yeşil, warn = sarı, fail = kırmızı. */
export const COMPLIANCE_STATUS_LABEL: Record<ComplianceStatus, string> = {
  ok: "Uyumlu",
  warn: "Dikkat",
  fail: "Onaylanamaz",
};

/** Denetim panelindeki kısa bölge etiketi. */
export const REGION_SHORT_LABEL: Record<ComplianceRegion, string> = {
  TR: "TR",
  US: "ABD",
  TR_US: "TR+ABD",
};

/** Ayarlar'daki bölge seçicisi. */
export const REGION_OPTION_LABEL: Record<ComplianceRegion, string> = {
  TR: "Türkiye",
  US: "ABD (FTC)",
  TR_US: "Türkiye + ABD",
};

/** Seçili bölgenin kısa açıklaması (Ayarlar). */
export const REGION_DESCRIPTION: Record<ComplianceRegion, string> = {
  TR: "Ücretli iş birliğinde “Reklam” ya da “Tanıtım” ibaresi, reklam veren adı ve yapay zekâ beyanı denetlenir.",
  US: "FTC ilkelerine göre ücretli iş birliğinde #ad / “Paid partnership” ibaresi denetlenir; yapay zekâ beyanı yalnız önerilir.",
  TR_US: "İki bölgenin kuralları birlikte uygulanır; daha sıkı olan belirleyici olur.",
};

/** Deneme yayını "takipçilere açılma" seçicisi (yayın dialog'u); metin sözlükten (`plain-language-publish.ts`). */
export const TRIAL_GRADUATION_OPTION_LABEL: Record<TrialGraduation, string> = {
  manual: TRIAL_GRADUATION_PLAIN.manual.option,
  performance: TRIAL_GRADUATION_PLAIN.performance.option,
};
