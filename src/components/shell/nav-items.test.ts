import { describe, expect, it } from "vitest";

import { locate, NAV_COPY, NAV_FLOW_ROUTES, NAV_MENU_GROUPS, NAV_PRIMARY, primaryCurrent, visibleMenuGroups, visibleSections, type NavArea, type PrimaryId } from "@/components/shell/nav-items";
import { ROUTES } from "@/lib/routes";

/** `ROUTES` içindeki tüm sabit sayfa adresleri (işlev olan `video` hariç). */
const STATIC_ROUTES = Object.values(ROUTES).filter((route): route is Exclude<typeof route, (id: string) => string> => typeof route === "string");

const sections = (id: PrimaryId) => NAV_PRIMARY.find((p) => p.id === id)?.sections.map((s) => s.href);

describe("kopya sürümü: sekmeler", () => {
  const results = NAV_PRIMARY.find((p) => p.id === "results")!;
  it("sürüm anahtarı yokken yönetici Reklamlar sekmesini görür (bugünkü davranış)", () => {
    expect(visibleSections(results, true).map((s) => s.href)).toContain(ROUTES.ads);
  });
  it("kopyada yönetici modu açık olsa da Reklamlar sekmesi yok", () => {
    expect(visibleSections(results, true, true).map((s) => s.href)).not.toContain(ROUTES.ads);
    expect(NAV_COPY.map((i) => i.href)).not.toContain(ROUTES.ads);
    expect(NAV_COPY.flatMap((i) => i.children ?? []).map((c) => c.href)).not.toContain(ROUTES.ads);
  });
});

