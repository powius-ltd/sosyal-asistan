import { describe, expect, it } from "vitest";

import { CREATIVE_ANGLE_IDS, FUNNEL_STAGE_IDS } from "@/lib/domain/creative-matrix";
import { CREDIT_ITEMS } from "@/lib/domain/credit-pricing";
import { HOOK_TYPES } from "@/lib/domain/hook-types";
import { CHECKPOINT_DAYS } from "@/lib/domain/outcomes";
import { JOB_KINDS, JOB_OUTCOME_CODES, JOB_STATUSES, JOB_STEP_IDS, JOB_STEP_STATUSES } from "@/lib/domain/panel-job";
import { CTA_TYPES } from "@/lib/domain/taxonomy";
import { CONFIDENCE_LEVELS } from "@/lib/domain/weekly-plan";
import {
  ANGLE_PLAIN,
  checkpointPhrase,
  CONFIDENCE_PLAIN,
  confidencePhrase,
  CREDIT_ITEM_PLAIN,
  CREDIT_NOTE_PLAIN,
  CREDIT_UNKNOWN_PLAIN,
  creditAmountPhrase,
  creditLinePhrase,
  CTA_TYPE_PLAIN,
  FUNNEL_STAGE_PLAIN,
  hookTypePlain,
  JOB_CANCELLING_PLAIN,
  JOB_KIND_PLAIN,
  JOB_OUTCOME_PLAIN,
  JOB_PREVIEW_PLAIN,
  JOB_SCREEN_PLAIN,
  JOB_STALE_PLAIN,
  JOB_STATUS_PLAIN,
  JOB_STEP_PLAIN,
  JOB_STEP_STATUS_PLAIN,
  jobOutcomePhrase,
  jobStripPhrase,
  jobTitlePhrase,
  jobTookPhrase,
  liftPhrase,
  liftTimes,
  OUTLIER_PLAIN,
  PANEL_JARGON as JARGON,
  PLAIN_TERMS,
} from "@/lib/plain-language";

describe("liftPhrase / liftTimes", () => {
  it("lift'i düz cümleye çevirir (tr-TR ondalık)", () => {
    expect(liftPhrase(2.3)).toBe("normalinin 2,3 katı izlendi");
    expect(liftPhrase(5.94)).toBe("normalinin 5,9 katı izlendi");
    expect(liftPhrase(12.34)).toBe("normalinin 12,3 katı izlendi");
    expect(liftPhrase(0.6)).toBe("normalinin 0,6 katı izlendi");
    expect(liftTimes(5.9)).toBe("5,9 katı");
  });

  it("ölçülemeyen ya da geçersiz lift için cümle kurulmaz (undefined, 0 değil)", () => {
    for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1]) {
      expect(liftPhrase(value)).toBeUndefined();
      expect(liftTimes(value)).toBeUndefined();
    }
  });

  it("normale yakın değer '1,0 katı' demez; 0'a yuvarlanan değer '0,0 katı' demez", () => {
    expect(liftPhrase(1)).toBe("normal düzeyde izlendi");
    expect(liftPhrase(0.96)).toBe("normal düzeyde izlendi");
    expect(liftPhrase(1.04)).toBe("normal düzeyde izlendi");
    expect(liftPhrase(0.03)).toBe("normalinin çok altında izlendi");
    expect(liftPhrase(0)).toBe("hiç izlenmedi");
    expect(liftTimes(0)).toBeUndefined();
    expect(liftTimes(0.03)).toBeUndefined();
    for (const value of [0, 0.03, 0.96, 1, 1.04, 1.5, 3, 7.77]) {
      expect(liftPhrase(value)).not.toMatch(/0,0|NaN|undefined/);
    }
  });
});

