// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { testItem } from "@/components/content/test-item";
import { TranscriptPanel } from "@/components/video/transcript-panel";
import { FULL_EDIT_METRICS } from "@/components/video/test-analysis";
import type { Transcript } from "@/lib/domain/intel";

const item = testItem({ id: "ci_1" });

const transcript: Transcript = {
  id: "t1",
  contentItemId: "ci_1",
  language: "tr",
  text: "Sabah kahveni yanlış içiyorsun. Üç yıl boyunca ben de aynısını yaptım ve hiçbir şey değişmedi.",
  wordCount: 15,
  isMeaningful: true,
  source: "gemini",
  createdAt: "2026-09-30T10:00:00.000Z",
};

describe("TranscriptPanel kanalları", () => {
  it("konuşma ve ekran yazısı ayrı bölümler; hook konuşmadansa konuşmada vurgulanır", () => {
    const { container } = render(
      <TranscriptPanel
        item={item}
        transcript={transcript}
        hookText="Sabah kahveni yanlış içiyorsun."
        hookSource="speech"
        editMetrics={FULL_EDIT_METRICS}
      />,
    );
    const speech = screen.getByLabelText("Konuşma kanalı");
    const screenText = screen.getByLabelText("Ekran yazısı kanalı");
    expect(speech).not.toBe(screenText);
    expect(container.querySelector("mark")?.textContent).toBe("Sabah kahveni yanlış içiyorsun.");
    expect(within(speech).getByText("Video analizi (yapay zekâ)")).toBeInTheDocument();
    // ekran yazısı kanalı: adet ölçüm olarak, hook buradan değil
    expect(within(screenText).getByText("3 adet")).toBeInTheDocument();
    expect(within(screenText).queryByText(/Açılış bu kanaldan/)).not.toBeInTheDocument();
  });

  it("hook ekran yazısındansa konuşma metninde hiçbir cümle vurgulanmaz; hook ekran kanalında görünür", () => {
    const { container } = render(
      <TranscriptPanel
        item={item}
        transcript={transcript}
        hookText="YANLIŞ İÇİYORSUN"
        hookSource="screen_text"
        editMetrics={FULL_EDIT_METRICS}
      />,
    );
    expect(container.querySelector("mark")).toBeNull();
    expect(screen.getByText(/Açılış konuşmada değil: kaynağı ekran yazısı/)).toBeInTheDocument();
    const screenText = screen.getByLabelText("Ekran yazısı kanalı");
    expect(within(screenText).getByText("“YANLIŞ İÇİYORSUN”")).toBeInTheDocument();
    expect(within(screenText).getByText(/Açılış bu kanaldan/)).toBeInTheDocument();
  });

  it("kaynağı kayıtlı olmayan eski analizde eski davranış: hook (ya da ilk cümle) konuşmada vurgulanır", () => {
    const { container } = render(<TranscriptPanel item={item} transcript={transcript} hookText="Sabah kahveni yanlış içiyorsun." />);
    expect(container.querySelector("mark")?.textContent).toBe("Sabah kahveni yanlış içiyorsun.");
  });

  it("ekran yazısı sayısı ölçülmediyse tire + sebep; 0 uydurulmaz", () => {
    render(<TranscriptPanel item={item} transcript={transcript} />);
    const screenText = screen.getByLabelText("Ekran yazısı kanalı");
    expect(within(screenText).getByText("—")).toBeInTheDocument();
    expect(within(screenText).queryByText("0 adet")).not.toBeInTheDocument();
  });

  it("segmentler varsa ekran yazısı kanalı tam dökümü zamanıyla gösterir; konuşma parçaları dökümde yok; hook satırı vurgulanır", () => {
    const segments: Transcript["segments"] = [
      { startSec: 0, endSec: 3, text: "Sabah kahveni yanlış içiyorsun.", channel: "speech" },
      { startSec: 1, text: "YANLIŞ İÇİYORSUN", channel: "screen" },
      { startSec: 65, text: "Yorumla: KAHVE", channel: "screen" },
    ];
    render(<TranscriptPanel item={item} transcript={{ ...transcript, segments }} hookText="YANLIŞ İÇİYORSUN" hookSource="screen_text" />);
    const dump = within(screen.getByLabelText("Ekran yazısı kanalı")).getByLabelText("Ekran yazısı dökümü");
    expect(within(dump).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["0:01YANLIŞ İÇİYORSUN", "1:05Yorumla: KAHVE"]);
    expect(within(dump).queryByText("Sabah kahveni yanlış içiyorsun.")).not.toBeInTheDocument();
    // adet kurgu ölçümü yokken dökümden türer; hook aynı satırdadır (ayrıca alıntı olarak tekrarlanmaz)
    expect(screen.getByText("2 adet")).toBeInTheDocument();
    expect(screen.queryByText("“YANLIŞ İÇİYORSUN”")).not.toBeInTheDocument();
  });

  it("transcript yok: konuşma kanalı açıklayıcı boş durum, ekran kanalı çizilmez", () => {
    const { container } = render(<TranscriptPanel item={item} transcript={undefined} />);
    expect(screen.getByText("Konuşma metni henüz alınmadı")).toBeInTheDocument();
    // Komut metni yok: video analizini başlatan iş düğmesi komşu Analiz kartındadır.
    expect(screen.getByText(/video analizi koşunca çıkarılır/)).toBeInTheDocument();
    expect(container).not.toHaveTextContent("analyze:now");
    expect(screen.queryByLabelText("Ekran yazısı kanalı")).not.toBeInTheDocument();
  });

  it("süresi dolan transcript: konuşma 'süresi doldu', ekran kanalı yine görünür", () => {
    render(<TranscriptPanel item={item} transcript={{ ...transcript, text: undefined }} editMetrics={FULL_EDIT_METRICS} />);
    expect(screen.getByText("Konuşma metninin saklama süresi doldu")).toBeInTheDocument();
    expect(screen.getByLabelText("Ekran yazısı kanalı")).toBeInTheDocument();
  });
});
