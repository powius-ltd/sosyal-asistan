import { describe, expect, it } from "vitest";

import { humanizeIds, renderPlanMarkdown, type EvidenceRef } from "@/lib/intel/plan-markdown";
import { emptyPlanSections } from "@/lib/domain/weekly-plan";

const refs: Record<string, EvidenceRef> = {
  "11111111-1111-4111-8111-111111111111": { contentId: "11111111-1111-4111-8111-111111111111", handle: "rival", isOwn: false, lift: 4.2, url: "https://www.instagram.com/p/AAA/" },
};
const evidenceOf = (id: string): EvidenceRef => refs[id] ?? { contentId: id, handle: "?", isOwn: false };

describe("renderPlanMarkdown", () => {
  it("veri yokken de okunur: Türkçe başlıklar, boş bölümler için açıklama, ölçülemeyen değer '—'", () => {
    const md = renderPlanMarkdown({ weekStart: "2026-10-05", generatedAt: new Date("2026-09-30T18:00:00Z"), audienceZone: "America/New_York", confidence: "low", sections: emptyPlanSections(), ideas: [], evidenceOf, notes: [] });
    for (const heading of ["## 1. Ne tuttu", "## 2. Bu hafta neye yüklen", "## 3. İçerikler (0)", "## 4. Takvim", "## 5. Kaçın", "## 6. Geçen hafta"]) expect(md).toContain(heading);
    expect(md).toContain("Düşük güven");
    expect(md).toContain("Plana giren içerik yok");
  });

  it("plandaki içerik: takvim ET + İstanbul, hook'lar, script, açıklama taslağı, kanıt bağlantısı", () => {
    const sections = emptyPlanSections();
    sections.schedule.slots = [{ position: 1, at: "2026-10-05T11:00:00.000Z", weekday: 0, hour: 7, basis: "rival_fixed" }];
    const md = renderPlanMarkdown({
      weekStart: "2026-10-05",
      generatedAt: new Date("2026-09-30T18:00:00Z"),
      audienceZone: "America/New_York",
      confidence: "medium",
      sections,
      evidenceOf,
      notes: [],
      ideas: [
        {
          title: "Örnek fikir",
          rationale: "Çünkü tuttu.",
          platform: "instagram",
          format: "short_video",
          hook_type: "bold_claim",
          hooks: ["Hook one", "Hook two", "Hook three"],
          script_outline: [],
          rank_score: 4,
          rank_inputs: { meanRivalLift: 4.2, novelty: 1, directionRef: null, relaxedOutlier: false },
          details: { script: "Line one.\nLine two.", captionDraft: "Caption #tag", hookTypes: ["bold_claim", "question", "curiosity"] },
          source: "weekly_plan",
          evidence: [{ content_item_id: "11111111-1111-4111-8111-111111111111", lift_at_creation: 4.2 }, { content_item_id: "22222222-2222-4222-8222-222222222222" }],
          position: 1,
          slot_at: "2026-10-05T11:00:00.000Z",
          slot_note: "Rakiplerin sabit saati",
        },
      ],
    });
    expect(md).toContain("### 1) Örnek fikir");
    expect(md).toContain("(America/New_York)");
    expect(md).toContain("(İstanbul)");
    expect(md).toContain("Line two.");
    expect(md).toContain("[@rival](https://www.instagram.com/p/AAA/)");
    expect(md).toContain("@?"); // bilinmeyen kanıt içeriği sessizce atlanmaz
  });
});