describe("confidencePhrase", () => {
  it("üç düzeyin düz ifadesi", () => {
    expect(confidencePhrase("high")).toBe("eminim");
    expect(confidencePhrase("medium")).toBe("kısmen eminim");
    expect(confidencePhrase("low")).toBe("az örnek, emin değilim");
  });

  it("her güven düzeyi karşılanır", () => {
    for (const level of CONFIDENCE_LEVELS) expect(CONFIDENCE_PLAIN[level]).not.toBe("");
  });
});

describe("OUTLIER_PLAIN ve checkpointPhrase", () => {
  it("tutan video: eşik kuraldan okunur (≥ 3 kat)", () => {
    expect(OUTLIER_PLAIN.name).toBe("tutan video");
    expect(OUTLIER_PLAIN.definition).toBe("normalinin en az 3 katı izlenen video");
    expect(OUTLIER_PLAIN.sentence).toBe("Tutan video: normalinin en az 3 katı izlenen video.");
  });

  it("kontrol noktası: '3. gün sonucu'", () => {
    expect(checkpointPhrase(1)).toBe("1. gün sonucu");
    expect(checkpointPhrase(3)).toBe("3. gün sonucu");
    expect(checkpointPhrase(7)).toBe("7. gün sonucu");
    for (const day of CHECKPOINT_DAYS) expect(checkpointPhrase(day)).toMatch(/^\d\. gün sonucu$/);
  });
});

describe("taksonomi karşılıkları", () => {
  it("her hook türü, açı, farkındalık katmanı ve CTA türü için boş olmayan karşılık var", () => {
    for (const key of HOOK_TYPES) expect(hookTypePlain(key).length).toBeGreaterThan(3);
    for (const key of CREATIVE_ANGLE_IDS) expect(ANGLE_PLAIN[key].length).toBeGreaterThan(2);
    for (const key of FUNNEL_STAGE_IDS) expect(FUNNEL_STAGE_PLAIN[key].length).toBeGreaterThan(3);
    for (const key of CTA_TYPES) expect(CTA_TYPE_PLAIN[key].length).toBeGreaterThan(3);
  });

  it("hook türü: bilinen anahtar sözlükten, bilinmeyen anahtar etiketten, prototip anahtarı güvenli", () => {
    expect(hookTypePlain("question")).toBe("soruyla açılış");
    expect(hookTypePlain("future_type")).toBe("future type tarzı açılış");
    expect(hookTypePlain("constructor")).toBe("constructor tarzı açılış");
  });

  it("düz dil çıktılarında panel jargonu geçmez", () => {
    const texts = [
      ...HOOK_TYPES.map(hookTypePlain),
      ...Object.values(ANGLE_PLAIN),
      ...Object.values(FUNNEL_STAGE_PLAIN),
      ...Object.values(CTA_TYPE_PLAIN),
      ...Object.values(CONFIDENCE_PLAIN),
      OUTLIER_PLAIN.name,
      OUTLIER_PLAIN.definition,
      OUTLIER_PLAIN.sentence,
      ...CHECKPOINT_DAYS.map(checkpointPhrase),
      ...[0, 0.03, 1, 2.3, 5.9].map((v) => liftPhrase(v) ?? ""),
      ...Object.values(PLAIN_TERMS).flatMap((term) => [term.say, term.meaning]),
    ];
    for (const text of texts) expect(text, text).not.toMatch(JARGON);
  });
});

