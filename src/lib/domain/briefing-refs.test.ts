import { describe, expect, it } from "vitest";

import type { BriefingAction } from "@/lib/domain/briefing";
import {
  briefingActionCommand,
  briefingActionHref,
  briefingActionIssues,
  briefingRefHref,
  cellRef,
  contentRef,
  dueRef,
  formatBriefingRef,
  ideaRef,
  isBriefingRef,
  parseBriefingRef,
  planRef,
  topicRef,
} from "@/lib/domain/briefing-refs";

const UUID = "7a3f0000-0000-4000-8000-0000000000d1";

describe("parseBriefingRef / formatBriefingRef", () => {
  const valid = [
    "c:ci_12",
    `c:${UUID}`,
    "cell:sorunu-biliyor:aci-korku",
    "topic:sabah_rutini:question",
    "topic:k:teaching_quote",
    "plan:2026-09-28",
    "idea:id_03",
    "due:ci_12:d7",
    "due:ci_12:d1",
  ];

  it("geçerli ref'ler ayrışır ve aynen geri biçimlenir", () => {
    for (const ref of valid) {
      const parsed = parseBriefingRef(ref);
      expect(parsed, ref).toBeDefined();
      if (parsed) expect(formatBriefingRef(parsed)).toBe(ref);
      expect(isBriefingRef(ref)).toBe(true);
    }
  });

  it("geçersiz ref'ler reddedilir: bilinmeyen önek, bozuk kimlik, taksonomi dışı hücre, Pazartesi olmayan hafta, bilinmeyen gün, fazla/eksik parça", () => {
    const invalid = [
      "",
      "c:",
      "c",
      "x:ci_1",
      "c:ci 1",
      "c:ci_1:extra",
      "c:" + "a".repeat(65),
      "cell:sorunu-biliyor",
      "cell:bilinmeyen:aci-korku",
      "cell:sorunu-biliyor:bilinmeyen",
      "cell:aci-korku:sorunu-biliyor",
      "topic:sabah_rutini",
      "topic:sabah_rutini:bilinmeyen_hook",
      "topic:Sabah Rutini:question",
      "topic:1_rutin:question",
      "topic:" + "a".repeat(41) + ":question",
      "topic:question:sabah_rutini",
      "topic:sabah_rutini:question:extra",
      "topic::question",
      "plan:2026-09-29",
      "plan:2026-02-30",
      "plan:bu-hafta",
      "idea:",
      "due:ci_12",
      "due:ci_12:d2",
      "due:ci_12:7",
      "javascript:alert(1)",
    ];
    for (const ref of invalid) {
      expect(parseBriefingRef(ref), JSON.stringify(ref)).toBeUndefined();
      expect(isBriefingRef(ref)).toBe(false);
    }
    expect(isBriefingRef(undefined)).toBe(false);
    expect(isBriefingRef(12)).toBe(false);
  });

  it("üreticiler geçerli ref üretir; geçersiz girdide fırlatır (geçersiz ref hiç üretilmez)", () => {
    expect(contentRef("ci_12")).toBe("c:ci_12");
    expect(cellRef("sorunu-biliyor", "aci-korku")).toBe("cell:sorunu-biliyor:aci-korku");
    expect(topicRef("sabah_rutini", "question")).toBe("topic:sabah_rutini:question");
    expect(planRef("2026-09-28")).toBe("plan:2026-09-28");
    expect(ideaRef("id_03")).toBe("idea:id_03");
    expect(dueRef("ci_12", 7)).toBe("due:ci_12:d7");
    expect(() => contentRef("a:b")).toThrow(RangeError);
    expect(() => planRef("2026-09-29")).toThrow(RangeError);
    expect(() => topicRef("Sabah Rutini", "question")).toThrow(RangeError);
    expect(() => topicRef("sabah_rutini", "bilinmeyen")).toThrow(RangeError);
  });
});

describe("briefingRefHref (routes.ts)", () => {
  it("her ref türü panel yoluna çözülür", () => {
    expect(briefingRefHref("c:ci_12")).toBe("/video/ci_12");
    expect(briefingRefHref("due:ci_12:d7")).toBe("/video/ci_12");
    expect(briefingRefHref("cell:sorunu-biliyor:aci-korku")).toBe("/anatomi?hucre=sorunu-biliyor:aci-korku");
    expect(briefingRefHref("topic:sabah_rutini:question")).toBe("/anatomi?konu=sabah_rutini:question");
    expect(briefingRefHref("plan:2026-09-28")).toBe("/bu-hafta?hafta=2026-09-28");
    expect(briefingRefHref("idea:id_03")).toBe("/fikirler?id=id_03");
  });

  it("geçersiz ref bağlantısız (undefined); üretilen yol hep iç yol", () => {
    expect(briefingRefHref("javascript:alert(1)")).toBeUndefined();
    expect(briefingRefHref("c:../../x")).toBeUndefined();
    for (const ref of ["c:ci_1", "plan:2026-09-28", "idea:id_1", "cell:cozum-ariyor:kimlik", "topic:sabah_rutini:list"]) expect(briefingRefHref(ref)?.startsWith("/")).toBe(true);
  });
});

