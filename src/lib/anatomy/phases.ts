/**
 * Video fazları (Kreatif Anatomisi, `domain/anatomy.ts`): analizdeki bölümlerden KODLA türetilir (taksonomide "giriş" bölüm tipi
 * yoktur). Saf; LLM ve DB yok.
 *
 *  - Hook  = `hook` bölümleri.
 *  - CTA   = `cta` bölümleri (videonun ortasında olabilir; CTA'dan sonraki gövde AYRI parçadır).
 *  - Gövde = `insight/proof/practice` (bilinmeyen tür de) ve gövde başladıktan sonraki `story/problem`.
 *  - Giriş = gövdenin ilk bölümünden ÖNCEKİ `story/problem` (hook'tan sonra).
 *  - Bölüm bitişi = sonraki bölümün `startSec`'i; sonuncuda video süresi. Zaman yoksa `undefined` (0 değil).
 * Bitişik aynı fazdaki bölümler tek parçada birleşir.
 */
import type { AnatomyPhase, AnatomyQuote, PhaseSpan } from "@/lib/domain/anatomy";
import type { AnalysisSection } from "@/lib/domain/intel";

/** Giriş sayılabilen bölüm tipleri (gövde başlamadan önce). */
const INTRO_TYPES: ReadonlySet<string> = new Set(["story", "problem"]);

/**
 * Bölümleri zamana göre sıralar: yalnız HEPSİNİN `startSec`'i varsa (kararlı sıralama); aksi halde analizin verdiği sıra korunur
 * (zamansız bölümün yerini tahmin etmeyiz).
 */
export function orderSections(sections: readonly AnalysisSection[]): AnalysisSection[] {
  const allTimed = sections.length > 1 && sections.every((s) => s.startSec !== undefined);
  return allTimed ? [...sections].sort((a, b) => (a.startSec as number) - (b.startSec as number)) : [...sections];
}

/** Her bölümün fazı (sıra önemlidir: gövde başlayınca `story/problem` artık gövdedir). */
function classify(ordered: readonly AnalysisSection[]): AnatomyPhase[] {
  let bodyStarted = false;
  return ordered.map((section): AnatomyPhase => {
    if (section.type === "hook") return "hook";
    if (section.type === "cta") return "cta";
    if (INTRO_TYPES.has(section.type)) return bodyStarted ? "body" : "intro";
    bodyStarted = true;
    return "body";
  });
}

const quoteOf = (section: AnalysisSection): AnatomyQuote => ({ type: section.type, quote: section.quote, startSec: section.startSec });

/** `end` geçerli bitiş mi: tanımlı, sonlu ve (başlangıç biliniyorsa) ondan önce değil. Başlangıç bilinmese de bitiş korunur. */
function validEnd(start: number | undefined, end: number | undefined): number | undefined {
  if (end === undefined || !Number.isFinite(end)) return undefined;
  return start !== undefined && end < start ? undefined : end;
}

/**
 * Bölümlerden zaman sıralı faz parçaları. Bölüm yoksa boş. `durationSec` yalnız SON bölümün bitişi içindir (yoksa o parçanın
 * `endSec`/`durationSec`'i `undefined`).
 */
export function derivePhases(sections: readonly AnalysisSection[], durationSec?: number): PhaseSpan[] {
  const ordered = orderSections(sections);
  const phases = classify(ordered);
  const spans: PhaseSpan[] = [];
  let firstIndex = 0;
  for (let i = 0; i < ordered.length; i++) {
    const isLastOfSpan = i === ordered.length - 1 || phases[i + 1] !== phases[i];
    if (!isLastOfSpan) continue;
    const start = ordered[firstIndex].startSec;
    const end = validEnd(start, i < ordered.length - 1 ? ordered[i + 1].startSec : durationSec);
    spans.push({
      phase: phases[i],
      startSec: start,
      endSec: end,
      durationSec: start !== undefined && end !== undefined ? end - start : undefined,
      sections: ordered.slice(firstIndex, i + 1).map(quoteOf),
    });
    firstIndex = i + 1;
  }
  return spans;
}