describe("panel işleri", () => {
  const strip = (patch: Partial<Parameters<typeof jobStripPhrase>[0]>) =>
    jobStripPhrase({ kind: "analyze", dryRun: false, status: "running", stale: false, cancelRequested: false, ...patch });

  it("her tür, adım, durum, adım durumu ve sonuç kodu için dolu karşılık var", () => {
    for (const kind of JOB_KINDS) expect([JOB_KIND_PLAIN[kind].label, JOB_KIND_PLAIN[kind].doing].every((text) => text.length > 3), kind).toBe(true);
    for (const step of JOB_STEP_IDS) expect([JOB_STEP_PLAIN[step].name, JOB_STEP_PLAIN[step].doing].every((text) => text.length > 3), step).toBe(true);
    for (const status of JOB_STATUSES) expect(JOB_STATUS_PLAIN[status].length, status).toBeGreaterThan(3);
    for (const status of JOB_STEP_STATUSES) expect(JOB_STEP_STATUS_PLAIN[status].length, status).toBeGreaterThan(3);
    for (const code of JOB_OUTCOME_CODES) expect(JOB_OUTCOME_PLAIN[code], code).toMatch(/[.]$/);
  });

  it("durum şeridi: 'Şimdi yaptığım: videolarını inceliyorum (7/19)'; sayaç yoksa parantez yok; bitmiş işte cümle yok", () => {
    expect(strip({ currentStep: "analyze", progress: { done: 7, total: 19 } })).toBe("Şimdi yaptığım: videolarını inceliyorum (7/19)");
    expect(strip({ kind: "routine", currentStep: "briefing" })).toBe("Şimdi yaptığım: notlarımı güncelliyorum");
    expect(strip({ kind: "routine" }), "adım henüz yazılmadı: türün cümlesi").toBe("Şimdi yaptığım: haftalık turu yapıyorum");
    expect(strip({ progress: { done: 0, total: 0 } }), "0/0 yazılmaz").toBe("Şimdi yaptığım: videolarını inceliyorum");
    expect(strip({ kind: "collect", dryRun: true, currentStep: "collect" })).toBe("Şimdi yaptığım: yapılacaklara bakıyorum");
    expect(strip({ cancelRequested: true, currentStep: "analyze" })).toBe("Şimdi yaptığım: videolarını inceliyorum · bu adım bitince duracağım");
    expect(strip({ stale: true })).toBe("Videoları incele: yanıt vermiyor");
    expect(strip({ kind: "plan", status: "queued" })).toBe("Sıradaki iş: Planı hazırla");
    for (const status of ["succeeded", "partial", "blocked", "failed", "cancelled"] as const) expect(strip({ status }), status).toBeUndefined();
  });

  it("sonuç cümlesi: kod varsa kodun, yoksa durumun cümlesi; etkin işte yok", () => {
    expect(jobOutcomePhrase({ status: "blocked", outcome: "over_approved_amount" })).toBe("Bu iş onaylanan sınırı aşacaktı; başlamadım.");
    expect(jobOutcomePhrase({ status: "failed", outcome: "worker_lost" })).toBe("İş yarıda kaldı.");
    expect(jobOutcomePhrase({ status: "succeeded" })).toBe("İş bitti.");
    expect(jobOutcomePhrase({ status: "cancelled" })).toBe("İş durduruldu.");
    expect(jobOutcomePhrase({ status: "running" })).toBeUndefined();
    expect(jobOutcomePhrase({ status: "queued" })).toBeUndefined();
    expect(jobOutcomePhrase({ status: "blocked", outcome: "approval_missing" })).toBe("Bu iş için geçerli bir onay yok; başlamadım.");
    expect(jobOutcomePhrase({ status: "blocked", outcome: "budget_refused" })).toBe("Bu ayın sınırı buna izin vermiyor; başlamadım.");
  });

  it("başlık ve süre: türün adı; önizleme ayrıca işaretlenir; süre cümlesi", () => {
    expect(jobTitlePhrase({ kind: "collect", dryRun: false })).toBe("Hesaba bak");
    expect(jobTitlePhrase({ kind: "collect", dryRun: true })).toBe("Hesaba bak · ön bakış");
    expect(jobTookPhrase("6 dk 12 sn")).toBe("6 dk 12 sn sürdü");
  });

  it("herkesin gördüğü iş metinlerinde panel jargonu, tutar, sağlayıcı ya da komut geçmez", () => {
    const texts = [
      ...JOB_KINDS.flatMap((kind) => [JOB_KIND_PLAIN[kind].label, JOB_KIND_PLAIN[kind].doing]),
      ...JOB_STEP_IDS.flatMap((step) => [JOB_STEP_PLAIN[step].name, JOB_STEP_PLAIN[step].doing]),
      ...Object.values(JOB_STATUS_PLAIN),
      ...Object.values(JOB_STEP_STATUS_PLAIN),
      ...Object.values(JOB_OUTCOME_PLAIN),
      JOB_STALE_PLAIN,
      JOB_CANCELLING_PLAIN,
      ...Object.values(JOB_PREVIEW_PLAIN),
      ...Object.values(JOB_SCREEN_PLAIN),
      jobTookPhrase("6 dk 12 sn"),
      ...JOB_KINDS.map((kind) => jobTitlePhrase({ kind, dryRun: true })),
      ...JOB_STATUSES.map((status) => jobOutcomePhrase({ status }) ?? ""),
      ...JOB_KINDS.flatMap((kind) => JOB_STEP_IDS.map((currentStep) => strip({ kind, currentStep, progress: { done: 1, total: 2 } }) ?? "")),
    ];
    for (const text of texts) {
      expect(text, text).not.toMatch(JARGON);
      expect(text, text).not.toMatch(/USD|\$|apify|\bagy\b|claude|gemini|npm|rutin|brifing/i);
      expect(text, text).not.toMatch(/undefined|NaN/);
    }
  });
});

