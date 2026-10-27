// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ComparisonView } from "@/components/comparison/comparison-view";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ComparisonRow, Insights } from "@/lib/domain/insights";

function row(kind: ComparisonRow["subjectKind"], id: string, handle: string, patch: Partial<ComparisonRow> = {}): ComparisonRow {
  return {
    subjectKind: kind,
    subjectId: id,
    handle,
    platform: "instagram",
    videoCount: 10,
    posting: { commonSlots: [], commonHours: [] },
    hashtags: {},
    voice: { sampleSize: 0 },
    quality: [],
    ...patch,
  };
}

function makeInsights(patch: Partial<Insights> = {}): Insights {
  return {
    scope: { days: 90, since: "2026-07-02T00:00:00.000Z", until: "2026-09-30T00:00:00.000Z", audienceTimeZone: "America/New_York" },
    rows: [
      row("own", "own-1", "ornek", {
        followers: 5_000,
        medianViews: 3_450,
        medianViewsPerFollower: 0.69,
        posting: {
          commonSlots: [],
          commonHours: [{ hour: 7, n: 10, share: 1, liftN: 8, medianLift: 1.2 }],
          postsPerWeek: 3,
        },
        quality: [{ kind: "hidden_likes", count: 8, total: 10 }],
      }),
      // Takipçi ve izlenme ölçülemedi.
      row("competitor", "rival-1", "rakip1"),
    ],
    durationBuckets: { own: [], competitors: [] },
    ctaTypes: { own: [], competitors: [] },
    hookTypes: { own: [], competitors: [] },
    similarSize: { ownFollowers: 5_000, count: 0, handles: [] },
    unmeasured: [],
    ...patch,
  };
}

const renderView = (insights: Insights) =>
  render(
    <TooltipProvider>
      <ComparisonView insights={insights} />
    </TooltipProvider>,
  );

