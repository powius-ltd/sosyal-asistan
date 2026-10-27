// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WhyItWorks } from "@/components/video/why-it-works";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { BaselineExplanation } from "@/lib/domain/content";

const baseline: BaselineExplanation = {
  viewsKind: "ig_play_count",
  format: "short_video",
  targetViews: 3108,
  medianViews: 7337,
  windowSize: 25,
  n: 25,
  lowConfidence: false,
  basis: [{ contentItemId: "c1", views: 7000, publishedAt: "2026-09-01T09:00:00.000Z" }],
  excluded: { self: 1, otherFormat: 0, pinned: 0, noViews: 0, differentViewsKind: 0, noDate: 0, tooYoung: 0 },
};

function renderWhy(patch: Partial<BaselineExplanation> = {}, score = { lift: 0.4, liftTier: 0 as const, lowConfidence: false, immature: false }) {
  return render(
    <TooltipProvider>
      <WhyItWorks score={score} baseline={{ ...baseline, ...patch }} views={3108} followers={10000} />
    </TooltipProvider>,
  );
}

describe("WhyItWorks (video sayfası, D2-10)", () => {
  it("düz dil: 'Neden tuttu?', normalinin kaç katı, normal nasıl hesaplandı; lift / baz çizgisi / medyan yazılmaz", () => {
    const { container } = renderWhy();
    expect(screen.getByText("Neden tuttu?")).toBeInTheDocument();
    expect(screen.getByText("3.108 izlenme; hesabının normali 7.337, yani normalinin 0,4 katı izlendi.")).toBeInTheDocument();
    expect(screen.getByText("Normal nasıl hesaplandı?")).toBeInTheDocument();
    expect(screen.getByText(/son 25 videosunun tipik izlenmesi\. Bu kıyaslama 25 videoya dayanıyor\./)).toBeInTheDocument();
    expect(screen.getByText("Kıyaslamaya girmeyenler")).toBeInTheDocument();
    expect(screen.getByText("Kıyaslamaya giren 1 video")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/baz çizgisi|medyan|lift|÷/i);
  });

  it("az örnekte uyarı 'az örnek, emin değilim' dilinde; ölçülemeyen oranda sebep yazılır (cümle uydurulmaz)", () => {
    const { container } = renderWhy({ lowConfidence: true, n: 4, medianViews: undefined, unmeasuredReason: "Aynı biçimde 4 video var, en az 10 gerekli." }, { lift: undefined as never, liftTier: undefined as never, lowConfidence: true, immature: false });
    expect(screen.getByText(/Az örnek, emin değilim: kıyaslama 4 videoya dayanıyor/)).toBeInTheDocument();
    expect(screen.getByText("Aynı biçimde 4 video var, en az 10 gerekli.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/baz çizgisi|medyan|lift/i);
  });
});