describe("renderPlanMarkdown: tutan analizi", () => {
  it("analiz var ama kanıtı doğrulanamadıysa 'kanıt doğrulanamadı'; analiz hiç yoksa 'henüz analiz edilmedi'", () => {
    const sections = emptyPlanSections();
    const base = { contentItemId: "11111111-1111-4111-8111-111111111111", ownerHandle: "rival", isOwn: false, lift: 4.2 };
    sections.winners.rivals = [
      { ...base, analyzed: false, evidenceUnverified: true },
      { ...base, contentItemId: "22222222-2222-4222-8222-222222222222", analyzed: false },
      { ...base, contentItemId: "33333333-3333-4333-8333-333333333333", analyzed: true, hookType: "question" },
    ];
    const md = renderPlanMarkdown({ weekStart: "2026-10-05", generatedAt: new Date("2026-09-30T18:00:00Z"), audienceZone: "America/New_York", confidence: "low", sections, ideas: [], evidenceOf, notes: [] });
    const lines = md.split("\n").filter((line) => line.startsWith("- ") && line.includes(" — 4,2x"));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("(kanıt doğrulanamadı)");
    expect(lines[0]).not.toContain("henüz analiz edilmedi");
    expect(lines[1]).toContain("(henüz analiz edilmedi)");
    expect(lines[2]).not.toMatch(/kanıt doğrulanamadı|henüz analiz edilmedi/);
  });
});

describe("humanizeIds", () => {
  it("bilinen içerik kimliğini bağlantıya çevirir, bilinmeyeni olduğu gibi bırakır", () => {
    const text = "kopya: 11111111-1111-4111-8111-111111111111 ve 33333333-3333-4333-8333-333333333333";
    expect(humanizeIds(text, evidenceOf)).toBe("kopya: [@rival](https://www.instagram.com/p/AAA/) ve 33333333-3333-4333-8333-333333333333");
  });
  describe("hesap türü ve plan modu", () => {
    const base = { weekStart: "2026-10-05", generatedAt: new Date("2026-09-30T18:00:00Z"), audienceZone: "Europe/Istanbul", confidence: "low" as const, ideas: [], evidenceOf, notes: [] };
    const sections = () => {
      const s = emptyPlanSections();
      s.schedule.slots = [1, 2, 3].map((position) => ({ position, at: `2026-10-0${4 + position}T17:00:00.000Z`, weekday: position, hour: 20, basis: "own_good" as const }));
      return s;
    };

    it("karma: tür + amaç, slot dağılımı (2 erişim · 1 satış) ve takvimde slot amacı; rakipsiz mod satırı", () => {
      const md = renderPlanMarkdown({ ...base, sections: sections(), accountType: "mixed", mode: "own" });
      expect(md).toContain("Hesap türü: Karma: hem erişim hem satış · Amaç:");
      expect(md).toContain("Slot dağılımı: 2 erişim · 1 satış (3 slot).");
      expect(md).toContain("Plan modu: rakipsiz — kendi tutanlarından öğrenme (dayanak: kendi tutanların).");
      expect(md).toMatch(/- 1\. .*\[erişim\] —/);
      expect(md).toMatch(/- 2\. .*\[satış\] —/);
    });

    it("creator: tür ve amaç yazılır, slot dağılımı satırı yok (tek amaç); tür verilmezse hiçbiri yazılmaz", () => {
      const creator = renderPlanMarkdown({ ...base, sections: sections(), accountType: "creator", mode: "rivals" });
      expect(creator).toContain("Hesap türü: İçerik üreticisi");
      expect(creator).not.toContain("Slot dağılımı");
      expect(creator).toContain("Plan modu: rakip tutanlarından öğrenme");
      const bare = renderPlanMarkdown({ ...base, sections: sections() });
      expect(bare).not.toContain("Hesap türü");
      expect(bare).not.toContain("Plan modu");
    });
  });
});

