// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BestTimesCard } from "@/components/overview/best-times-card";
import { TooltipProvider } from "@/components/ui/tooltip";

const wrap = (ui: React.ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe("BestTimesCard", () => {
  it("dilimleri Türkçe gün adı + saat aralığı, tipik izlenme ve video sayısıyla listeler; saat dilimi belirtilir", () => {
    wrap(
      <BestTimesCard
        timeZone="Europe/Istanbul"
        bestTimes={[
          { weekday: 1, hour: 19, medianViews: 8_400, n: 4 },
          { weekday: 5, hour: 9, medianViews: 6_100, n: 3 },
          { weekday: 6, hour: 23, medianViews: 2_050, n: 5 },
        ]}
      />,
    );
    const items = within(screen.getByRole("list", { name: "En iyi paylaşım dilimleri" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Salı · 19:00–20:00");
    expect(items[0]).toHaveTextContent("8,4 B tipik izlenme");
    expect(items[0]).toHaveTextContent("4 video");
    expect(items[1]).toHaveTextContent("Cumartesi · 09:00–10:00");
    // Gün sonu taşması: 23:00–00:00.
    expect(items[2]).toHaveTextContent("Pazar · 23:00–00:00");
    expect(screen.getByText(/saat dilimi Europe\/Istanbul/)).toBeInTheDocument();
  });

  it("açıklama düz dildedir: son 90 gün, aynı gün ve saatte en az 3 video, tipik izlenme (medyan demez)", () => {
    wrap(<BestTimesCard timeZone="Europe/Istanbul" bestTimes={[{ weekday: 0, hour: 20, medianViews: 1_000, n: 3 }]} />);
    expect(screen.getByText(/Son 90 günde, aynı gün ve saatte en az 3 video paylaştığın dilimler; tipik izlenmeye göre/)).toBeInTheDocument();
    expect(screen.queryByText(/medyan/i)).not.toBeInTheDocument();
  });

  it("en çok 3 dilim gösterir", () => {
    wrap(
      <BestTimesCard
        timeZone="Europe/Istanbul"
        bestTimes={[0, 1, 2, 3, 4].map((weekday) => ({ weekday, hour: 10, medianViews: 1_000 - weekday, n: 3 }))}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("ölçülemeyen medyan tire olur, 0 yazılmaz", () => {
    wrap(<BestTimesCard timeZone="Europe/Istanbul" bestTimes={[{ weekday: 5, hour: 9, n: 3 }]} />);
    expect(screen.getByText(/Cumartesi · 09:00–10:00/)).toBeInTheDocument();
    expect(document.querySelector('[data-state="unmeasured"]')).not.toBeNull();
    expect(screen.queryByText(/^0 tipik/)).not.toBeInTheDocument();
  });

  it("ölçülemediyse (undefined) tek satırlık sebep yazar; liste ya da 0 çizilmez", () => {
    wrap(<BestTimesCard timeZone="Europe/Istanbul" unmeasuredReason="Yeterli kısa video yok." />);
    expect(screen.getByText(/En iyi saat henüz hesaplanamadı\. Yeterli kısa video yok\./)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("boş dizi de ölçülemedi gibi ele alınır (sebep yoksa genel açıklama)", () => {
    wrap(<BestTimesCard timeZone="Europe/Istanbul" bestTimes={[]} />);
    expect(screen.getByText(/En iyi saat henüz hesaplanamadı/)).toBeInTheDocument();
    expect(screen.getByText(/en az 3 kısa video gerekir/)).toBeInTheDocument();
  });
});
