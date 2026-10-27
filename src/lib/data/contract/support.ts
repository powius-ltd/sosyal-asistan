/**
 * Sözleşme süitinin ortak yardımcıları: bağlam (depo üreticisi + seed'li/yabancı workspace),
 * sabitler ve küçük doğrulayıcılar. Parçalar `src/lib/data/contract/*.ts`, birleştiren `repository.contract.ts`.
 */
import { expect, type TestContext } from "vitest";

import type { ContentItem } from "@/lib/domain/content";
import type { CreditEntry, CreditHold } from "@/lib/domain/credits";
import { JOB_QUEUE_DEFAULT, JOB_QUEUE_PATTERN } from "@/lib/domain/panel-job";
import type { CollectionRun } from "@/lib/domain/run";
import type { PublishStatus } from "@/lib/domain/publish";
import { MAX_PAGE_LIMIT, type ContentFilter, type PagedResult, type RunFilter } from "@/lib/data/queries";
import type { GrantCreditsInput, SettleCreditsInput } from "@/lib/data/credit-input";
import type { PanelRepository } from "@/lib/data/repository";
import { canCancel } from "@/lib/domain/publish";

/**
 * Sözleşme süitini koşturma seçenekleri.
 *
 * `wsId` ZORUNLUDUR: süit kayıt oluşturur/değiştirir (rakip, yayın işi, ayarlar). Testler kendi oluşturduğunu geri
 * alır (yayın işi iptal, rakip `ignored`, ayarlar özgün değere) ama bazı yan etkiler silinemez (ör. rakip eklemenin
 * Apify rezervesi). Bu yüzden süit YALNIZ cron'suz (worker/zamanlayıcı yayın işini ya da koşuyu ilerletmeyen), ayrı bir
 * TEST workspace'inde koşulur — gerçek müşteri workspace'inde ASLA. Örtük varsayılan yoktur; çağıran açıkça verir.
 */
export interface RepositoryContractOptions {
  /** Seed'li TEST workspace (cron'suz). Zorunlu. */
  wsId: string;
  /** Var olmayan workspace (UUID biçimli, Supabase'de de sorgulanabilir). */
  unknownWsId?: string;
  /**
   * Seed'in konu eleğinde NİŞ DIŞI işaretlediği içerik kimlikleri. Eleme sonucu depo üzerinden yazılamaz (yazan sunucu görevi),
   * bu yüzden kimlikleri seed bilir. İçgörü sözleşmesi (`insights-niche`) bunlarla niş dışı dışlamayı SAYIYLA sınar. Zorunlu:
   * seed en az bir pencere içi, izlenen-rakip sahipli niş dışı kısa video içermeli. Lazy: seed `beforeAll`'da kurulabilir.
   */
  offNicheContentIds: () => readonly string[] | Promise<readonly string[]>;
  /**
   * Otomatik eşleşme ÖNERİSİ üretimi sunucu işidir (toplama sonrası `afterCollect`): depo üzerinden yazılamaz. Sözleşme
   * `resolveIdeaLink` (onay/ret) kurallarını sınamak için seed'den öneri ister: `repo` testin kullandığı örnektir (mock bunu
   * kendi durumuna yazar; Supabase doğrudan `idea_content_links`'e service role ile), dönen değer YENİ `suggested` bağın kimliğidir
   * (`origin = auto_match`, skor 0..1, gerekçe dolu). Aynı (fikir, içerik) çifti için ikinci öneri istenmez.
   */
  suggestIdeaLink: (repo: PanelRepository, input: { ideaId: string; contentItemId: string }) => Promise<string>;
  /**
   * Panel işlerinin TEST kuyruğu (`panel_jobs.queue`): depo (`create()`) işleri BU kuyruğa yazacak biçimde kurulmuş olmalı. Canlı işçi yalnız
   * `JOB_QUEUE_DEFAULT` (`panel`) kuyruğunu alır; süit canlı kuyruğa iş yazmayı reddeder (açık bir işçi test işini alıp gerçek çağrı yapmasın).
   * Aynı anda koşan iki test süreci birbirinin işini almasın diye koşuya özgü bir ad verilir.
   */
  jobQueue: string;
  /**
   * İŞÇİ ROLÜ: işi almak / bitirmek işçinin işidir, depo üzerinden yapılamaz. Sözleşme çalışan işte iptal ve tek etkin iş kurallarını
   * sınamak için ister. `claim` test kuyruğunun en eski sıradaki işini `running` yapar ve kimliğini döndürür (kuyrukta çalışan iş varken ya
   * da iş yokken undefined); `finish` çalışan işi bitirir (`succeeded`). Mock kendi durumuna, Supabase `claim_panel_job` + çitli yazımla.
   */
  jobWorker: {
    claim(repo: PanelRepository): Promise<string | undefined>;
    finish(repo: PanelRepository, jobId: string): Promise<void>;
  };
  /**
   * KREDİ: kredi vermek (ödeme / yönetici) ve kesinleştirmek (işçi) sunucu işidir, depo üzerinden yapılamaz. Sözleşme ver → ayır →
   * kesinleştir → bakiye akışını sınamak için ister. Girdi `credit-input.ts` şemalarıdır (`GrantCreditsInput`, `SettleCreditsInput`).
   * Depo (`create()`) TEST kullanıcısının hesabıyla kurulmuş olmalı: gerçek hesabın bakiyesine yazılmaz. Mock kendi durumuna, Supabase
   * `lib/credits/ledger.ts` ile (aynı test kullanıcısı).
   */
  creditOps: {
    grant(repo: PanelRepository, input: GrantCreditsInput): Promise<CreditEntry>;
    settle(repo: PanelRepository, input: SettleCreditsInput): Promise<CreditHold>;
  };
  /**
   * KREDİ ZORLAMASI AÇIK depo (aynı test çalışma alanı, aynı test kuyruğu, aynı test kullanıcısının hesabı): `create()` zorlama KAPALI
   * (varsayılan) depoyu verir; iş ↔ kredi sözleşmesi iki modu da sınar (`contract/job-credits.ts`).
   */
  createEnforced: () => PanelRepository;
  /**
   * BAŞLANGIÇ AKIŞI: TAZE çalışma alanı (yalnız kendi hesap; içerik, rakip, plan ve iş YOK) ve ona yazan depo (aynı test kuyruğu). Kurulu
   * (seed'li) çalışma alanı akışa girmez (`done` + `legacy`); akışın tamamı burada sınanır (`contract/onboarding.ts`). Her çağrı aynı
   * çalışma alanını verebilir (akış testi tektir). Mock taze sayılan örnek hesabı, Supabase `create_workspace` ile açtığı boş alanı verir
   * (süit sonunda siler).
   */
  freshWorkspace: () => Promise<{ repo: PanelRepository; wsId: string }>;
  /**
   * Henüz uygulanmamış (SAPLAMA) özellikler: listedeki özelliğin testleri, depo `not_implemented` verirse ATLANIR (atlanan test
   * görünür). Liste dışındaki özellikte `not_implemented` HATADIR. Mock hiçbir özelliği listelemez; Supabase uygulayan paket
   * (A: `idea_links`, `week_review`; B: `anatomy`; M2: `creative_matrix`; P2: `topic_hook_matrix`; W: `jobs`) kendi girdisini listeden SİLER —
   * böylece "bitti" testle kanıtlanır.
   */
  pending?: readonly ContractFeature[];
}

