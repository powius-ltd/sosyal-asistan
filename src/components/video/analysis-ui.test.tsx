// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// İş düğmesinin sarmalayıcısı async sunucu bileşeni taşır (jsdom'da çizilmez): yer tutucuyla değişir; kapı ve yedek komut metni
// `components/workspace/job-command.test.tsx`'te sınanır.
vi.mock("@/components/workspace/job-command", () => import("@/components/workspace/job-command-stub"));

import { analysisMetaText } from "@/components/video/analysis-meta";
import { AnalysisPanel } from "@/components/video/analysis-panel";
import { EditMetricsCard } from "@/components/video/edit-metrics-card";
import { EvidenceReportCard } from "@/components/video/evidence-report-card";
import { FULL_EDIT_METRICS, testAnalysis, testEvidenceReport } from "@/components/video/test-analysis";

const ANALYZE_BUTTON = { name: "Videoları incele" };

describe("AnalysisPanel", () => {
  it("analiz yok: henüz koşmadı diye açıklar; komut metni yok, toplu video analizi iş düğmesi var", () => {
    const { container } = render(<AnalysisPanel analysis={undefined} />);
    expect(screen.getByText("Bu içerik henüz analiz edilmedi")).toBeInTheDocument();
    expect(screen.getByText(/henüz koşmadı/)).toBeInTheDocument();
    expect(container).not.toHaveTextContent("analyze:now");
    expect(screen.getByRole("button", ANALYZE_BUTTON)).toHaveAttribute("data-kind", "analyze");
  });

  it("failed: sebebi gösterir, yeniden deneneceğini söyler; komut metni yok, iş düğmesi var", () => {
    const { container } = render(<AnalysisPanel analysis={testAnalysis({ status: "failed", failureReason: "Video indirilemedi (zaman aşımı)." })} />);
    expect(screen.getByText("Analiz başarısız")).toBeInTheDocument();
    expect(screen.getByText(/Video indirilemedi \(zaman aşımı\)\./)).toBeInTheDocument();
    expect(screen.getByText(/yeniden denenir/)).toBeInTheDocument();
    expect(container).not.toHaveTextContent("analyze:now");
    expect(screen.getByRole("button", ANALYZE_BUTTON)).toHaveAttribute("data-kind", "analyze");
  });

  it("insufficient_data: sebebi ve 8 kelime kuralını gösterir, açılış/bölüm göstermez", () => {
    render(
      <AnalysisPanel
        analysis={testAnalysis({
          status: "insufficient_data",
          failureReason: "Konuşma + ekran yazısı 3 kelime.",
          hookText: undefined,
          sections: [],
          labels: [],
        })}
      />,
    );
    expect(screen.getByText("Analiz için veri yetersiz")).toBeInTheDocument();
    expect(screen.getByText(/Konuşma \+ ekran yazısı 3 kelime\./)).toBeInTheDocument();
    expect(screen.queryByText("Açılış")).not.toBeInTheDocument();
    // Analiz koştu (veri yetmedi): yeniden koşturmak sonucu değiştirmez, iş düğmesi çizilmez.
    expect(screen.queryByRole("button", ANALYZE_BUTTON)).not.toBeInTheDocument();
  });

  it("ok: açılış metni, kaynağı, türü ve kanıt alıntısı; bölümler zamanlı; etiket değerleri Türkçe; künye yalnız yönetici modunda", () => {
    const { container } = render(<AnalysisPanel analysis={testAnalysis()} operator />);
    // hook metni + kaynak + tür + tür kanıtı
    expect(screen.getAllByText("“Sabah kahveni yanlış içiyorsun.”").length).toBeGreaterThan(0);
    expect(screen.getByText("Konuşma")).toBeInTheDocument();
    expect(screen.getByText("Hata uyarısı")).toBeInTheDocument();
    expect(screen.getByText("“yanlış içiyorsun”")).toBeInTheDocument();
    // bölümler: tip etiketi + başlangıç saniyesi (ölçülemeyen "—")
    expect(screen.getByText("Hikaye")).toBeInTheDocument();
    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    // etiket: frame değeri Türkçe
    expect(screen.getByText("Çerçeve:")).toBeInTheDocument();
    expect(screen.getByText("Pratik")).toBeInTheDocument();
    // künye
    expect(container.textContent).toContain("Arka uç: Antigravity (agy) · Model: gemini-3.8-flash-medium · Taksonomi 2026-10-v1 · İstem video-v2");
    // doğrulanmış analizde uyarı yok
    expect(screen.queryByText("Kanıt doğrulanamadı")).not.toBeInTheDocument();
  });

  it("müşteri görünümünde teknik künye (arka uç, model, taksonomi, istem sürümü) ve \"Hook\" yok (D2-10)", () => {
    const { container } = render(<AnalysisPanel analysis={testAnalysis()} />);
    expect(container.textContent).not.toMatch(/Arka uç|Model:|Taksonomi|İstem video|Antigravity|gemini/);
    expect(container.textContent).not.toMatch(/\bhook\b/i);
    expect(screen.getAllByText("Açılış").length).toBeGreaterThan(0);
  });

  it("kaynağı kayıtlı olmayan eski analiz: kaynak alanı tire + sebep, 0/boş değil", () => {
    render(<AnalysisPanel analysis={testAnalysis({ hookSource: undefined, evidenceReport: undefined })} />);
    expect(screen.getByLabelText(/eski sürüm/)).toBeInTheDocument();
  });

  it("doğrulanamayan alıntı işaretlenir; genel uyarı çıkar", () => {
    const analysis = testAnalysis({
      evidenceVerified: false,
      evidenceReport: testEvidenceReport({
        verified: false,
        passed: 5,
        failures: [{ target: "section", key: "story", quote: "Üç yıl boyunca ben de aynısını yaptım.", found: false, failure: "not_found" }],
      }),
    });
    render(<AnalysisPanel analysis={analysis} />);
    expect(screen.getByText("Kanıt doğrulanamadı")).toBeInTheDocument();
    const marks = screen.getAllByLabelText("Alıntı doğrulanamadı");
    expect(marks).toHaveLength(1);
    // işaret yalnız başarısız bölümün satırında
    const item = marks[0].closest("li");
    expect(item).not.toBeNull();
    expect(within(item as HTMLElement).getByText(/Üç yıl boyunca/)).toBeInTheDocument();
  });

  it("ekran yazısı kaynağı: hook kaynağı rozeti 'Ekran yazısı'", () => {
    render(<AnalysisPanel analysis={testAnalysis({ hookSource: "screen_text" })} />);
    expect(screen.getByText("Ekran yazısı")).toBeInTheDocument();
  });
});

