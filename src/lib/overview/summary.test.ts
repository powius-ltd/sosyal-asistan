import { describe, expect, it } from "vitest";

import { makePlan } from "@/components/weekly-plan/test-fixtures";
import type { WeekReview } from "@/lib/domain/outcomes";
import { makeInput, makeOverview } from "@/lib/overview/test-fixtures";
import { buildOverviewSummary, EMPTY_WHERE_TEXT, NO_NUMBERS_TEXT, SUMMARY_ASKS_MAX } from "@/lib/overview/summary";

const published = (n: number) => {
  const plan = makePlan();
  plan.items[n].idea = { ...plan.items[n].idea, status: "published" };
  return plan;
};

describe("buildOverviewSummary: neredeyiz", () => {
  it("dönem, önceki döneme göre değişim ve kendi tutanları tek cümle zincirinde söyler", () => {
    const { where } = buildOverviewSummary(makeInput({ ownOutliers: { count: 6, bestLift: 5.93 } }));
    expect(where?.text).toBe(
      "Son 30 günde 20 video paylaştın, 14.800 izlenme aldın; önceki 30 güne göre %48 arttı. 6 videon normalinin en az 3 katı izlendi; en iyisi 5,9 katı.",
    );
    expect(where?.link).toEqual({ label: "Hangileri?", href: "/tutanlar" });
  });

  it("düşüşü 'azaldı' diye söyler", () => {
    const overview = makeOverview({ posts: 5, postsPrev: 8, views: 5_000, viewsPrev: 10_000 });
    expect(buildOverviewSummary(makeInput({ overview })).where?.text).toContain("önceki 30 güne göre %50 azaldı");
  });

  it("önceki dönemde 3'ten az yayın varsa yüzde söylemez (anlamsız oran)", () => {
    const overview = makeOverview({ posts: 20, postsPrev: 1, views: 22_477, viewsPrev: 4 });
    const text = buildOverviewSummary(makeInput({ overview })).where?.text ?? "";
    expect(text).toBe("Son 30 günde 20 video paylaştın, 22.477 izlenme aldın.");
    expect(text).not.toMatch(/%|önceki/);
  });

  it("önceki dönem izlenmesi 0 ya da bilinmiyorsa değişim yazmaz", () => {
    for (const viewsPrev of [0, undefined]) {
      const overview = makeOverview({ posts: 10, postsPrev: 10, views: 900, viewsPrev });
      expect(buildOverviewSummary(makeInput({ overview })).where?.text).not.toContain("önceki");
    }
  });

  it("ölçülemeyen izlenme cümleye girmez, sıfır yazılmaz", () => {
    const overview = makeOverview({ posts: 4, views: undefined });
    const text = buildOverviewSummary(makeInput({ overview })).where?.text ?? "";
    expect(text).toBe("Son 30 günde 4 video paylaştın.");
    expect(text).not.toMatch(/\b0\b|izlenme/);
  });

  it("hiçbir sayı ölçülemediyse 'henüz veri yok' der", () => {
    const overview = makeOverview({});
    const { where } = buildOverviewSummary(makeInput({ overview, ownOutliers: { count: 0 } }));
    expect(where).toEqual({ text: NO_NUMBERS_TEXT });
  });

  it("ölçülmüş sıfır yayın 'paylaşmadın' olur; sıfır tutan yalnız izlenme ölçülmüşse söylenir", () => {
    const overview = makeOverview({ posts: 0, views: 120 });
    const text = buildOverviewSummary(makeInput({ overview, ownOutliers: { count: 0 } })).where?.text ?? "";
    expect(text).toContain("Son 30 günde video paylaşmadın, 120 izlenme aldın.");
    expect(text).toContain("Henüz normalinin en az 3 katı izlenen bir videon yok.");
    const unmeasured = buildOverviewSummary(makeInput({ overview: makeOverview({ posts: 3 }), ownOutliers: { count: 0 } })).where?.text ?? "";
    expect(unmeasured).not.toContain("Henüz normalinin");
  });

  it("en iyi lift ölçülemiyorsa 'en iyisi' demez; tutan okunamadıysa o cümle yok", () => {
    const withCount = buildOverviewSummary(makeInput({ ownOutliers: { count: 2 } })).where;
    expect(withCount?.text).toContain("2 videon normalinin en az 3 katı izlendi.");
    expect(withCount?.text).not.toContain("en iyisi");
    expect(buildOverviewSummary(makeInput({ ownOutliers: undefined })).where?.text).not.toContain("videon normalinin");
  });
});

