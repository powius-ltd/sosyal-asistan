/**
 * Adım özetlerini rutin sonucuna (`StepOutput`) çeviren SAF eşlemeler: mevcut `runX` özetleri → `ok / skipped / failed / needs_approval`.
 * Kural: tasarım gereği atlama (iş yok, ses profili yetersiz, mevcut plan korundu) ve onay kapıları (Apify parası) HATA DEĞİLDİR;
 * `failed` yalnız gerçek başarısızlıktır (çıkış kodu 4). Gerçek tutar bilinmiyorsa `actualUsd` yoktur (0 değil).
 */
import type { CollectSummary } from "@/lib/collection/types";
import { formatNumber, formatUsd } from "@/lib/format";
import type { AnalyzeSummary } from "@/lib/intel/analyze-run";
import type { LabelSummary } from "@/lib/intel/label-run";
import type { PlanRunResult } from "@/lib/intel/plan-run";
import type { StepOutput } from "@/lib/orchestrator/types";

const n = (value: number) => formatNumber(value) ?? "0";
const usd = (value: number | undefined) => formatUsd(value) ?? "—";

export function collectOutput(summary: CollectSummary): StepOutput {
  const estimateUsd = summary.plan?.estimatedUsd;
  if (summary.outcome === "no_targets") return { status: "skipped", reason: "Toplanacak hesap yok." };
  if (summary.outcome === "dry_run") return { status: "skipped", reason: "Kuru koşu: koşu başlatılmadı." };
  if (summary.outcome === "blocked") {
    return {
      status: "needs_approval",
      reason: `Tahmini toplam ${usd(estimateUsd)}, onaylı tavan ${usd(summary.plan?.maxUsd)} değerini aşıyor: HİÇBİR koşu başlamadı. Daha yüksek tutar onayıyla yeniden dene.`,
      notes: summary.notes,
      spend: { estimateUsd },
    };
  }
  const failures = [
    ...summary.targets.flatMap((t) => (t.content?.error !== undefined ? [`@${t.handle}: ${t.content.error}`] : t.profile?.state === "error" ? [`@${t.handle}: profil hatası`] : [])),
    ...(summary.scoring?.failures ?? []).map((f) => `skor ${f.owner}: ${f.message}`),
  ];
  const ingested = summary.targets.reduce((sum, t) => sum + (t.content?.ingested ?? 0), 0);
  const money = `rezerve ${usd(summary.cost.reservedUsd)}, gerçek ${summary.cost.actualUsd === undefined ? "mutabakat bekliyor" : usd(summary.cost.actualUsd)}`;
  return {
    status: failures.length > 0 ? "failed" : "ok",
    reason: `${n(summary.runs.length)} Apify koşusu, ${n(ingested)} içerik yazıldı (${money})${failures.length > 0 ? `; ${n(failures.length)} hata` : ""}.`,
    notes: [...summary.notes, ...failures],
    spend: { estimateUsd, actualUsd: summary.cost.actualUsd },
  };
}

export function analyzeOutput(summary: AnalyzeSummary): StepOutput {
  if (summary.outcome === "nothing_to_do") return { status: "skipped", reason: "Analiz edilecek video kalmadı." };
  if (summary.outcome === "dry_run") return { status: "skipped", reason: "Kuru koşu: analiz başlatılmadı." };
  if (summary.outcome === "needs_recollect") {
    return {
      status: "needs_approval",
      reason: `Seçilen ${n(summary.selected)} videonun adresi yok ya da süresi dolmuş (${n(summary.expired)} dolmuş, ${n(summary.missing)} yok): yeniden toplama gerekli (Apify parası).`,
      notes: ["Önce onaylı tutarla yeniden toplama (haftalık tur ya da tek toplama; kullanıcı onayı); sonra analiz."],
    };
  }
  if (summary.outcome === "unsupported_platform") {
    return { status: "skipped", reason: `Bu platformda video incelemesi henüz yok (${n(summary.selected)} video seçildi, hiçbiri indirilmedi); sonraki adımlar sayılar ve açıklama metniyle sürer.` };
  }
  if (summary.outcome === "backend_unavailable") {
    return { status: "failed", reason: "Video analizi arka ucu (agy) kullanılamıyor: kurulum/oturum/kota; 3–4. adımlar eldeki veriyle sürer." };
  }
  const notes = [
    ...(summary.skippedByCap > 0 ? [`${n(summary.skippedByCap)} video çağrı tavanı ya da kota yüzünden başlatılmadı (sonraki koşuda yeniden denenir).`] : []),
    ...(summary.expired + summary.missing > 0 ? [`${n(summary.expired)} adresi dolmuş, ${n(summary.missing)} adresi yok video model çağrılmadan failed yazıldı.`] : []),
  ];
  const allFailed = summary.failed > 0 && summary.ok + summary.insufficient === 0;
  return {
    status: allFailed ? "failed" : "ok",
    reason: `${n(summary.selected)} video seçildi: ok ${n(summary.ok)} · yetersiz veri ${n(summary.insufficient)} · başarısız ${n(summary.failed)} · agy çağrısı ${n(summary.agyCalls)}.`,
    notes,
  };
}

/** `tripped`: etiketleme günlüğünde kalıcı Claude CLI hatası görüldü (`llm-failure.ts`). */
export function labelOutput(summary: LabelSummary, tripped: boolean): StepOutput {
  if (summary.outcome === "skipped_account_type") return { status: "skipped", reason: summary.skipReason ?? "Hesap türü açı etiketlemesi uygulamıyor." };
  if (summary.outcome === "nothing_to_do") return { status: "skipped", reason: "Etiketlenecek video yok." };
  if (summary.outcome === "dry_run") return { status: "skipped", reason: "Kuru koşu: etiketleme başlatılmadı." };
  const base = `${n(summary.selected)} video seçildi: ${n(summary.labeled)} etiket (${n(summary.verified)} kanıtı doğrulandı), ${n(summary.unsure)} belirsiz, ${n(summary.failed)} başarısız.`;
  return {
    status: summary.failed > 0 ? "failed" : "ok",
    reason: tripped ? `${base} Claude CLI kalıcı hata verdi: kalan LLM adımları atlanır.` : base,
    ...(tripped ? { llmUnavailable: true } : {}),
  };
}

export function planOutput(result: PlanRunResult, markdownPath?: string): StepOutput {
  const notes = [...result.notes, ...(markdownPath === undefined ? [] : [`Markdown: ${markdownPath}`])];
  if (result.outcome === "voice_unusable") {
    return { status: "skipped", reason: "Ses profili yetersiz: plan üretilmedi (hata değil).", notes, planNote: `${result.weekStart} planı üretilemedi: ses profili yetersiz.` };
  }
  if (result.outcome === "kept_existing") {
    return { status: "skipped", reason: "Fikir üretimi yetersiz: mevcut plan korundu (hata değil).", notes, planNote: `${result.weekStart} için fikir üretimi yetersiz kaldı; mevcut plan korundu.` };
  }
  if (result.outcome === "dry_run") return { status: "skipped", reason: "Kuru koşu: plan yazılmadı." };
  const summary = `hafta ${result.weekStart} · ${result.status ?? "—"} · güven ${result.confidence} · ${n(result.ideas)} fikir, ${n(result.planned)} plana girdi`;
  return { status: "ok", reason: `Plan kaydedildi: ${summary}.`, notes, planNote: `Plan kaydedildi (${summary}).` };
}
