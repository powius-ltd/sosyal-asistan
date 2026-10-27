/**
 * Mock üreteci: panel işi geçmişi. Rastgelelik YOK (tohumdan bağımsız, yalnız saate göre): diğer üreteçlerin akışı kaymaz. Her bitiş
 * durumundan bir örnek vardır (iş ekranı her dalı gösterebilsin): biten haftalık tur, önizleme (tahminli), tutarı aşıp DURAN toplama,
 * kısmi tur, yarıda kalan (işçisi kaybolan) inceleme, durdurulan plan. ETKİN İŞ YOKTUR: sözleşme süiti ve ekran yeni iş açabilir.
 * Adım notları yönetici notudur (sağlayıcı adı geçebilir); müşteriye görünen cümle koddan kurulur (`lib/plain-language.ts`).
 */
import type { JobStep, PanelJob } from "@/lib/domain/panel-job";
import { JOB_QUEUE_DEFAULT } from "@/lib/domain/panel-job";
import type { MockClock } from "@/lib/data/mock/mock-clock";
import { MOCK_USER_ID, MOCK_WORKSPACE_ID as WS } from "@/lib/workspace/current";

export const MOCK_WORKER_ID = "mock-worker";
const MINUTE_MS = 60_000;

/** `agoDays` gün önce istenmiş, `waitMin` dk sonra alınmış, `runMin` dk sürmüş bir işin zamanları. */
function times(clock: MockClock, agoDays: number, runMin: number, waitMin = 0.1) {
  const created = new Date(clock.daysAgo(agoDays)).getTime();
  const started = created + waitMin * MINUTE_MS;
  const finished = started + runMin * MINUTE_MS;
  const iso = (ms: number) => new Date(ms).toISOString();
  return { createdAt: iso(created), startedAt: iso(started), heartbeatAt: iso(finished), finishedAt: iso(finished) };
}

const base = { workspaceId: WS, queue: JOB_QUEUE_DEFAULT, dryRun: false, params: {}, requestedBy: MOCK_USER_ID, workerId: MOCK_WORKER_ID };

const routineSteps = (analyze: JobStep): JobStep[] => [
  { id: "precheck", status: "ok", note: "Ortam ve bağlantı tamam; 2 eski koşu kapatıldı.", seconds: 3.2 },
  { id: "collect", status: "needs_approval", note: "Apify parası harcar; onay yok. Son toplama oturumu ≈ 0,11 USD (referans).", seconds: 0, spend: { estimateUsd: 0.11 } },
  analyze,
  { id: "label", status: "ok", note: "12 video seçildi: 11 etiket (10 kanıtı doğrulandı), 1 belirsiz, 0 başarısız.", seconds: 96.4 },
  { id: "cluster", status: "skipped", code: "skipped_account_type", note: "Hesap türü konu × hook matrisi kullanmıyor.", seconds: 0 },
  { id: "plan", status: "ok", note: "Plan kaydedildi: 6 fikir, 4 plana girdi.", seconds: 212.8 },
  { id: "measure_check", status: "ok", note: "2 Reels'in ölçümü geldi (ücretsiz kontrol, bildirim yazıldı).", seconds: 1.1 },
  { id: "briefing", status: "ok", note: "5 madde (41 sn).", seconds: 41 },
];

export function buildJobs(clock: MockClock): PanelJob[] {
  const reportDay = clock.daysAgo(6).slice(0, 10);
  // Onay iş açılırken yazılır: onay anı = istek anı.
  const blocked = times(clock, 1, 0.1);
  return [
    {
      ...base,
      id: "job_01",
      kind: "routine",
      status: "succeeded",
      steps: routineSteps({ id: "analyze", status: "ok", note: "19 video seçildi: ok 17 · yetersiz veri 2 · başarısız 0 · agy çağrısı 19.", seconds: 498.6 }),
      result: { exitCode: 0, reportPath: `docs/rutin/ornek/${reportDay}.md` },
      logTail: "— analyze: run\n[19/19] video analizi tamam\n  → ok: 19 video seçildi\n— briefing: run\n  → ok: 5 madde (41 sn).",
      ...times(clock, 6, 14.2),
    },
    {
      ...base,
      id: "job_02",
      kind: "collect",
      dryRun: true,
      params: { limit: 10 },
      status: "succeeded",
      steps: [{ id: "collect", status: "ok", note: "Kuru koşu: koşu başlatılmadı. 5 hesap, tahmini toplam 0,13 USD.", seconds: 4.8, spend: { estimateUsd: 0.13 } }],
      result: {
        exitCode: 0,
        estimate: {
          usd: 0.13,
          lines: [
            { label: "Kendi hesap: içerik (10)", usd: 0.052 },
            { label: "İzlenen rakipler: içerik (4 × 10)", usd: 0.065 },
            { label: "Profil koşuları (5)", usd: 0.013 },
          ],
          units: { accounts: 5 },
        },
      },
      ...times(clock, 1.02, 0.1),
    },
    {
      ...base,
      id: "job_03",
      kind: "collect",
      params: { limit: 10 },
      status: "blocked",
      approval: { basis: "one_time", maxUsd: 0.1, approvedBy: MOCK_USER_ID, approvedAt: blocked.createdAt },
      steps: [
        { id: "collect", status: "needs_approval", code: "over_approved_amount", note: "Tahmini toplam 0,13 USD, onaylı tavan 0,10 USD değerini aşıyor: HİÇBİR koşu başlamadı.", seconds: 5.1, spend: { estimateUsd: 0.13 } },
      ],
      result: { outcome: "over_approved_amount", estimate: { usd: 0.13, lines: [] } },
      ...blocked,
    },
    {
      ...base,
      id: "job_04",
      kind: "routine",
      status: "partial",
      steps: routineSteps({ id: "analyze", status: "failed", code: "backend_unavailable", note: "Video analizi arka ucu (agy) kullanılamıyor: kota doldu.", seconds: 12.4 }),
      result: { outcome: "step_failed", exitCode: 4, reportPath: `docs/rutin/ornek/${clock.daysAgo(13).slice(0, 10)}.md` },
      ...times(clock, 13, 6.3),
    },
    {
      ...base,
      id: "job_05",
      kind: "analyze",
      status: "failed",
      steps: [{ id: "analyze", status: "running" }],
      currentStep: "analyze",
      progress: { done: 7, total: 19 },
      result: { outcome: "worker_lost" },
      error: "worker_lost: işçi yanıt vermedi (son nabız kesildi)",
      ...times(clock, 20, 9),
    },
    {
      ...base,
      id: "job_06",
      kind: "plan",
      status: "cancelled",
      steps: [],
      workerId: undefined,
      createdAt: clock.daysAgo(21),
      cancelRequestedAt: clock.daysAgo(20.99),
      finishedAt: clock.daysAgo(20.99),
    },
  ];
}