describe("buildOverviewSummary: boş çalışma alanı", () => {
  it("hesap yoksa ilk-bakış metni, ikinci satır yok, tek iş hesabı bağlamak", () => {
    const summary = buildOverviewSummary(makeInput({ accounts: [], lastCollectedAt: undefined, overview: makeOverview({}) }));
    expect(summary.empty).toBe(true);
    expect(summary.where?.text).toBe(EMPTY_WHERE_TEXT);
    expect(summary.done).toBeUndefined();
    expect(summary.asks.map((ask) => ask.id)).toEqual(["connect_account"]);
    expect(summary.asks[0].action).toEqual({ label: "Ayarlar'ı aç", href: "/ayarlar" });
  });

  it("hesap var ama hiç toplama ve ölçülmüş gösterge yoksa da boştur (hesap bağla işi çıkmaz)", () => {
    const summary = buildOverviewSummary(makeInput({ lastCollectedAt: undefined, overview: makeOverview({}) }));
    expect(summary.empty).toBe(true);
    expect(summary.asks).toEqual([]);
  });

  it("göstergeler okunamadıysa 'hiç bakmadım' denmez", () => {
    const summary = buildOverviewSummary(makeInput({ lastCollectedAt: undefined, overview: undefined }));
    expect(summary.empty).toBe(false);
    expect(summary.where).toBeUndefined();
  });

  it("ölçülmüş sıfır gösterge bakış yapıldığını gösterir", () => {
    const summary = buildOverviewSummary(makeInput({ lastCollectedAt: undefined, overview: makeOverview({ posts: 0 }) }));
    expect(summary.empty).toBe(false);
  });
});

describe("buildOverviewSummary: bu hafta ne yaptık", () => {
  it("incelenen video, fikir ve planı tek cümlede söyler; plan bağlantısı hafta parametreli", () => {
    const { done } = buildOverviewSummary(
      makeInput({ activity: { analyzedVideos: 6, truncated: false }, newIdeas: 4, plan: makePlan() }),
    );
    expect(done?.text).toMatch(/^Bu hafta 6 video inceledim, 4 fikir çıkardım; 5 Eki – 11 Eki planın hazır\.$/);
    expect(done?.link).toEqual({ label: "Planı aç", href: "/bu-hafta?hafta=2026-10-05" });
  });

  it("sıfır olan parça düşer; taslak plan taslak diye söylenir", () => {
    const text = buildOverviewSummary(
      makeInput({ activity: { analyzedVideos: 0, truncated: false }, newIdeas: 0, plan: makePlan({ status: "draft" }) }),
    ).done?.text;
    expect(text).toBe("5 Eki – 11 Eki planının taslağı hazır.");
  });

  it("koşu sayfaları tavana dayandıysa sayıyı 'en az' diye yazar", () => {
    const text = buildOverviewSummary(makeInput({ activity: { analyzedVideos: 1000, truncated: true }, plan: makePlan() })).done?.text;
    expect(text).toContain("Bu hafta en az 1.000 video inceledim");
  });

  it("veri var plan yok: plan hazır olunca göreceğini söyler", () => {
    expect(buildOverviewSummary(makeInput({ plan: null })).done?.text).toBe("Videolarını inceliyorum; plan hazır olunca burada göreceksin.");
    const withWork = buildOverviewSummary(makeInput({ plan: null, activity: { analyzedVideos: 3, truncated: false }, newIdeas: 2 }));
    expect(withWork.done?.text).toBe("Bu hafta 3 video inceledim, 2 fikir çıkardım; plan hazır olunca burada göreceksin.");
    expect(withWork.done?.link).toBeUndefined();
  });

  it("plan geçmiş haftaysa bu hafta için plan çıkarmadığını söyler", () => {
    const text = buildOverviewSummary(makeInput({ plan: makePlan({ weekStart: "2026-09-28" }) })).done?.text;
    expect(text).toBe("Bu hafta için henüz plan çıkarmadım.");
  });

  it("hiçbir parça okunamadıysa satır çizilmez (uydurma yok)", () => {
    expect(buildOverviewSummary(makeInput({ activity: undefined, newIdeas: undefined, plan: undefined })).done).toBeUndefined();
  });

  it("yalnız okunabilen parçayı söyler", () => {
    expect(buildOverviewSummary(makeInput({ activity: undefined, newIdeas: 2, plan: undefined })).done?.text).toBe("Bu hafta 2 fikir çıkardım.");
  });
});

