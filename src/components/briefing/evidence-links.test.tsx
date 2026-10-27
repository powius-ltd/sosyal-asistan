// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EvidenceLinks, resolveEvidence } from "@/components/briefing/evidence-links";
import type { BriefingEvidenceRef } from "@/lib/domain/briefing";

describe("resolveEvidence", () => {
  it("aynı türden birden fazlasını '1. video', '2. video' diye numaralar; tek olanı numarasız bırakır", () => {
    expect(resolveEvidence(["c:a", "c:b", "plan:2026-10-05"]).map((r) => r.label)).toEqual(["1. video", "2. video", "haftalık plan"]);
    expect(resolveEvidence(["c:a"]).map((r) => r.label)).toEqual(["video"]);
  });

  it("ölçüm ref'i hangi günün sonucu olduğunu düz dille söyler; farklı günler numaralanmaz", () => {
    expect(resolveEvidence(["due:ci_1:d3", "due:ci_2:d7"]).map((r) => r.label)).toEqual(["3. gün sonucu", "7. gün sonucu"]);
    expect(resolveEvidence(["due:ci_1:d7", "due:ci_2:d7"]).map((r) => r.label)).toEqual(["7. gün sonucu (1. video)", "7. gün sonucu (2. video)"]);
  });

  it("matris ve konu hücresi düz dille adlandırılır; jargon (hücre, matris) yok", () => {
    const labels = resolveEvidence(["cell:sorunu-biliyor:aci-korku", "topic:kahve:question", "idea:i1"]).map((r) => r.label);
    expect(labels).toEqual(["yaklaşım + izleyici", "konu + açılış", "fikir"]);
    expect(labels.join(" ")).not.toMatch(/hücre|matris/i);
  });

  it("çözülemeyen ref atlanır; video ve ölçüm içerik kimliği taşır", () => {
    const resolved = resolveEvidence(["zzz:1", "c:geçersiz kimlik", "c:ci_9", "due:ci_9:d1"]);
    expect(resolved.map((r) => r.contentId)).toEqual(["ci_9", "ci_9"]);
  });
});

describe("EvidenceLinks", () => {
  it("her bağlantı ≥ 44 px yüksekliğinde dokunma alanıdır; aralarında boşluk vardır", () => {
    render(<EvidenceLinks evidence={["c:ci_1", "c:ci_2"] as BriefingEvidenceRef[]} />);
    const list = screen.getByRole("list", { name: "Kanıt" });
    expect(list.className).toContain("gap-x-2");
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("min-h-11");
      expect(link.className).toContain("min-w-11");
    }
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["1. video", "2. video"]);
  });

  it("çözülecek ref yoksa hiçbir şey çizmez", () => {
    const { container } = render(<EvidenceLinks evidence={["zzz:1"] as unknown as BriefingEvidenceRef[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