describe("gezinme haritası", () => {
  it("4 ana madde: Bugün · Plan · Videolar · Sonuçlar (hepsi bağlantı)", () => {
    expect(NAV_PRIMARY.map((p) => [p.label, p.href])).toEqual([
      ["Bugün", ROUTES.overview],
      ["Plan", ROUTES.thisWeek],
      ["Videolar", ROUTES.content],
      ["Sonuçlar", ROUTES.results],
    ]);
  });

  it("ikinci düzey: Plan = Bu hafta · Fikirler; Videolar = İçeriklerim · Yayın; Sonuçlar = Özet · Tutanlar · Rakipler · Karşılaştırma · Anatomi · Açılış kütüphanesi", () => {
    expect(sections("today")).toEqual([]);
    expect(sections("plan")).toEqual([ROUTES.thisWeek, ROUTES.ideas]);
    expect(sections("videos")).toEqual([ROUTES.content, ROUTES.publish]);
    expect(sections("results")).toEqual([ROUTES.results, ROUTES.outliers, ROUTES.competitors, ROUTES.comparison, ROUTES.anatomy, ROUTES.hooks, ROUTES.ads]);
    // Ana maddenin adresi ilk sekmesidir: maddeye basan sekmesiz bir sayfaya düşmez.
    for (const primary of NAV_PRIMARY) {
      if (primary.sections.length > 0) expect(primary.sections[0]?.href).toBe(primary.href);
    }
  });

  it("'Neye dayanıyorum' kümesi Sonuçlar şeridinde Kreatif anatomisi ile başlar", () => {
    const labelled = NAV_PRIMARY.flatMap((p) => p.sections).filter((leaf) => leaf.groupLabel !== undefined);
    expect(labelled.map((leaf) => [leaf.href, leaf.groupLabel])).toEqual([[ROUTES.anatomy, "Neye dayanıyorum"]]);
  });

  it("her sabit rota yönetici modunda tam bir yerden ulaşılır (çift kayıt yok); akış sayfaları haritada değil bağlamdan açılır", () => {
    expect(NAV_FLOW_ROUTES).toEqual([ROUTES.onboarding]);
    expect(locate(ROUTES.onboarding)?.area).toBe("today");
    // Fiş sayfası dinamiktir (`/fis/[id]`): haritada madde yok, Plan'a aittir (`/video/[id]` gibi önekle).
    expect(locate(ROUTES.ticket("so_1"))?.area).toBe("plan");
    const hrefs = [
      ...NAV_FLOW_ROUTES,
      ...NAV_PRIMARY.flatMap((p) => (p.sections.length > 0 ? p.sections.map((s) => s.href) : [p.href])),
      ...visibleMenuGroups(true).flatMap((group) => group.items.map((item) => item.href)),
    ];
    expect([...hrefs].sort()).toEqual([...STATIC_ROUTES].sort());
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("profil menüsü: Hesap herkese; Kulis (İşler, Keşfet, Koleksiyonlar) yalnız yönetici modunda", () => {
    expect(visibleMenuGroups(false).map((group) => group.id)).toEqual(["account"]);
    expect(visibleMenuGroups(true).map((group) => [group.id, group.label])).toEqual([
      ["account", "Hesap"],
      ["backstage", "Kulis"],
    ]);
    const backstage = NAV_MENU_GROUPS.find((group) => group.id === "backstage");
    expect(backstage?.operatorOnly).toBe(true);
    expect(backstage?.items.map((item) => item.href)).toEqual([ROUTES.jobs, ROUTES.discover, ROUTES.collections]);
    const customerHrefs = visibleMenuGroups(false).flatMap((group) => group.items.map((item) => item.href));
    expect(customerHrefs).toEqual([ROUTES.notifications, ROUTES.settings]);
    // Menü satırları ikonludur (sekmeler ikonsuz).
    for (const group of NAV_MENU_GROUPS) for (const item of group.items) expect(item.icon).toBeDefined();
  });
});

describe("locate (yol → ana madde / menü + madde)", () => {
  const cases: [string, NavArea, string | undefined][] = [
    [ROUTES.overview, "today", undefined],
    [ROUTES.thisWeek, "plan", ROUTES.thisWeek],
    [ROUTES.ideas, "plan", ROUTES.ideas],
    [ROUTES.content, "videos", ROUTES.content],
    [ROUTES.publish, "videos", ROUTES.publish],
    [ROUTES.results, "results", ROUTES.results],
    [ROUTES.outliers, "results", ROUTES.outliers],
    [ROUTES.competitors, "results", ROUTES.competitors],
    [ROUTES.comparison, "results", ROUTES.comparison],
    [ROUTES.anatomy, "results", ROUTES.anatomy],
    [ROUTES.hooks, "results", ROUTES.hooks],
    [ROUTES.ads, "results", ROUTES.ads],
    [ROUTES.video("ci_001"), "results", undefined],
    [ROUTES.discover, "menu", ROUTES.discover],
    [ROUTES.collections, "menu", ROUTES.collections],
    [ROUTES.jobs, "menu", ROUTES.jobs],
    [ROUTES.notifications, "menu", ROUTES.notifications],
    [ROUTES.settings, "menu", ROUTES.settings],
    [`${ROUTES.settings}/alt`, "menu", ROUTES.settings],
  ];

  it.each(cases)("%s → %s", (pathname, area, leafHref) => {
    const location = locate(pathname);
    expect(location?.area).toBe(area);
    expect(location?.leaf?.href).toBe(leafHref);
  });

  it("en uzun eşleşme kazanır: /tutanlar/hooklar Tutanlar değil Açılış kütüphanesi, /rakipler/kesfet Rakipler değil Keşfet (kulis)", () => {
    expect(locate(ROUTES.hooks)?.leaf?.label).toBe("Açılış kütüphanesi");
    expect(locate(ROUTES.discover)?.leaf?.label).toBe("Keşfet");
    expect(locate(ROUTES.comparison)?.leaf?.label).toBe("Karşılaştırma");
  });

  it("haritada olmayan yol hiçbir yere ait değil; ön ek benzerliği eşleşme sayılmaz", () => {
    expect(locate("/bilinmeyen")).toBeUndefined();
    expect(locate("/fikirlerim")).toBeUndefined();
  });
});

describe("primaryCurrent (ana maddenin aria-current değeri)", () => {
  const currentOn = (pathname: string) => NAV_PRIMARY.map((primary) => primaryCurrent(primary, pathname));

  it("maddenin kendi adresinde page; alt sayfasında true (üst madde etkin kalır); başka maddelerde yok", () => {
    expect(currentOn(ROUTES.overview)).toEqual(["page", undefined, undefined, undefined]);
    expect(currentOn(ROUTES.thisWeek)).toEqual([undefined, "page", undefined, undefined]);
    expect(currentOn(ROUTES.ideas)).toEqual([undefined, "true", undefined, undefined]);
    expect(currentOn(ROUTES.publish)).toEqual([undefined, undefined, "true", undefined]);
    expect(currentOn(ROUTES.hooks)).toEqual([undefined, undefined, undefined, "true"]);
    expect(currentOn(ROUTES.video("ci_001"))).toEqual([undefined, undefined, undefined, "true"]);
  });

  it("profil menüsü sayfasında ve bilinmeyen yolda hiçbir ana madde etkin değil", () => {
    expect(currentOn(ROUTES.settings)).toEqual([undefined, undefined, undefined, undefined]);
    expect(currentOn(ROUTES.jobs)).toEqual([undefined, undefined, undefined, undefined]);
    expect(currentOn("/bilinmeyen")).toEqual([undefined, undefined, undefined, undefined]);
  });
});
