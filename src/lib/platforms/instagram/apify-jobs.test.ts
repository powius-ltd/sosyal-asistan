import { describe, expect, it } from "vitest";
import { buildContentJob, buildProfileJob, buildSearchJob, INSTAGRAM_ACTORS } from "@/lib/platforms/instagram/apify-jobs";
import type { ScrapeJobSpec } from "@/lib/platforms/types";

/**
 * Girdilerde oturum/kimlik doğrulama alanı YOK. Desen parçalardan kurulur: AGENTS.md sınır grep'i
 * src/lib/platforms altındaki bu dosyayı da tarar (yasak sözcükler bitişik yazılamaz).
 */
const FORBIDDEN_INPUT = new RegExp(
  ["sess" + "ion", "coo" + "kie", "pass" + "word", "csrf", "token", "credential", "login", "auth", "proxy"].join("|"),
  "i",
);

function allKeysAndStrings(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => allKeysAndStrings(v, out));
  else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      allKeysAndStrings(v, out);
    }
  } else if (typeof value === "string") out.push(value);
  return out;
}

const specs: [string, () => ScrapeJobSpec][] = [
  ["profil", () => buildProfileJob(["ornekhesap", "@ornekrakipbir"])],
  ["içerik", () => buildContentJob({ handle: "ornekhesap", limit: 10, newerThan: "2026-08-01", includeTranscript: true })],
  ["arama", () => buildSearchJob({ query: "life coach women", limit: 10 })],
];

describe("Instagram Apify iş girdileri", () => {
  it.each(specs)("%s işi oturum/çerez/kimlik doğrulama alanı taşımaz", (_name, make) => {
    const spec = make();
    for (const text of allKeysAndStrings(spec.input)) expect(text).not.toMatch(FORBIDDEN_INPUT);
  });

  it("profil işi: aktör, usernames[] (normalize + tekil), hakkında bölümü kapalı", () => {
    const spec = buildProfileJob(["@OrnekHesap", "https://www.instagram.com/ornekhesap/", "ornekrakipbir"]);
    expect(spec).toEqual({
      kind: "profile",
      actorId: "apify/instagram-profile-scraper",
      input: { usernames: ["ornekhesap", "ornekrakipbir"], includeAboutSection: false },
      expectedResults: 2,
    });
  });

  it("içerik işi: username[] + resultsLimit + tarih; ücretli ek özellikler açıkça kapalı", () => {
    const spec = buildContentJob({ handle: "@OrnekHesap", limit: 10, newerThan: "2026-08-01", includeTranscript: false });
    expect(spec.kind).toBe("content");
    expect(spec.actorId).toBe(INSTAGRAM_ACTORS.content);
    expect(spec.actorId).toBe("apify/instagram-reel-scraper");
    expect(spec.expectedResults).toBe(10);
    expect(spec.input).toEqual({
      username: ["ornekhesap"],
      resultsLimit: 10,
      includeTranscript: false,
      includeSharesCount: false,
      includeDownloadedVideo: false,
      onlyPostsNewerThan: "2026-08-01",
    });
  });

  it("içerik işi: transcript istenirse true; newerThan yoksa alan hiç yazılmaz; ISO zaman damgası tarihe indirgenir", () => {
    const withTranscript = buildContentJob({ handle: "a", limit: 5, includeTranscript: true });
    expect(withTranscript.input.includeTranscript).toBe(true);
    expect("onlyPostsNewerThan" in withTranscript.input).toBe(false);

    const iso = buildContentJob({ handle: "a", limit: 5, newerThan: "2026-08-01T00:00:00.000Z", includeTranscript: false });
    expect(iso.input.onlyPostsNewerThan).toBe("2026-08-01");
    const relative = buildContentJob({ handle: "a", limit: 5, newerThan: "1 month", includeTranscript: false });
    expect(relative.input.onlyPostsNewerThan).toBe("1 month");
  });

  it("arama işi: hesap araması (searchType=user), sonuç sınırı", () => {
    expect(buildSearchJob({ query: "  life coach women ", limit: 10 })).toEqual({
      kind: "discovery_search",
      actorId: "apify/instagram-search-scraper",
      input: { search: "life coach women", searchType: "user", searchLimit: 10 },
      expectedResults: 10,
    });
  });

  it("geçersiz girdide fırlatır (para harcanmadan)", () => {
    expect(() => buildProfileJob([])).toThrow();
    expect(() => buildProfileJob(["https://www.instagram.com/p/abc/"])).toThrow(/Geçersiz/);
    expect(() => buildContentJob({ handle: "??", limit: 10, includeTranscript: false })).toThrow(/Geçersiz/);
    expect(() => buildContentJob({ handle: "a", limit: 0, includeTranscript: false })).toThrow(RangeError);
    expect(() => buildContentJob({ handle: "a", limit: 2.5, includeTranscript: false })).toThrow(RangeError);
    expect(() => buildContentJob({ handle: "a", limit: 5, newerThan: " ", includeTranscript: false })).toThrow();
    expect(() => buildSearchJob({ query: "  ", limit: 5 })).toThrow();
    expect(() => buildSearchJob({ query: "x", limit: 251 })).toThrow(RangeError);
  });
});
