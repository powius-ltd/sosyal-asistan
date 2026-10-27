import { describe, expect, it } from "vitest";

import type { Idea } from "@/lib/domain/intel";
import { buildTicket, chooseOpening, extractCtaWord, slotOf, type BuildInput, type EvidenceVideo } from "@/lib/studio-order/build";
import { suggestDuration } from "@/lib/studio-order/duration";
import { buildFormatCard } from "@/lib/studio-order/format-card";
import { StudioAccountError } from "@/lib/studio-order/accounts";
import { readTicket, writeTicket } from "@/lib/studio-order/ticket-file";

const HOOKS = ["Basketbolun ilk potası aslında bir şeftali sepetiydi.", "Basketbol nasıl doğdu, biliyor muydun?"];
const IDEA: Idea = {
  id: "8dac0c83-78b2-46df-ae5d-8065b0c2309f",
  workspaceId: "ws",
  status: "new",
  title: "Basketbol nasıl doğdu?",
  rationale: "r",
  platform: "instagram",
  format: "short_video",
  source: "weekly_plan",
  hooks: HOOKS,
  scriptOutline: ["1891 Springfield: şeftali sepetleri", "Kural değişimleri"],
  details: {
    topic: "Spor tarihi",
    script: `${HOOKS[0]} Sonra kurallar değişti. Yorumlara BASKET yaz, kaynakları göndereyim.`,
    scriptLanguage: "tr",
    captionDraft: "Basketbolun hikâyesi #spor",
    targetDurationSec: 95,
  },
  rankScore: 1,
  evidence: [],
  createdAt: "2026-10-18T00:00:00Z",
  updatedAt: "2026-10-18T00:00:00Z",
};

const RIVAL: EvidenceVideo = {
  contentItemId: "c1",
  url: "https://www.instagram.com/reel/RIVAL1/",
  ownerKind: "competitor",
  durationSec: 40,
  lift: 5,
  analysis: {
    status: "ok",
    hookType: "question",
    hookSource: "speech",
    promptVersion: "video-analysis-2026-10-v1",
    editMetrics: { cutCount: 12, avgShotSec: 3.1, tempo: "fast", onScreenTextCount: 4, onCameraSpeaker: false, hasMusic: true, hasBurnedCaptions: true },
  },
};

const BASE: BuildInput = {
  panelSlug: "ornek-marka",
  planWeek: "2026-10-19",
  idea: IDEA,
  position: 1,
  slotAt: "2026-10-19T17:00:00+00:00",
  evidence: [RIVAL],
  ownDurationGroups: [],
};

describe("buildTicket", () => {
  it("ornek-marka: mod konu, onay hayir, durum taslak, brifsiz plan → slot P1, açılış ana hatta", () => {
    const result = buildTicket(BASE);
    if (!result.ok) throw new Error(result.reason);
    const t = result.ticket;
    expect(t).toMatchObject({ siparis_id: "ornek-marka-2026-10-19-p1", slot: "P1", hesap: "ornek-marka", mod: "konu", onay: false, durum: "taslak", istenen_saat: "2026-10-19 20:00", sutun: "spor-tarihi", konu: "Spor tarihi", cta: "BASKET", hedef: "uyarla" });
    expect(t.ana_hat?.[0]).toBe(`Seçili açılış: ${HOOKS[0]}`); // script bu hook ile başlıyor
    expect(t.senaryo).toBeUndefined();
    expect(t.tur).toBeUndefined(); // panel tur doldurmaz
    expect(result.note).toContain(`Diğer açılış adayları: ${HOOKS[1]}`);
    expect(() => readTicket(writeTicket(t, result.note))).not.toThrow();
  });

  it("ornek-studyo: mod senaryo, metin değiştirilmez; metinsiz fikir atlanır", () => {
    const ok = buildTicket({ ...BASE, panelSlug: "ornekstudyoapp" });
    if (!ok.ok) throw new Error(ok.reason);
    expect(ok.ticket).toMatchObject({ hesap: "ornek-studyo", mod: "senaryo", senaryo: IDEA.details.script });
    expect(ok.ticket.konu).toBeUndefined();
    const none = buildTicket({ ...BASE, panelSlug: "ornekstudyoapp", idea: { ...IDEA, details: { ...IDEA.details, script: undefined } } });
    expect(none.ok).toBe(false);
  });

  it("bilinmeyen hesap (ornek) açık hata verir", () => {
    expect(() => buildTicket({ ...BASE, panelSlug: "ornek" })).toThrow(StudioAccountError);
  });

  it("dayanak video yoksa ornek_video yazılmaz; analizi yoksa yalnız bağlantı gider", () => {
    const none = buildTicket({ ...BASE, evidence: [] });
    if (!none.ok) throw new Error(none.reason);
    expect(none.ticket.ornek_video).toBeUndefined();
    expect(none.ticket.hedef).toBeUndefined();
    const noAnalysis = buildTicket({ ...BASE, evidence: [{ ...RIVAL, analysis: undefined }] });
    if (!noAnalysis.ok) throw new Error(noAnalysis.reason);
    expect(noAnalysis.ticket.ornek_video).toEqual({ url: "https://www.instagram.com/reel/RIVAL1/" });
    expect(noAnalysis.note).toContain("Biçim kartı yok");
  });

  it("brif slotu varsa sütun ve hedef brifin kararından gelir (test slotu)", () => {
    const brief = {
      slots: [{ slotId: "S1", decision: "test" as const, pillar: "teknik", testValue: "soru", why: "w", evidenceRef: "r", evidenceLabel: "l" }],
      testVariable: { kind: "hook" as never, value: "soru açılışı", why: "w" },
    };
    const r = buildTicket({ ...BASE, briefSlot: "S1", brief });
    if (!r.ok) throw new Error(r.reason);
    expect(r.ticket).toMatchObject({ slot: "S1", sutun: "teknik", siparis_id: "ornek-marka-2026-10-19-s1" });
    expect(r.ticket.hedef).toMatch(/^test: /);
  });

  it("plana girmemiş (sırasız) fikir sipariş olmaz", () => {
    expect(buildTicket({ ...BASE, position: undefined }).ok).toBe(false);
    expect(slotOf({ position: 3 })).toBe("P3");
  });
});