describe("renderPlanMarkdown: takvim amacı", () => {
  const idea = (position: number, title: string, purpose?: "reach" | "sales") => ({
    title,
    rationale: "Çünkü tuttu.",
    platform: "instagram" as const,
    format: "short_video" as const,
    hook_type: "bold_claim",
    hooks: ["a", "b", "c"],
    script_outline: [],
    rank_score: 4,
    rank_inputs: { meanRivalLift: 4.2, novelty: 1, directionRef: null, relaxedOutlier: false },
    details: { script: "Line one.", captionDraft: "Caption", hookTypes: ["bold_claim"], ...(purpose === undefined ? {} : { purpose }) },
    source: "weekly_plan" as const,
    evidence: [],
    position,
    slot_at: "2026-11-02T15:00:00.000Z",
  });
  const render = (ideas: ReturnType<typeof idea>[], accountType: "mixed" | "business" = "mixed"): string => {
    const sections = emptyPlanSections();
    sections.schedule.slots = [1, 2].map((position) => ({ position, at: "2026-11-02T15:00:00.000Z", weekday: 0, hour: 10, basis: "rival_fixed" as const }));
    return renderPlanMarkdown({ weekStart: "2026-11-02", generatedAt: new Date("2026-10-30T18:00:00Z"), audienceZone: "Europe/Istanbul", confidence: "medium", sections, evidenceOf, notes: [], accountType, ideas });
  };
  const calendarLine = (md: string, position: number): string => md.split("\n").find((line) => line.startsWith(`- ${position}. `)) ?? "";

  it("fikir amaç sırası slot sırasından farklıysa takvim fikrin kendi amacını yazar (Ornek 2 Kas)", () => {
    // karma 2 slot: slot yedeği erişim, satış sırasındadır; fikirler ters atanmış (1 = satış, 2 = erişim).
    const md = render([idea(1, "Satış fikri", "sales"), idea(2, "Erişim fikri", "reach")]);
    expect(calendarLine(md, 1)).toContain("[satış] — Satış fikri");
    expect(calendarLine(md, 2)).toContain("[erişim] — Erişim fikri");
  });

  it("fikri ya da fikrin amacı yoksa slot yedeği; tek amaçlı türde etiket yok", () => {
    const md = render([idea(1, "Amaçsız fikir")]);
    expect(calendarLine(md, 1)).toContain("[erişim] — Amaçsız fikir");
    expect(calendarLine(md, 2)).toContain("[satış] — içerik atanmadı");
    expect(calendarLine(render([idea(1, "Satış fikri", "sales")], "business"), 1)).not.toContain("[");
  });
});

