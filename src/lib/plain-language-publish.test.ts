import { describe, expect, it } from "vitest";

import { PANEL_JARGON } from "@/lib/plain-language";
import {
  ANALYSIS_PLAIN,
  CONTENT_PLAIN,
  COMPLIANCE_NOTE,
  FIX_PLAIN,
  NO_CONNECTED_ACCOUNT_NOTE,
  QUOTA_NOTE,
  TRIAL_GRADUATION_PLAIN,
  TRIAL_PLAIN,
  VIDEO_UPLOAD_SOON,
  WHY_PLAIN,
  chartSummary,
  emptyQueueText,
  fixModeOf,
  plainPublishError,
  tierLegendPlain,
  trialBadgeText,
  unsupportedPublishNote,
  whyFormula,
  whyLowSample,
  whyNormalDefinition,
} from "@/lib/plain-language-publish";

/** Müşteriye görünen her sabit metin: panel jargonu ve iç ifadeler yok (D2-08, D2-10). */
const INTERNAL = /Faz \d|container|Trial|Meta API|\btr\.|Transcript|\bSTT\b|\bhook\b|baz çizgisi|medyan|\blift\b|agy|Antigravity/i;

function customerStrings(): string[] {
  return [
    ...Object.values(TRIAL_PLAIN),
    ...Object.values(TRIAL_GRADUATION_PLAIN).flatMap((entry) => Object.values(entry)),
    trialBadgeText("manual"),
    trialBadgeText("performance"),
    VIDEO_UPLOAD_SOON,
    COMPLIANCE_NOTE,
    QUOTA_NOTE,
    NO_CONNECTED_ACCOUNT_NOTE,
    emptyQueueText(true),
    emptyQueueText(false),
    ...Object.values(FIX_PLAIN).flatMap((entry) => Object.values(entry)),
    ...Object.values(CONTENT_PLAIN),
    ...Object.values(WHY_PLAIN),
    ...Object.values(ANALYSIS_PLAIN),
    tierLegendPlain(0, 1.5),
    tierLegendPlain(3, 3),
    whyLowSample(4, 10),
    whyNormalDefinition("Reels", "izlenme", 25, 25),
    whyFormula(3108, 7337, 0.4) ?? "",
  ];
}

describe("yayın / video düz dil sözlüğü", () => {
  it("hiçbir müşteri metni panel jargonu ya da iç ifade taşımaz", () => {
    for (const text of customerStrings()) {
      expect(text, text).not.toMatch(INTERNAL);
    }
    // Ana sözlüğün ortak jargon deseni de eşleşmemeli.
    for (const text of customerStrings()) expect(text, text).not.toMatch(PANEL_JARGON);
  });

  it("düzeltme biçimi: onay bekleyen / süresi dolan / taslak 'Kopyala ve düzelt', başarısız 'Yeniden dene', gerisi yok", () => {
    expect(fixModeOf("awaiting_approval")).toBe("fix");
    expect(fixModeOf("expired")).toBe("fix");
    expect(fixModeOf("draft")).toBe("fix");
    expect(fixModeOf("failed")).toBe("retry");
    for (const status of ["approved", "container_pending", "ready", "publishing", "published", "cancelled"] as const) {
      expect(fixModeOf(status)).toBeUndefined();
    }
    expect(FIX_PLAIN.fix.button).toBe("Kopyala ve düzelt");
    expect(FIX_PLAIN.retry.button).toBe("Yeniden dene");
  });

  it("hata metni: container / Meta API düz dile çevrilir, bilinmeyen metin atılmaz", () => {
    expect(plainPublishError("Container 24 saat içinde yayınlanmadı ve süresi doldu; yeniden oluşturulması gerekiyor.", "Instagram")).toBe(
      "Yayın süresi doldu: video 24 saat içinde yayınlanmadı. Yeniden oluşturman gerekiyor.",
    );
    expect(plainPublishError("Meta API videoyu işleyemedi: en-boy oranı 9:16 olmalı (yüklenen 16:9). Videoyu yeniden yükleyin.", "Instagram")).toBe(
      "Instagram videoyu işleyemedi: en-boy oranı 9:16 olmalı (yüklenen 16:9). Videoyu yeniden yükle.",
    );
    expect(plainPublishError("Bağlantı koptu.", "Instagram")).toBe("Bağlantı koptu.");
  });

  it("yayın açılamayan hesaplar için tek not: hesap adı + platform; yayın açabilen hesap yoksa bunu da söyler (D2-07)", () => {
    const tiktok = [{ handle: "kahveci", platformLabel: "TikTok" }];
    expect(unsupportedPublishNote([], true)).toBeUndefined();
    expect(unsupportedPublishNote(tiktok, true)).toBe("@kahveci (TikTok) için buradan yayın henüz yok; bu hesabın planı ve fikirleri çalışmaya devam eder.");
    expect(unsupportedPublishNote(tiktok, false)).toContain("Yayın işi açılabilecek başka bir hesabın yok.");
    expect(unsupportedPublishNote([...tiktok, { handle: "ikinci", platformLabel: "TikTok" }], true)).toContain("@kahveci (TikTok), @ikinci (TikTok)");
    // Düğme yoksa boş durum ona yönlendirmez.
    expect(emptyQueueText(true)).toContain("“Yeni yayın”");
    expect(emptyQueueText(false)).not.toContain("Yeni yayın");
  });

  it("grafik özeti: en çok / en az izlenen; tek video; boş liste → undefined", () => {
    const point = (title: string, views: number) => ({ title, views, date: "1 Eki 2026" });
    expect(chartSummary([])).toBeUndefined();
    expect(chartSummary([point("A", 5)])).toBe("1 video: “A” (5 izlenme, 1 Eki 2026).");
    expect(chartSummary([point("A", 5), point("B", 900), point("C", 2)])).toBe(
      "3 video. En çok izlenen: “B” (900 izlenme, 1 Eki 2026). En az izlenen: “C” (2 izlenme, 1 Eki 2026).",
    );
  });

  it("video sayfası cümleleri: formül düz dilde, ölçülemeyen oranda cümle kurulmaz", () => {
    expect(whyFormula(3108, 7337, 0.4)).toBe("3.108 izlenme; hesabının normali 7.337, yani normalinin 0,4 katı izlendi.");
    expect(whyFormula(3108, 7337, undefined)).toBeUndefined();
    expect(whyFormula(undefined, 7337, 2)).toBeUndefined();
    expect(whyLowSample(4, 10)).toBe("Az örnek, emin değilim: kıyaslama 4 videoya dayanıyor; güvenilir olması için en az 10 gerekir.");
  });
});