/** Sözleşmenin ayrı uygulanabilen özellik grupları (`RepositoryContractOptions.pending`). */
export type ContractFeature = "idea_links" | "week_review" | "anatomy" | "creative_matrix" | "topic_hook_matrix" | "jobs";

/** Her sözleşme parçasının aldığı bağlam. */
export interface ContractContext {
  /** Seed'li workspace. */
  wsId: string;
  /** Var olmayan workspace. */
  foreign: string;
  create: () => PanelRepository;
  /** Kredi zorlaması AÇIK depo. */
  createEnforced: () => PanelRepository;
  freshWorkspace: RepositoryContractOptions["freshWorkspace"];
  suggestIdeaLink: RepositoryContractOptions["suggestIdeaLink"];
  /** Panel işlerinin test kuyruğu (canlı `panel` kuyruğu DEĞİL). */
  jobQueue: string;
  jobWorker: RepositoryContractOptions["jobWorker"];
  creditOps: RepositoryContractOptions["creditOps"];
  /**
   * Özellik `pending` listesindeyse ve depo `probe`'ta `not_implemented` verirse testi ATLAR (`t.skip`); aksi halde hata aynen
   * yayılır. Testin ilk satırında çağrılır.
   */
  skipIfPending(t: TestContext, feature: ContractFeature, probe: () => Promise<unknown>): Promise<void>;
  /** Seed'in niş dışı işaretlediği içerik kimlikleri (`RepositoryContractOptions.offNicheContentIds`). */
  offNicheIds(): Promise<Set<string>>;
  /** Filtreye uyan TÜM içerik (cursor ile sayfa sayfa; `limit` sayfa boyutu). */
  allContent(r: PanelRepository, filter?: ContentFilter, limit?: number): Promise<ContentItem[]>;
  /** Filtreye uyan TÜM koşu (cursor ile sayfa sayfa; bir ayın koşuları tek sayfaya sığar varsayılmaz). */
  allRuns(r: PanelRepository, filter?: RunFilter, limit?: number): Promise<CollectionRun[]>;
}

