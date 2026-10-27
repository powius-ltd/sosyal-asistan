/** Test yardımcısı: örnek kanıt video ve fikir (yalnız testlerde import edilir). */
import type { PromptIdea, PromptVideo } from "@/lib/prompt/types";

export function testVideo(overrides: Partial<PromptVideo> = {}): PromptVideo {
  return {
    ownerHandle: "kahvecininyeri",
    isOwn: false,
    platform: "instagram",
    format: "short_video",
    views: 1_250_000,
    viewsKind: "ig_play_count",
    lift: 4.62,
    baselineViews: 270_000,
    baselineN: 25,
    lowConfidence: false,
    immature: false,
    caption: "Sabah rutini: 3 hata\nDevamı yorumlarda",
    url: "https://www.instagram.com/reel/abc123/",
    hookText: "Sabah kahveni yanlış içiyorsun.",
    hookType: "mistake_warning",
    sections: [
      { type: "hook", quote: "Sabah kahveni yanlış içiyorsun." },
      { type: "value", quote: "Önce bir bardak su, sonra kahve." },
    ],
    transcript: { state: "available", text: "Sabah kahveni yanlış içiyorsun. Önce bir bardak su iç, sonra kahveni al." },
    ...overrides,
  };
}

export function testIdea(overrides: Partial<PromptIdea> = {}): PromptIdea {
  return {
    title: "Sabah kahvesi hatası",
    rationale: "İki rakipte “yanlış yapıyorsun” hook'u baz çizgisinin 3 katını aştı.",
    platform: "instagram",
    format: "short_video",
    hooks: ["Sabah kahveni yanlış içiyorsun.", "Kahveden önce bunu yap."],
    hookType: "mistake_warning",
    scriptOutline: ["Hook: hatayı söyle", "Neden yanlış", "Doğrusu", "CTA: kaydet"],
    ...overrides,
  };
}