describe("PLAIN_TERMS", () => {
  it("her terimin ifadesi ve açıklaması dolu; ifade bir cümle sonu işareti taşımaz", () => {
    for (const [key, term] of Object.entries(PLAIN_TERMS)) {
      expect(term.say, key).not.toBe("");
      expect(term.meaning, key).not.toBe("");
      expect(term.say, key).not.toMatch(/[.!?]$/);
    }
  });

  it("tasarım sözlüğündeki karşılıklar (§4)", () => {
    expect(PLAIN_TERMS.baseline.say).toBe("normalin");
    expect(PLAIN_TERMS.hook.say).toBe("açılış (ilk saniyeler)");
    expect(PLAIN_TERMS.opportunity.say).toBe("rakiplerde tutuyor, sen denemedin");
    expect(PLAIN_TERMS.cta.say).toBe("izleyiciden istediğin şey");
    expect(PLAIN_TERMS.unmeasured.say).toBe("henüz veri yok");
  });
});

describe("kredi metinleri", () => {
  it("her kredi kalemi sözlükte var; ad ve birim dolu, panel jargonu yok", () => {
    for (const item of CREDIT_ITEMS) {
      const { label, unit } = CREDIT_ITEM_PLAIN[item];
      expect(label, item).not.toBe("");
      expect(unit, item).not.toBe("");
      expect(`${label} ${unit}`, item).not.toMatch(JARGON);
    }
    for (const text of [CREDIT_UNKNOWN_PLAIN, CREDIT_NOTE_PLAIN]) expect(text).not.toMatch(JARGON);
  });

  it("tutar ve döküm satırı tr-TR gruplamayla yazılır; sayılar uydurulmaz", () => {
    expect(creditAmountPhrase(196)).toBe("≈ 196 kredi");
    expect(creditAmountPhrase(1250)).toBe("≈ 1.250 kredi");
    expect(creditLinePhrase({ item: "account_scan", units: 5, creditsPerUnit: 8 })).toBe("5 hesap × 8");
    expect(creditLinePhrase({ item: "video_review", units: 1200, creditsPerUnit: 10 })).toBe("1.200 video × 10");
  });

  it("sohbet sorusu ve stüdyo kalemi de sözlükte; stüdyo fiyatının geçici olduğu adında yazar", () => {
    expect(CREDIT_ITEM_PLAIN.studio_video.label).toMatch(/geçici/);
    expect(CREDIT_ITEM_PLAIN.chat_question.unit).toBe("soru");
  });
});