describe("eylem tutarlılığı", () => {
  const open = (type: BriefingAction["type"], target?: BriefingAction["target"]): BriefingAction => ({ type, label: "Aç", target, spendsMoney: false });

  it("geçerli eylemler", () => {
    expect(briefingActionIssues(open("open_video", "c:ci_1"))).toEqual([]);
    expect(briefingActionIssues(open("open_video", "due:ci_1:d7"))).toEqual([]);
    expect(briefingActionIssues(open("open_plan", "plan:2026-09-28"))).toEqual([]);
    expect(briefingActionIssues(open("open_matrix", "cell:cozum-ariyor:kimlik"))).toEqual([]);
    expect(briefingActionIssues(open("open_matrix", "topic:sabah_rutini:question"))).toEqual([]);
    expect(briefingActionIssues(open("open_matrix"))).toEqual([]);
    expect(briefingActionIssues(open("approve_link", "idea:id_1"))).toEqual([]);
    expect(briefingActionIssues({ type: "run_cmd", label: "Ölçüm", commandId: "measure", spendsMoney: true })).toEqual([]);
    expect(briefingActionIssues({ type: "run_cmd", label: "Planla", commandId: "plan", spendsMoney: false })).toEqual([]);
  });

  it("tutarsız eylemler reddedilir: tür-hedef uyumsuzluğu, hedefsiz açma, komut/hedef karışımı, para etiketi komut tablosuyla çelişir", () => {
    expect(briefingActionIssues(open("open_video", "plan:2026-09-28"))).toHaveLength(1);
    expect(briefingActionIssues(open("open_plan"))).toHaveLength(1);
    expect(briefingActionIssues(open("approve_link", "c:ci_1"))).toHaveLength(1);
    expect(briefingActionIssues(open("open_video", "topic:sabah_rutini:question"))).toHaveLength(1);
    expect(briefingActionIssues(open("open_video", "javascript:alert(1)" as BriefingAction["target"]))).toHaveLength(1);
    expect(briefingActionIssues({ type: "run_cmd", label: "x", spendsMoney: false })).toHaveLength(1);
    expect(briefingActionIssues({ type: "run_cmd", label: "x", commandId: "collect", spendsMoney: false })).toHaveLength(1);
    expect(briefingActionIssues({ type: "run_cmd", label: "x", commandId: "plan", spendsMoney: true })).toHaveLength(1);
    expect(briefingActionIssues({ type: "run_cmd", label: "x", commandId: "plan", target: "c:ci_1", spendsMoney: false })).toHaveLength(1);
    expect(briefingActionIssues({ type: "open_plan", label: "x", target: "plan:2026-09-28", commandId: "plan", spendsMoney: false })).toHaveLength(1);
    expect(briefingActionIssues({ ...open("open_plan", "plan:2026-09-28"), spendsMoney: true })).toHaveLength(1);
  });

  it("href ve komut: open_* hedefin yolu, hedefsiz open_matrix matris sayfası, run_cmd bağlantısız ama komutlu", () => {
    expect(briefingActionHref(open("open_plan", "plan:2026-09-28"))).toBe("/bu-hafta?hafta=2026-09-28");
    expect(briefingActionHref(open("open_matrix"))).toBe("/anatomi");
    expect(briefingActionHref(open("open_matrix", "topic:sabah_rutini:question"))).toBe("/anatomi?konu=sabah_rutini:question");
    expect(briefingActionHref(open("open_video"))).toBeUndefined();
    const run: BriefingAction = { type: "run_cmd", label: "Ölçüm", commandId: "measure", spendsMoney: true };
    expect(briefingActionHref(run)).toBeUndefined();
    expect(briefingActionCommand(run)).toEqual({ script: "measure:now", label: "Ölçüm koşusu", spendsMoney: true });
    expect(briefingActionCommand(open("open_plan", "plan:2026-09-28"))).toBeUndefined();
  });
});
