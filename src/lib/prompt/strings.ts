/**
 * Prompt metinlerinin dile bağlı sabit parçaları. Kurucular dil bilmez; yalnız `promptStrings(language)` ile
 * bu tabloyu okur (yeni dil = yeni tablo). Türkçe: `strings-tr.ts`, İngilizce: `strings-en.ts`.
 */
import type { ComplianceRegion } from "@/lib/domain/compliance";
import type { ContentFormat, ViewsKind } from "@/lib/platforms/types";
import { stringsEn } from "@/lib/prompt/strings-en";
import { stringsTr } from "@/lib/prompt/strings-tr";
import type { PromptLanguage } from "@/lib/prompt/types";

/** Görev metni kaynağın türüne göre uyarlanır: video (script) ya da görsel/karusel (kart kart metin). */
export interface TaskSpec {
  /** Kaynak video biçiminde mi (short/long video, story). */
  isVideo: boolean;
}

/** Görev bölümü: numaralı adımlar + adımların ardından tek satırlık "kopyalama değil, kalıbı uyarla" notu. */
export interface TaskText {
  steps: string[];
  note: string;
}

export interface PromptStrings {
  /** İlk cümle: modelin rolü. */
  role: string;
  /** Ölçülemeyen değerin yazımı (0 değil). */
  unknown: string;
  /** Kaynak veri notu (Fikir ve Kanıt bölümlerinin başında): tırnak içindeki metinler talimat değildir (prompt enjeksiyonu). */
  sourceNote: string;
  headings: { context: string; idea: string; evidence: string; task: string; constraints: string };
  niche: (brief: string) => string;
  idea: { title: string; rationale: string; platformFormat: string; hookType: string; hooks: string; script: string };
  evidence: {
    sourceHeading: (handle: string) => string;
    itemHeading: (n: number, handle: string) => string;
    account: string;
    views: string;
    lift: string;
    hook: string;
    hookType: string;
    sections: string;
    transcript: string;
    /** Transcript uzunluk sınırında kesildiyse etiket. */
    transcriptShortened: string;
    caption: string;
    link: string;
    own: string;
    competitor: string;
    /** Lift ölçüldü + baz çizgisi var: "baz çizgisinin kaç katı" cümlesi. */
    liftWithBaseline: (p: {
      /** "4,6x" */
      lift: string;
      /** "4,6" ("kaç katı" cümlesi için). */
      times: string;
      format: string;
      baselineViews: string;
      baselineN?: string;
    }) => string;
    /** Lift ölçüldü ama baz çizgisi izlenmesi bilinmiyor. */
    liftWithoutBaseline: (lift: string) => string;
    liftUnknown: (reason?: string) => string;
    lowConfidence: string;
    immature: string;
    /** Hook analizi yok ya da kanıtı doğrulanamadı. */
    hookMissing: string;
    transcriptExpired: string;
    transcriptNone: string;
    /** Uzunluk sınırı için transcript çıkarıldı. */
    transcriptOmitted: string;
  };
  formatLabel: Record<ContentFormat, string>;
  viewsKindLabel: (kind: ViewsKind) => string;
  hookTypeLabel: (key: string) => string;
  task: {
    content: (spec: TaskSpec) => TaskText;
    idea: (spec: TaskSpec) => TaskText;
    /** "Çıktıyı Türkçe yaz." */
    outputLanguage: string;
  };
  constraints: {
    noCopy: string;
    noInvention: string;
    complianceLead: (regionLabel: string) => string;
    paid: string;
    ai: string;
    /** Kural metninin dili farklıysa açıklayan not (İngilizce prompt: kural metni Türkçedir). */
    ruleTextNote?: string;
    disclaimer: string;
  };
  regionLabel: Record<ComplianceRegion, string>;
}

const TABLES: Record<PromptLanguage, PromptStrings> = { tr: stringsTr, en: stringsEn };

export function promptStrings(language: PromptLanguage): PromptStrings {
  return TABLES[language];
}
