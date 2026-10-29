/**
 * Fikri sohbetle düzeltmenin müşteri metinleri (SPN-35). Düz dil: "açılış" denir (hook değil); panel jargonu yok (`PANEL_JARGON` testle korunur).
 * Ana sözlüğe (`plain-language.ts`) dokunmamak için ayrı dosyadır (`plain-language-onboarding.ts` ile aynı desen).
 */
export const REVISE_PLAIN = {
  notFound: "Bu fikri bulamadım; bu haftanın planındaki bir fikri söyler misin?",
  notInPlan: "Bu fikir bu haftanın planında görünmüyor; planındaki bir fikri söyler misin?",
  locked: "Bu fikir artık değiştirilemez (bırakılmış, zamanlanmış ya da yayınlanmış).",
  inProduction: "Bu fikrin fişi üretime gönderildi; üretilen videoyla uyumsuz olmasın diye metni değiştirmiyorum.",
  rejected: "İstediğin değişikliği güvenli biçimde yazamadım (metin ya öncekiyle aynı çıktı ya da bir rakip metnine çok benzedi). Fikir olduğu gibi duruyor; isteğini başka sözlerle yazar mısın?",
  failed: "Değişikliği şimdi yapamadım; fikir olduğu gibi duruyor. Biraz sonra yeniden dener misin?",
  done: (title: string, summary: string): string => `"${title}" fikrini değiştirdim: ${summary} Eski hâli saklandı.`,
} as const;