describe("renderPlanMarkdown: senaryo editörü", () => {
  const sections = emptyPlanSections();
  sections.schedule.slots = [{ position: 1, at: "2026-11-02T15:00:00.000Z", weekday: 0, hour: 10, basis: "rival_fixed" }];
  const base = {
    title: "Erteleme",
    rationale: "Çünkü tuttu.",
    platform: "instagram" as const,
    format: "short_video" as const,
    hook_type: "bold_claim",
    hooks: ["a", "b", "c"],
    script_outline: [],
    rank_score: 1,
    rank_inputs: { meanRivalLift: 1, novelty: 1, directionRef: null, relaxedOutlier: false },
    source: "weekly_plan" as const,
    evidence: [],
    position: 1,
    slot_at: "2026-11-02T15:00:00.000Z",
  };
  const review = { revised: true, changes: ["a"], claims: [], corrections: 3, verifyBeforePublish: ['"1453" — Tarihi kontrol et.'], promptVersion: "script-review-v1" };
  const render = (details: object) => renderPlanMarkdown({ weekStart: "2026-11-02", generatedAt: new Date("2026-10-30T18:00:00Z"), audienceZone: "Europe/Istanbul", confidence: "medium", sections, evidenceOf, notes: [], ideas: [{ ...base, details }] });

  it("fikir altında 'Editör: N düzeltme · Yayından önce doğrula: …' yazar; inceleme yoksa satır yok", () => {
    expect(render({ script: "Satır.", scriptReview: review })).toContain('- Editör: 3 düzeltme · Yayından önce doğrula: "1453" — Tarihi kontrol et.');
    expect(render({ script: "Satır.", scriptReview: { ...review, verifyBeforePublish: [] } })).toContain("- Editör: 3 düzeltme · Yayından önce doğrula: yok");
    expect(render({ script: "Satır." })).not.toContain("Editör:");
  });

  it("B2: wrong düzeltmesi görünür ('Düzeltilen olgu: <eski> → <not>'); yanlış olgu hook'ta ya da adımlarda geçiyorsa işaret (düzeltme değil)", () => {
    const wrongReview = { ...review, claims: [{ text: "İstanbul 1452 yılında fethedildi", verdict: "wrong" as const, note: "Doğrusu 1453." }] };
    const md = renderPlanMarkdown({
      weekStart: "2026-11-02",
      generatedAt: new Date("2026-10-30T18:00:00Z"),
      audienceZone: "Europe/Istanbul",
      confidence: "medium",
      sections,
      evidenceOf,
      notes: [],
      ideas: [{ ...base, hooks: ["İstanbul 1452 yılında fethedildi, biliyor muydun?", "b", "c"], details: { script: "Satır.", scriptReview: wrongReview } }],
    });
    expect(md).toContain('- Düzeltilen olgu: "İstanbul 1452 yılında fethedildi" → Doğrusu 1453.');
    expect(md).toContain('- Dikkat: yanlış bulunan olgu hook\'larda / adımlarda da geçiyor (düzeltilmedi, elle bak): "İstanbul 1452 yılında fethedildi"');
    expect(md).toContain("1. İstanbul 1452 yılında fethedildi, biliyor muydun?"); // hook'a dokunulmadı
    expect(render({ script: "Satır.", scriptReview: review })).not.toContain("Düzeltilen olgu");
    expect(render({ script: "Satır.", scriptReview: review })).not.toContain("Dikkat:");
  });

  it("B5: tavana dayanan iddia listesi 'doğrula: yok' demez", () => {
    const capped = { ...review, verifyBeforePublish: ["Kalan iddialar denetlenmedi: editör en çok 12 iddia inceledi."] };
    const md = render({ script: "Satır.", scriptReview: capped });
    expect(md).toContain("Yayından önce doğrula: Kalan iddialar denetlenmedi");
    expect(md).not.toContain("doğrula: yok");
  });
});

describe("renderPlanMarkdown: gevşek kanıt notu moda göre (B11)", () => {
  const relaxed = {
    title: "Zayıf kanıtlı fikir",
    rationale: "Çünkü denedim.",
    platform: "instagram" as const,
    format: "short_video" as const,
    hook_type: "bold_claim",
    hooks: ["a", "b", "c"],
    script_outline: [],
    rank_score: 1,
    rank_inputs: { meanRivalLift: 1, novelty: 1, directionRef: null, relaxedOutlier: true },
    details: { script: "Satır." },
    source: "weekly_plan" as const,
    evidence: [],
    position: 1,
    slot_at: "2026-11-02T15:00:00.000Z",
  };
  const render = (mode?: "own" | "rivals"): string => {
    const sections = emptyPlanSections();
    sections.schedule.slots = [{ position: 1, at: "2026-11-02T15:00:00.000Z", weekday: 0, hour: 10, basis: "rival_fixed" }];
    return renderPlanMarkdown({ weekStart: "2026-11-02", generatedAt: new Date("2026-10-30T18:00:00Z"), audienceZone: "Europe/Istanbul", confidence: "low", sections, evidenceOf, notes: [], mode, ideas: [relaxed] });
  };

  it("rakipsiz modda notta rakip geçmez, eşik kendi tutan eşiğidir", () => {
    const note = render("own").split("\n").find((line) => line.startsWith("- Not: kanıtta")) ?? "";
    expect(note).toBe("- Not: kanıtta ≥3x tutan kendi video yok, en iyi kendi videon ≥1,5x ile kabul edildi (zayıf kanıt).");
    expect(note).not.toMatch(/rakip/i);
  });

  it("rakip modunda (ve mod verilmediğinde) eski metin", () => {
    for (const mode of ["rivals", undefined] as const) expect(render(mode)).toContain("- Not: kanıtta ≥3x rakip yok, ≥2x ile kabul edildi (zayıf kanıt).");
  });
});