describe("yardımcılar", () => {
  it("seçili açılış script'in başladığı hook'tur", () => {
    expect(chooseOpening(HOOKS, IDEA.details.script)).toEqual({ hook: HOOKS[0], matched: true });
    expect(chooseOpening(HOOKS, "Başka bir giriş.")).toEqual({ hook: HOOKS[0], matched: false });
    expect(chooseOpening([], "x")).toBeUndefined();
  });
  it("CTA kelimesi yalnız 'yorumlara KELİME yaz' kalıbından çıkar", () => {
    expect(extractCtaWord("Yorumlara SEMİNER yaz")).toBe("SEMİNER");
    expect(extractCtaWord("comment REST and I'll send it")).toBe("REST");
    expect(extractCtaWord("yorum yaz")).toBeUndefined();
  });
  it("biçim kartı: ölçülmemiş alan yazılmaz, 0 ölçümü korunur; analiz başarısızsa kart yok", () => {
    const card = buildFormatCard({ status: "ok", hookSource: "screen_text", promptVersion: "v2", editMetrics: { cutCount: 0, cutsInFirst3Sec: 0, layout: "split", textPosition: "top" } }, 20);
    expect(card).toEqual({ sure_sn: 20, kesme: 0, ilk_3sn_kesim: 0, yerlesim: "bolunmus", yazi_konumu: "ust", acilis_kanali: "ekran_yazisi", analiz_surumu: "v2" });
    expect(card).not.toHaveProperty("tempo");
    expect(buildFormatCard({ status: "failed", promptVersion: "v1" }, 20)).toBeUndefined();
    expect(buildFormatCard({ status: "ok", promptVersion: "v1" }, undefined)).toBeUndefined();
  });
  it("süre önerisi: rakip medyanı öncelikli, sonra planın hedefi, sonra kendi grup; hiçbiri yoksa yok; sınırlar 3 sn – 15 dk", () => {
    expect(suggestDuration({ rivalSecs: [20, 30, 40], ownGroups: [] })).toMatchObject({ sec: 30 });
    expect(suggestDuration({ rivalSecs: [], ideaTargetSec: 95, ownGroups: [] })?.sec).toBe(95);
    const own = { key: "15_30" as const, n: 5, liftN: 5, medianLift: 2.1, outlierCount: 1, confidence: "medium" as const };
    expect(suggestDuration({ rivalSecs: [], ownGroups: [own] })?.sec).toBe(22);
    expect(suggestDuration({ rivalSecs: [], ownGroups: [{ ...own, liftN: 2 }] })).toBeUndefined();
    expect(suggestDuration({ rivalSecs: [5000], ownGroups: [] })?.sec).toBe(900);
    expect(suggestDuration({ rivalSecs: [1], ownGroups: [] })?.sec).toBe(3);
  });
});