describe("buildOverviewSummary: senden ne bekliyoruz", () => {
  const busy = () =>
    makeInput({
      pendingApproval: 2,
      suggestedLinks: 1,
      plan: makePlan(),
      measurementDueDays: [7, 3],
    });

  it("öncelik sırasıyla işler ve en çok 3 taneyi tutar", () => {
    const { asks } = buildOverviewSummary(busy());
    expect(SUMMARY_ASKS_MAX).toBe(3);
    expect(asks.map((ask) => ask.id)).toEqual(["approve_publish", "confirm_links", "shoot_next"]);
    expect(asks[0]).toMatchObject({ text: "2 yayın senin onayını bekliyor.", action: { href: "/yayin" } });
    expect(asks[1].text).toContain("1 videonun hangi fikirden çıktığını tahmin ettim");
  });

  it("sıradaki çekim: yayınlanmış ilk maddeyi atlar, slotu hedef kitle ve İstanbul saatiyle yazar", () => {
    const { asks } = buildOverviewSummary(makeInput({ plan: published(0), measurementDueDays: [3, 7] }));
    expect(asks.map((ask) => ask.id)).toEqual(["shoot_next", "measurement"]);
    expect(asks[0].text).toBe("Sıradaki video: “Fikir 2”. Planlanan yayın: Per 19:00 ET (Cum 02:00 İstanbul).");
    expect(asks[0].action).toEqual({ label: "Senaryoyu aç", href: "/fikirler?id=idea-2" });
    expect(asks[1].text).toBe("2 videonun 3. ve 7. gün sonucu bekleniyor.");
  });

  it("plan geçmiş haftaysa 'çek' denmez", () => {
    const { asks } = buildOverviewSummary(makeInput({ plan: makePlan({ weekStart: "2026-09-28" }) }));
    expect(asks).toEqual([]);
  });

  it("slotu olmayan maddede saat uydurulmaz", () => {
    const plan = makePlan();
    plan.items = [{ ...plan.items[0], slotAt: undefined }];
    expect(buildOverviewSummary(makeInput({ plan })).asks[0].text).toBe("Sıradaki video: “Fikir 1”.");
  });

  it("yayını onaylanmış (bağı onaylı) ilk madde sıradaki sayılmaz", () => {
    const plan = makePlan();
    const review = {
      items: [{ ideaId: "idea-1", title: "Fikir 1", suggestionCount: 0, checkpoints: [], directions: [], link: { linkId: "l", status: "confirmed", origin: "manual_url", shortcode: "x" } }],
    } as unknown as WeekReview;
    expect(buildOverviewSummary(makeInput({ plan, review })).asks[0].action.href).toBe("/fikirler?id=idea-2");
  });

  it("ölçüm: operatör ve bütçe onaysızsa bütçeyi onaylamasını ister; müşteriye bütçe konuşulmaz", () => {
    const base = { measurementDueDays: [7] as const, measureCapApproved: false };
    const operator = buildOverviewSummary(makeInput({ ...base, operator: true })).asks[0];
    expect(operator.text).toContain("aylık ölçüm bütçesini onaylaman");
    expect(operator.action.href).toBe("/ayarlar");
    const customer = buildOverviewSummary(makeInput({ ...base, operator: false })).asks[0];
    expect(customer.text).toBe("1 videonun 7. gün sonucu bekleniyor.");
    expect(customer.text).not.toMatch(/bütçe|Apify/);
  });

  it("ölçüm günlerini sıralar, tekrarı atar ve '1., 3. ve 7.' diye birleştirir", () => {
    const text = buildOverviewSummary(makeInput({ measurementDueDays: [7, 1, 3, 3] })).asks[0].text;
    expect(text).toBe("4 videonun 1., 3. ve 7. gün sonucu bekleniyor.");
  });

  it("hiç iş yoksa boş liste (arayüz 'şu an senden bir şey beklemiyorum' der)", () => {
    expect(buildOverviewSummary(makeInput({ pendingApproval: 0, suggestedLinks: 0, measurementDueDays: [] })).asks).toEqual([]);
  });

  it("okunamayan parça iş çıkarmaz", () => {
    const asks = buildOverviewSummary(
      makeInput({ pendingApproval: undefined, suggestedLinks: undefined, measurementDueDays: undefined, plan: undefined }),
    ).asks;
    expect(asks).toEqual([]);
  });
});