export function createContractContext(create: () => PanelRepository, options: RepositoryContractOptions): ContractContext {
  if (!options.wsId) throw new Error("runRepositoryContract: wsId zorunlu (yalnız cron'suz, ayrı test workspace'inde koşulur)");
  if (!JOB_QUEUE_PATTERN.test(options.jobQueue ?? "") || options.jobQueue === JOB_QUEUE_DEFAULT) {
    throw new Error("runRepositoryContract: jobQueue zorunlu ve canlı kuyruk (panel) olamaz (açık bir işçi test işini alır)");
  }
  const wsId = options.wsId;
  const foreign = options.unknownWsId ?? "00000000-0000-4000-8000-000000000000";
  const allContent = (r: PanelRepository, filter: ContentFilter = {}, limit = MAX_PAGE_LIMIT) =>
    allPages((cursor) => r.listContent(wsId, { ...filter, limit, cursor }));
  const allRuns = (r: PanelRepository, filter: RunFilter = {}, limit = MAX_PAGE_LIMIT) =>
    allPages((cursor) => r.listRuns(wsId, { ...filter, limit, cursor }));
  const offNicheIds = async () => new Set(await options.offNicheContentIds());
  const pending = new Set(options.pending ?? []);
  const skipIfPending: ContractContext["skipIfPending"] = async (t, feature, probe) => {
    try {
      await probe();
    } catch (error) {
      const notImplemented = typeof error === "object" && error !== null && (error as { code?: unknown }).code === "not_implemented";
      if (notImplemented && pending.has(feature)) t.skip(`${feature}: Supabase deposunda henüz uygulanmadı (pending)`);
      throw error;
    }
  };
  return {
    wsId,
    foreign,
    create,
    createEnforced: options.createEnforced,
    freshWorkspace: options.freshWorkspace,
    suggestIdeaLink: options.suggestIdeaLink,
    jobQueue: options.jobQueue,
    jobWorker: options.jobWorker,
    creditOps: options.creditOps,
    skipIfPending,
    offNicheIds,
    allContent,
    allRuns,
  };
}

/**
 * İmleçli bir listenin TÜM sayfaları. İmleç ilerlemiyor ya da sayfa üst sınırı aşılıyorsa SESSİZCE kırpmaz, açıkça
 * başarısız olur: yalnız ilk sayfaya bakıp geçen sahte yeşil testler olmaz.
 */
export async function allPages<T>(fetchPage: (cursor: string | undefined) => Promise<PagedResult<T>>, maxPages = 500): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const res = await fetchPage(cursor);
    out.push(...res.items);
    cursor = res.nextCursor;
    if (!cursor) return out;
  }
  throw new Error(`Sayfalama ${maxPages} sayfada bitmedi (imleç ilerlemiyor mu?)`);
}

export const MISSING_ID = "00000000-0000-4000-8000-00000000abcd";
export const METRIC_KEYS = ["views", "likes", "comments", "shares", "saves", "reach", "avgWatchSec"];
export const APPROVED_OR_LATER: PublishStatus[] = ["approved", "container_pending", "ready", "publishing", "published"];
export const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_KEY = /^\d{4}-\d{2}$/;

/** Testin oluşturduğu yayın işlerini geri alır: hâlâ iptal edilebilir olanlar (`canCancel`) iptal edilir. */
export async function cancelJobs(r: PanelRepository, wsId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const jobs = await r.listPublishJobs(wsId, { limit: MAX_PAGE_LIMIT });
  for (const job of jobs) {
    if (ids.includes(job.id) && canCancel(job.status, job.containerId)) await r.cancelPublishJob(wsId, job.id);
  }
}

/** Temizlik doğrulaması: testin oluşturduğu işlerin hepsi iptal edilmiş olmalı (geride etkin iş kalmaz). */
export async function expectJobsCancelled(r: PanelRepository, wsId: string, ids: string[]): Promise<void> {
  const jobs = await r.listPublishJobs(wsId, { limit: MAX_PAGE_LIMIT });
  const left = jobs.filter((j) => ids.includes(j.id) && j.status !== "cancelled").map((j) => `${j.id}:${j.status}`);
  expect(left, "test kendi yayın işlerini geri almadı").toEqual([]);
}

/** Testin eklediği rakipleri geri alır: `ignored` (rakip silme API'si yok; yoksayılan hesap hiçbir listede/tutanda çıkmaz). */
export async function ignoreCompetitors(r: PanelRepository, wsId: string, ids: string[]): Promise<void> {
  for (const id of ids) await r.setCompetitorStatus(wsId, id, "ignored");
}

export async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: "RepositoryError", code });
}

/** Tanımlı değerler azalan sırada, ölçülemeyenler (undefined) sonda. */
export function expectDescending(values: (number | undefined)[], label: string) {
  const firstUndefined = values.findIndex((v) => v === undefined);
  if (firstUndefined >= 0) expect(values.slice(firstUndefined).every((v) => v === undefined), label).toBe(true);
  const defined = values.filter((v): v is number => v !== undefined);
  expect(defined, label).toEqual([...defined].sort((a, b) => b - a));
}

export const ms = (iso?: string) => (iso ? new Date(iso).getTime() : undefined);
export const idsOf = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

export function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b), mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