describe("ComparisonView", () => {
  it("kendi hesap ve rakip sütunları; ölçülemeyen hücre tire, %0/0 değil", () => {
    renderView(makeInsights());
    const table = screen.getAllByRole("table")[0];
    expect(within(table).getByText("@ornek")).toBeInTheDocument();
    expect(within(table).getByText("Sen")).toBeInTheDocument();
    expect(within(table).getByText("@rakip1")).toBeInTheDocument();

    const followers = within(table).getByRole("rowheader", { name: "Takipçi" }).closest("tr") as HTMLElement;
    expect(within(followers).getByText("5 B")).toBeInTheDocument();
    expect(within(followers).getByLabelText("Ölçülemedi: Takipçi sayısı alınamadı.")).toHaveTextContent("—");

    const reach = within(table).getByRole("rowheader", { name: "İzlenme / takipçi" }).closest("tr") as HTMLElement;
    expect(within(reach).getByText("%69")).toBeInTheDocument();
    expect(within(table).queryByText("%0")).not.toBeInTheDocument();
  });

  it("yaygın saatler hedef kitle diliminde etiketlenir ve pay gösterilir", () => {
    renderView(makeInsights());
    const table = screen.getAllByRole("table")[0];
    const hours = within(table).getByRole("rowheader", { name: /En sık paylaşım saatleri \(ET\)/ }).closest("tr") as HTMLElement;
    expect(hours).toHaveTextContent("07:00");
    expect(hours).toHaveTextContent("10 video · %100");
  });

  it("platformlar sekmeyle ayrılır: aynı kullanıcı adı iki platformda iki sütun olup tabloyu şişirmez; tek platformda sekme yok", async () => {
    const user = userEvent.setup();
    const insights = makeInsights({ rows: [row("own", "a", "verimlilab", { platform: "instagram" }), row("own", "b", "verimlilab", { platform: "tiktok" }), row("competitor", "c", "tekil")] });
    renderView(insights);
    expect(screen.getByRole("tab", { name: "Instagram" })).toBeInTheDocument();
    const igHeaders = within(screen.getAllByRole("table")[0]).getAllByRole("columnheader").slice(1);
    expect(igHeaders.map((h) => h.textContent)).toEqual(["@verimlilabSen", "@tekilRakip"]);

    await user.click(screen.getByRole("tab", { name: "TikTok" }));
    const ttHeaders = within(screen.getAllByRole("table")[0]).getAllByRole("columnheader").slice(1);
    expect(ttHeaders.map((h) => h.textContent)).toEqual(["@verimlilabSen"]);
    expect(screen.queryByText(/\(1\)|\(2\)/)).not.toBeInTheDocument();
  });

  it("tek platformda sekme çizilmez", () => {
    renderView(makeInsights());
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("'normaline göre' satırı yok: hesap kendi normaline kıyaslandığı için bilgi taşımaz", () => {
    renderView(makeInsights());
    const table = screen.getAllByRole("table")[0];
    expect(within(table).queryByRole("rowheader", { name: /Medyan lift|Normaline göre/ })).not.toBeInTheDocument();
  });

  it("grup tablosu: taksonomi sırası, normali ölçülmeyen grupta tutan sayısı tire, karşılaştırma tabanı uyarısı", () => {
    const insights = makeInsights({
      durationBuckets: {
        own: [],
        competitors: [
          { key: "30_60", n: 12, liftN: 10, medianLift: 2.1, outlierCount: 3, confidence: "medium", lowBaselineShare: 0.6 },
          { key: "under_15", n: 3, liftN: 0, outlierCount: 0, confidence: "low" },
        ],
      },
    });
    renderView(insights);
    const table = screen.getAllByRole("table")[1];
    const groups = within(table).getAllByRole("rowheader").map((h) => h.textContent);
    expect(groups).toEqual(["15 sn altı", "30–60 sn"]);

    const unmeasuredRow = within(table).getByRole("rowheader", { name: "15 sn altı" }).closest("tr") as HTMLElement;
    // Normali ölçülen video yok: normaline göre sonuç ve tutan sayısı tire ("0 tutan" değil).
    expect(within(unmeasuredRow).getAllByText("—").length).toBeGreaterThanOrEqual(2 + 4); // kendi taraf 4 + rakip lift/tutan
    expect(within(unmeasuredRow).queryByText("0")).not.toBeInTheDocument();

    const measuredRow = within(table).getByRole("rowheader", { name: "30–60 sn" }).closest("tr") as HTMLElement;
    expect(within(measuredRow).getByText("2,1x")).toBeInTheDocument();
    expect(within(measuredRow).getByLabelText(/^Kısmen eminim: Karşılaştırma için baktığım videolar az/)).toBeInTheDocument();
    expect(measuredRow).toHaveTextContent("12 (10 ölçülü)");
  });

  it("boş açılış tarzı tablosu yerine sebebi gösterir; hesaplayamadıklarım listesinde de yer alır", () => {
    const reason = "Alıntısı doğrulanmış video analizi yok.";
    renderView(makeInsights({ unmeasured: [{ section: "hook_types", reason }] }));
    expect(screen.getAllByText(reason)).toHaveLength(2);
    expect(screen.getByText("Hangi açılış tarzı tutuyor", { selector: "span" })).toBeInTheDocument();
  });

  it("senin boyundaki rakip yoksa bunu açıkça söyler", () => {
    renderView(makeInsights());
    expect(screen.getByText(/Senin boyundaki izlenen rakip yok/)).toBeInTheDocument();
  });

  it("kendi takipçi sayısı bilinmiyorsa havuz ölçülemedi der (yok demez)", () => {
    renderView(makeInsights({ similarSize: { count: 0, handles: [] } }));
    expect(screen.getAllByText(/Kendi takipçi sayını alamadım/).length).toBeGreaterThan(0);
  });

  it("hiç hesaplanamayan bölüm yoksa tablodaki tireyle çelişmeyen cümle yazar", () => {
    renderView(makeInsights());
    expect(screen.getByText(/Tüm bölümleri hesapladım/)).toBeInTheDocument();
    expect(screen.queryByText("Ölçülemeyen bölüm yok.")).not.toBeInTheDocument();
  });

  it("sunucu sebebi panel jargonu taşırsa genel cümleyle değişir", () => {
    renderView(makeInsights({ unmeasured: [{ section: "hook_types", reason: "Analiz edilmiş video yok; hook türü ölçülemedi." }] }));
    expect(screen.queryByText(/hook türü ölçülemedi/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Bu bölüm için yeterli veri yok.").length).toBeGreaterThan(0);
  });
});