describe("analysisMetaText", () => {
  it("arka uç ve model yoksa yalnız sürümleri yazar", () => {
    expect(analysisMetaText(testAnalysis({ backend: undefined, model: undefined }))).toBe(
      "Taksonomi 2026-10-v1 · İstem video-v2",
    );
  });

  it("gemini-api arka ucunu adlandırır", () => {
    expect(analysisMetaText(testAnalysis({ backend: "gemini-api", model: undefined }))).toContain("Arka uç: Gemini API");
  });
});

describe("EditMetricsCard", () => {
  it("tüm ölçümleri gösterir: kesme, tempo + dakika başı, plan süresi, ekran yazısı, konuşan yüz", () => {
    const { container } = render(<EditMetricsCard analysis={{ editMetrics: FULL_EDIT_METRICS }} />);
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("Hızlı")).toBeInTheDocument();
    expect(container.textContent).toContain("25,0 kesme/dk");
    expect(screen.getByText("2,4 sn")).toBeInTheDocument();
    expect(screen.getByText("3 adet")).toBeInTheDocument();
    // konuşan yüz = true → Evet; müzik = false → "Hayır" (gerçek ölçüm, tire değil)
    expect(screen.getAllByText("Evet")).toHaveLength(2);
    expect(screen.getByText("Hayır")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("ölçülemeyen alan tire + sebep; 0 adet gerçek ölçümdür", () => {
    render(<EditMetricsCard analysis={{ editMetrics: { onScreenTextCount: 0, cutCount: 9 } }} />);
    expect(screen.getByText("0 adet")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    // tempo, plan süresi, konuşan yüz, müzik, yakılmış altyazı ölçülmedi
    expect(screen.getAllByText("—")).toHaveLength(5);
    expect(screen.queryByText("0 kesme/dk")).not.toBeInTheDocument();
  });

  it("ölçüm hiç yoksa her satır tire (0 uydurulmaz)", () => {
    render(<EditMetricsCard analysis={{ editMetrics: undefined }} />);
    expect(screen.getAllByText("—")).toHaveLength(7);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("EvidenceReportCard", () => {
  it("doğrulandı rozeti, sayılar ve açılışın kanalı", () => {
    render(<EvidenceReportCard analysis={{ evidenceVerified: true, evidenceReport: testEvidenceReport() }} />);
    expect(screen.getByText("Doğrulandı")).toBeInTheDocument();
    expect(screen.getByText("6 / 6")).toBeInTheDocument();
    expect(screen.getByText("Konuşma")).toBeInTheDocument();
    expect(screen.getByText(/64 kelime/)).toBeInTheDocument();
    expect(screen.getByText(/kesin kanıt değildir/)).toBeInTheDocument();
    expect(screen.queryByText("Doğrulanamayan alıntılar")).not.toBeInTheDocument();
  });

  it("doğrulanamayan alıntıları hedef, metin ve sebeple listeler", () => {
    render(
      <EvidenceReportCard
        analysis={{
          evidenceVerified: false,
          evidenceReport: testEvidenceReport({
            verified: false,
            hookChannel: undefined,
            passed: 4,
            failures: [
              { target: "hook", quote: "Bu cümle videoda yok.", found: false, failure: "not_found" },
              { target: "label", key: "topic", quote: "x", found: false, failure: "too_short" },
            ],
          }),
        }}
      />,
    );
    expect(screen.getByText("Doğrulanamadı")).toBeInTheDocument();
    expect(screen.getByText("4 / 6")).toBeInTheDocument();
    expect(screen.getByText("Doğrulanamayan alıntılar")).toBeInTheDocument();
    expect(screen.getByText("“Bu cümle videoda yok.”")).toBeInTheDocument();
    expect(screen.getByText(/birebir bulunamadı/)).toBeInTheDocument();
    expect(screen.getByText("Etiket: Konu")).toBeInTheDocument();
    expect(screen.getByText(/çok kısa/)).toBeInTheDocument();
    // hook hiçbir kanalda doğrulanmadı → kanal tire + sebep
    expect(screen.getByLabelText(/Açılış hiçbir kanalda doğrulanamadı/)).toBeInTheDocument();
  });

  it("rapor kaydedilmemiş eski analiz: genel sonuç + ayrıntı yok notu", () => {
    render(<EvidenceReportCard analysis={{ evidenceVerified: true, evidenceReport: undefined }} />);
    expect(screen.getByText("Doğrulandı")).toBeInTheDocument();
    expect(screen.getByText(/Denetim ayrıntısı bu analizde kaydedilmemiş/)).toBeInTheDocument();
  });

  it("yetersiz veri: 0 alıntı 'denetlenecek alıntı yok' der, 0 / 0 yazmaz", () => {
    render(
      <EvidenceReportCard
        analysis={{
          evidenceVerified: false,
          evidenceReport: testEvidenceReport({ verified: false, insufficientData: true, corpusWords: 3, checked: 0, passed: 0, hookChannel: undefined }),
        }}
      />,
    );
    expect(screen.getByText("Denetlenecek alıntı yok")).toBeInTheDocument();
    expect(screen.getByText(/8 kelimeden az/)).toBeInTheDocument();
  });
});
