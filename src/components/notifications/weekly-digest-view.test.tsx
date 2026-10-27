// @vitest-environment jsdom
import { PANEL_JARGON } from "@/lib/plain-language";
import { DIGEST_PLAIN } from "@/lib/plain-language-account";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WeeklyDigestView } from "@/components/notifications/weekly-digest-view";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ContentSummary } from "@/lib/domain/content-summary";
import { DEFAULT_ALERT_SETTINGS, type AlertSettings, type WeeklyDigest } from "@/lib/domain/notification";

const TZ = "Europe/Istanbul";

const summary = (id: string, over: Partial<ContentSummary> = {}): ContentSummary => ({
  contentItemId: id,
  ownerHandle: "kahvecim",
  platform: "instagram",
  format: "short_video",
  caption: `Alt yazı ${id}`,
  currentLift: 4.2,
  ...over,
});

const digest = (over: Partial<WeeklyDigest> = {}): WeeklyDigest => ({
  periodStart: "2026-09-22T23:30:00.000Z",
  periodEnd: "2026-09-29T23:30:00.000Z",
  own: { followersDelta: 128, views: 45_300, topContent: [{ ...summary("own_1", { caption: "Demleme hatası", hookType: "mistake_warning" }), views: 12_000 }] },
  competitors: {
    newOutliers: [summary("c_1", { ownerHandle: "rakipkahve", caption: "Cold brew sırrı", currentLift: 5.1 })],
    mostActive: { competitorId: "cmp_1", handle: "rakipkahve", posts: 6 },
  },
  ideas: { new: 3, scripted: 0 },
  unmeasuredReasons: {},
  ...over,
});

const wrap = (d: WeeklyDigest, settings: AlertSettings = DEFAULT_ALERT_SETTINGS) =>
  render(
    <TooltipProvider>
      <WeeklyDigestView digest={d} settings={settings} timeZone={TZ} />
    </TooltipProvider>,
  );

describe("WeeklyDigestView", () => {
  it("e-posta önizlemesi: konu satırında dönem (workspace tz), bölümler ve değerler", () => {
    wrap(digest());
    expect(screen.getByText("E-postada böyle görünecek")).toBeInTheDocument();
    expect(screen.getByText(/Haftalık özet · 23 Eyl 2026 – 30 Eyl 2026/)).toBeInTheDocument();
    for (const title of ["Hesabın", "En iyi içeriklerin", "Rakiplerde", "Fikirler"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText("+128")).toBeInTheDocument();
    expect(screen.getByText("45,3 B")).toBeInTheDocument();
    expect(screen.getByText("Açılış: Hata uyarısı")).toBeInTheDocument();
    expect(screen.getByText(/@rakipkahve · 6 paylaşım/)).toBeInTheDocument();
    // İçerikler video sayfasına bağlanır.
    expect(screen.getByRole("link", { name: "Demleme hatası" })).toHaveAttribute("href", "/video/own_1");
    expect(screen.getByRole("link", { name: "Cold brew sırrı" })).toHaveAttribute("href", "/video/c_1");
  });

  it("gerçek sıfır sayaç 0 yazılır (yeni fikir 0, script hazır 0)", () => {
    wrap(digest({ ideas: { new: 0, scripted: 0 } }));
    const ideas = screen.getByRole("heading", { name: "Fikirler" }).closest("section")!;
    expect(within(ideas).getAllByText("0")).toHaveLength(2);
  });

  it("ölçülemeyen değerler tire + sebep olur; 0 ya da +0 yazılmaz", () => {
    wrap(
      digest({
        own: { followersDelta: undefined, views: undefined, topContent: [] },
        competitors: { newOutliers: [], mostActive: undefined },
        ideas: { new: 1, scripted: 1 },
        unmeasuredReasons: {
          followersDelta: "Dönem başı ve sonu için takipçi ölçümü yok.",
          views: "Dönemde izlenmesi ölçülmüş kendi içerik yok.",
          mostActive: "Dönemde izlenen rakiplerden tarihli içerik gelmedi.",
        },
      }),
    );
    const own = screen.getByRole("heading", { name: "Hesabın" }).closest("section")!;
    expect(within(own).getAllByText("—")).toHaveLength(2);
    expect(within(own).queryByText("0")).not.toBeInTheDocument();
    expect(within(own).queryByText("+0")).not.toBeInTheDocument();
    // Ölçülemeyen "en aktif rakip": sebep görünür metin olarak yazılır.
    expect(screen.getByText("Dönemde izlenen rakiplerden tarihli içerik gelmedi.")).toBeInTheDocument();
    expect(screen.getByText(DIGEST_PLAIN.noTopOwn)).toBeInTheDocument();
  });

  it("eksi takipçi değişimi gerçek eksi işaretiyle yazılır", () => {
    wrap(digest({ own: { followersDelta: -42, views: 100, topContent: [] } }));
    expect(screen.getByText("−42")).toBeInTheDocument();
  });

  it("kendi içeriğin izlenmesi ölçülemediyse satırda tire olur", () => {
    wrap(digest({ own: { followersDelta: 1, views: 1, topContent: [{ ...summary("own_2"), views: undefined }] } }));
    const top = screen.getByRole("heading", { name: "En iyi içeriklerin" }).closest("section")!;
    expect(within(top).getByText("—")).toBeInTheDocument();
  });

  it("tutan rakip içeriği yoksa açıklayıcı boş durum ve keşfet bağlantısı", () => {
    wrap(digest({ competitors: { newOutliers: [], mostActive: { competitorId: "cmp_1", handle: "rakipkahve", posts: 2 } } }));
    expect(screen.getByText("Bu hafta tutan rakip içeriği çıkmadı")).toBeInTheDocument();
    expect(screen.getByText(/bu bir veri hatası değildir/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rakip keşfet" })).toHaveAttribute("href", "/rakipler/kesfet");
  });

  it("müşteriye giden metinde panel jargonu, Faz ve ham saat dilimi adı yok (D3-02)", () => {
    const { container } = wrap(digest({ competitors: { newOutliers: [], mostActive: undefined } }));
    const text = container.textContent ?? "";
    expect(text).not.toMatch(PANEL_JARGON);
    expect(text).not.toMatch(/Faz \d|Europe\//);
  });

  it("gönderim notu: açıkken gün + saat + saat dilimi, kapalıyken 'kapalı'; e-posta alıcısı", () => {
    const { unmount } = wrap(digest(), {
      ...DEFAULT_ALERT_SETTINGS,
      weeklyDigest: { enabled: true, weekday: 4, hour: 18 },
      channels: { inApp: true, email: { enabled: true, address: "ad@ornek.com" } },
    });
    expect(screen.getByText(/Gönderim zamanı: her Cuma 18:00 \(İstanbul saati\)/)).toBeInTheDocument();
    expect(screen.getByText("ad@ornek.com")).toBeInTheDocument();
    expect(screen.getByText(/ile gönderim yakında/)).toBeInTheDocument();
    unmount();

    wrap(digest(), { ...DEFAULT_ALERT_SETTINGS, weeklyDigest: { enabled: false, weekday: 0, hour: 9 } });
    expect(screen.getByText(/Haftalık özet şu an kapalı/)).toBeInTheDocument();
    expect(screen.getByText("E-posta adresi tanımlı değil")).toBeInTheDocument();
  });
});
