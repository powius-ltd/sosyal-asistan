/**
 * Mock üreteci: workspace, 2 kendi hesap ve 12 rakip + her hesabın içerik planı.
 * Kurgu: "Verimli Lab" — yapay zekâ ile iş/verimlilik kısa video üreticisi; rakipler aynı nişte.
 *
 * Planlar (`AccountPlan`) içerik üretecine girdi olur: kaç içerik, hangi format, hangi yaş
 * aralığı, hangi viewsKind, beklenen izlenme oranı ve kaç "tutan" (outlier) içerik ekileceği.
 */
import { DEFAULT_ACCOUNT_TYPE } from "@/lib/domain/account-type";
import { DEFAULT_COMPLIANCE_REGION } from "@/lib/domain/compliance";
import type { Competitor, CompetitorSource, CompetitorStatus, OwnAccount } from "@/lib/domain/competitor";
import type { Workspace } from "@/lib/domain/run";
import type { Platform, ViewsKind } from "@/lib/platforms/types";
import { MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import type { Rng } from "@/lib/data/mock/prng";

/** İçerik üreten hesabın planı (kendi hesap ya da içerik toplanmış rakip). */
export interface AccountPlan {
  ownerKind: "own" | "competitor";
  id: string;
  platform: Platform;
  handle: string;
  displayName: string;
  /** Veri kaynağı: resmi API (tüm içgörüler) ya da herkese açık kazıma. */
  source: "api" | "scrape";
  followersNow: number;
  followersStart: number;
  counts: { short: number; carousel: number; image: number };
  /** Yayın yaşı aralığı (gün): [en yeni, en eski]. */
  ageRange: [number, number];
  /** Varsayılan viewsKind ve en eski kaç kısa videonun farklı (eski aktör) türde geldiği. */
  viewsKind: ViewsKind;
  legacy?: { kind: ViewsKind; oldestShorts: number };
  /** Olgun kısa video medyan izlenmesi / takipçi. */
  reachRatio: number;
  /** Ekilecek tutan içerik sayısı. */
  outliers: number;
  /** Son toplama/senkron (gün önce). */
  lastCollectedAge: number;
  /** Ağırlıklı konu anahtarları. */
  topicBias: string[];
}

interface CompetitorSeed {
  handle: string;
  displayName: string;
  followers?: number;
  status: CompetitorStatus;
  source: CompetitorSource;
  via?: string;
  addedAge: number;
  bio?: string;
  category?: string;
  verified?: boolean;
  missing?: string[];
  platform?: Platform;
  plan?: Omit<AccountPlan, "ownerKind" | "id" | "platform" | "handle" | "displayName" | "followersNow" | "followersStart" | "source">;
}

const PLAY: ViewsKind = "ig_play_count";
const VIEW: ViewsKind = "ig_view_count";

const COMPETITOR_SEEDS: CompetitorSeed[] = [
  {
    handle: "yapayzekaofis", displayName: "Yapay Zekâ Ofiste", followers: 186_000, status: "tracked", source: "manual",
    addedAge: 88, verified: true, category: "Eğitim", bio: "Ofiste yapay zekâ: her gün 1 araç, 1 komut. 🤖",
    plan: { counts: { short: 36, carousel: 6, image: 2 }, ageRange: [0.8, 89], viewsKind: PLAY, legacy: { kind: VIEW, oldestShorts: 6 },
      reachRatio: 0.28, outliers: 3, lastCollectedAge: 0.6, topicBias: ["ai_tools_compare", "email", "prompt_formula"] },
  },
  {
    handle: "promptustasi", displayName: "Prompt Ustası", followers: 42_500, status: "tracked", source: "manual",
    addedAge: 86, category: "Kişisel blog", bio: "Doğru soruyu soran kazanır. Prompt şablonları 👇",
    plan: { counts: { short: 32, carousel: 4, image: 0 }, ageRange: [0.5, 88], viewsKind: PLAY,
      reachRatio: 0.6, outliers: 3, lastCollectedAge: 0.4, topicBias: ["prompt_formula", "ai_tools_compare"] },
  },
  {
    handle: "excelhoca.ai", displayName: "Excel Hoca · AI", followers: 97_000, status: "tracked", source: "manual",
    addedAge: 84, category: "Eğitim", bio: "Excel + yapay zekâ = mesai bitti.",
    plan: { counts: { short: 28, carousel: 6, image: 0 }, ageRange: [1.5, 89], viewsKind: VIEW,
      reachRatio: 0.35, outliers: 2, lastCollectedAge: 1.2, topicBias: ["excel_formulas", "presentation"] },
  },
  {
    handle: "otomasyoncu", displayName: "Otomasyoncu", followers: 23_800, status: "tracked", source: "related", via: "promptustasi",
    addedAge: 70, missing: ["category"], bio: "Kodsuz otomasyonla haftada 5 saat kazan.",
    plan: { counts: { short: 30, carousel: 0, image: 2 }, ageRange: [0.4, 87], viewsKind: PLAY, legacy: { kind: VIEW, oldestShorts: 8 },
      reachRatio: 0.8, outliers: 3, lastCollectedAge: 0.3, topicBias: ["automation", "notion_system"] },
  },
  {
    handle: "verimlikafa", displayName: "Verimli Kafa", followers: 12_100, status: "tracked", source: "search", via: "yapay zeka verimlilik",
    addedAge: 60, category: "Kişisel blog", bio: "Odak, plan, yapay zekâ. Az iş değil, doğru iş.",
    plan: { counts: { short: 26, carousel: 4, image: 0 }, ageRange: [2.1, 89], viewsKind: PLAY,
      reachRatio: 1.1, outliers: 2, lastCollectedAge: 1.4, topicBias: ["daily_planning", "notion_system", "content_plan"] },
  },
  {
    handle: "girisimci.ai", displayName: "Girişimci AI", followers: 64_000, status: "tracked", source: "manual",
    addedAge: 82, category: "İşletme", bio: "Küçük işletmeler için yapay zekâ reçeteleri.",
    plan: { counts: { short: 25, carousel: 3, image: 2 }, ageRange: [1.1, 88], viewsKind: VIEW,
      reachRatio: 0.4, outliers: 2, lastCollectedAge: 0.9, topicBias: ["customer_support", "content_plan", "cv_job"] },
  },
  {
    handle: "notionlu.hayat", displayName: "Notion'lu Hayat", followers: 31_000, status: "ignored", source: "related", via: "otomasyoncu",
    addedAge: 89, category: "Kişisel blog", bio: "Notion şablonları ve sistemler.",
    plan: { counts: { short: 14, carousel: 2, image: 0 }, ageRange: [58, 89], viewsKind: PLAY,
      reachRatio: 0.5, outliers: 1, lastCollectedAge: 57, topicBias: ["notion_system", "daily_planning"] },
  },
  { handle: "dijitalasistan.tr", displayName: "Dijital Asistan", followers: 8_900, status: "private", source: "related", via: "yapayzekaofis", addedAge: 21 },
  { handle: "aiilekazan", displayName: "AI ile Kazan", status: "not_found", source: "manual", addedAge: 12, missing: ["followers", "following", "postsCount"] },
  { handle: "kodsuz.otomasyon", displayName: "Kodsuz Otomasyon", followers: 18_400, status: "candidate", source: "related", via: "otomasyoncu", addedAge: 5, missing: ["following", "postsCount"] },
  { handle: "sunummakinesi", displayName: "Sunum Makinesi", followers: 9_700, status: "candidate", source: "related", via: "yapayzekaofis", addedAge: 3, missing: ["following", "postsCount"] },
  { handle: "ofisteai", displayName: "Ofiste AI", followers: 54_000, status: "candidate", source: "search", via: "chatgpt ile iş", addedAge: 4, platform: "tiktok", missing: ["following"] },
];

export interface AccountsResult {
  workspace: Workspace;
  ownAccounts: OwnAccount[];
  competitors: Competitor[];
  plans: AccountPlan[];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function buildAccounts(rng: Rng, clock: MockClock): AccountsResult {
  const noisy = (base: number) => Math.round(base * (1 + rng.normal(0, 0.03)));
  const numericId = (digits: number) => String(rng.int(1, 9)) + Array.from({ length: digits - 1 }, () => rng.int(0, 9)).join("");

  const workspace: Workspace = {
    id: WS,
    name: "Verimli Lab",
    timezone: "Europe/Istanbul",
    audienceTimeZone: "Europe/Istanbul",
    nicheBrief:
      "Yapay zekâ araçlarıyla iş ve verimlilik: beyaz yaka çalışanlara ve küçük işletme sahiplerine ChatGPT/Claude komutları, kodsuz otomasyon, Excel ve planlama ipuçları. Kısa video ağırlıklı, hedef kitle 25-40 yaş.",
    apifyMonthlyCapUsd: 10,
    llmMonthlyCapUsd: 5,
    complianceRegion: DEFAULT_COMPLIANCE_REGION,
    accountType: DEFAULT_ACCOUNT_TYPE,
    createdAt: clock.daysAgo(140),
  };

  const igFollowers = noisy(14_800);
  const ttFollowers = noisy(6_300);
  const ownAccounts: OwnAccount[] = [
    {
      id: "oa_1", workspaceId: WS, platform: "instagram", handle: "verimlilab", displayName: "Verimli Lab",
      followers: igFollowers, connection: "connected",
      scopes: ["instagram_business_basic", "instagram_business_manage_insights", "instagram_business_content_publish"],
      tokenExpiresAt: clock.daysAhead(41), lastSyncedAt: clock.daysAgo(0.15), createdAt: clock.daysAgo(140),
    },
    {
      id: "oa_2", workspaceId: WS, platform: "tiktok", handle: "verimlilab", displayName: "Verimli Lab",
      followers: ttFollowers, connection: "scrape_only", scopes: [],
      lastSyncedAt: clock.daysAgo(0.4), createdAt: clock.daysAgo(75),
    },
  ];

  const plans: AccountPlan[] = [
    {
      ownerKind: "own", id: "oa_1", platform: "instagram", handle: "verimlilab", displayName: "Verimli Lab", source: "api",
      followersNow: igFollowers, followersStart: Math.round(igFollowers * 0.8),
      counts: { short: 38, carousel: 7, image: 3 }, ageRange: [1.2, 89], viewsKind: "ig_views",
      reachRatio: 0.55, outliers: 3, lastCollectedAge: 0.15, topicBias: ["email", "prompt_formula", "daily_planning"],
    },
    {
      ownerKind: "own", id: "oa_2", platform: "tiktok", handle: "verimlilab", displayName: "Verimli Lab", source: "scrape",
      followersNow: ttFollowers, followersStart: Math.round(ttFollowers * 0.65),
      counts: { short: 30, carousel: 0, image: 0 }, ageRange: [0.6, 88], viewsKind: "tt_play_count",
      reachRatio: 0.9, outliers: 2, lastCollectedAge: 0.4, topicBias: ["email", "ai_tools_compare"],
    },
  ];

  const competitors: Competitor[] = COMPETITOR_SEEDS.map((seed, i) => {
    const id = `cp_${pad2(i + 1)}`;
    const followers = seed.followers === undefined ? undefined : noisy(seed.followers);
    const missing = seed.missing ?? [];
    const collected = seed.status === "tracked" || seed.status === "ignored" || seed.status === "private";
    const competitor: Competitor = {
      id,
      workspaceId: WS,
      platform: seed.platform ?? "instagram",
      handle: seed.handle,
      externalId: seed.status === "not_found" ? undefined : numericId(11),
      displayName: seed.displayName,
      bio: seed.bio,
      followers,
      following: missing.includes("following") ? undefined : rng.int(120, 900),
      postsCount: missing.includes("postsCount") || followers === undefined ? undefined : rng.int(140, 820),
      isVerified: seed.status === "not_found" ? undefined : seed.verified ?? false,
      category: missing.includes("category") ? undefined : seed.category,
      status: seed.status,
      statusReason: seed.status === "private" ? "hesap gizli" : seed.status === "not_found" ? "hesap bulunamadı (silinmiş ya da kullanıcı adı yanlış)" : undefined,
      source: seed.source,
      discoveredVia: seed.via,
      missingFields: missing,
      contentCount: 0,
      addedAt: clock.daysAgo(seed.addedAge),
      lastCollectedAt: collected ? clock.daysAgo(seed.plan?.lastCollectedAge ?? rng.float(1, 4)) : undefined,
    };
    if (seed.plan && followers !== undefined) {
      plans.push({
        ...seed.plan,
        ownerKind: "competitor",
        id,
        platform: competitor.platform,
        handle: seed.handle,
        displayName: seed.displayName,
        source: "scrape",
        followersNow: followers,
        followersStart: Math.round(followers * rng.float(0.78, 0.95)),
      });
    }
    return competitor;
  });

  return { workspace, ownAccounts, competitors, plans };
}
