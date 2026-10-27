/** Senaryo editörü + olgu kontrolü sonucu tipleri (`IdeaDetails.scriptReview`; `domain/intel.ts` bunları yeniden dışa açar). */

/** Senaryo editörünün bir olgu iddiası hakkındaki kararı (modelin kendi bilgisi; web erişimi yok). */
export const SCRIPT_CLAIM_VERDICTS = ["ok", "uncertain", "wrong"] as const;
export type ScriptClaimVerdict = (typeof SCRIPT_CLAIM_VERDICTS)[number];

export interface ScriptClaim {
  /** Özgün senaryodan birebir alınmış iddia parçası. */
  text: string;
  verdict: ScriptClaimVerdict;
  /** Türkçe kısa not: neden (ya da doğru olan). */
  note: string;
}

/**
 * Senaryo editörü turunun sonucu (`ideas.details.scriptReview`): konuşma diline düzeltme + olgu kontrolü. `wrong` iddialar senaryoda
 * düzeltilmiştir; `uncertain` olanlar yayından önce doğrulanmalıdır (`verifyBeforePublish`). Tur başarısızsa alan hiç yazılmaz.
 */
export interface ScriptReview {
  /** Senaryo editör turunda değişti mi (`details.script` revize metindir, özgünü `originalScript` taşır). */
  revised: boolean;
  originalScript?: string;
  /** Konuşma diline yapılan düzeltmelerin kısa Türkçe listesi (düzeltme yoksa boş). */
  changes: string[];
  claims: ScriptClaim[];
  /** Düzeltme sayısı = konuşma düzeltmeleri + düzeltilen yanlış olgular. */
  corrections: number;
  /** "Yayından önce doğrula" listesi (`uncertain` iddialar, kısa Türkçe satırlar). */
  verifyBeforePublish: string[];
  promptVersion: string;
}
