/**
 * `CollectSummary` → CLI çıktısı (satırlar). Gizli değer içermez: yalnız hesap adları, sayılar, tutarlar ve
 * Türkçe sebep metinleri yazılır. Ölçülemeyen gerçek tutar "mutabakat bekliyor" (0 değil).
 */
import "server-only";

import type { AfterCollectSummary } from "@/lib/collection/after-collect";
import type { CollectSummary, RunReport, TargetReport } from "@/lib/collection/types";
import { formatDecimal, formatNumber } from "@/lib/format";

const OUTCOME_LABEL: Record<CollectSummary["outcome"], string> = {
  completed: "tamamlandı",
  dry_run: "kuru koşu (hiçbir koşu başlatılmadı, para harcanmadı)",
  blocked: "ENGELLENDİ (tahmin tavanı aşıyor, hiçbir koşu başlatılmadı)",
  no_targets: "toplanacak hesap yok",
};

/** Küçük tutarlar (birkaç sent) için 4 basamak: `formatUsd` 1 sentin üstünde 2 basamağa yuvarlar. */
const usd = (amount: number | undefined) => {
  const text = formatDecimal(amount, 4);
  return text === undefined ? "—" : `${text} USD`;
};
const count = (n: number) => formatNumber(n) ?? "0";

function targetLines(target: TargetReport): string[] {
  const kind = target.kind === "own" ? "kendi" : "rakip";
  const lines = [`  @${target.handle} (${kind})`];
  const profile = target.profile;
  if (profile) {
    const followers = profile.followers === undefined ? "takipçi bilinmiyor" : `${count(profile.followers)} takipçi`;
    const reason = profile.reason ? ` — ${profile.reason}` : "";
    lines.push(`    profil: ${profile.state}, ${followers}${reason}`);
  }
  if (target.statusChanged) lines.push(`    rakip durumu → ${target.statusChanged}`);
  const content = target.content;
  if (content) {
    if (content.skippedReason) lines.push(`    içerik: ${content.skippedReason}`);
    else if (content.error) lines.push(`    içerik: HATA — ${content.error}`);
    else {
      const parts = [
        `${count(content.parsed)} öğe`,
        `${count(content.ingested)} içerik yazıldı`,
        `${count(content.snapshots)} ölçüm`,
        `${count(content.notItems)} elenen satır`,
      ];
      if (content.skipped > 0) parts.push(`${count(content.skipped)} atlanan`);
      lines.push(`    içerik: ${parts.join(", ")}`);
      if (content.accessError) lines.push(`    içerik erişim hatası: ${content.accessError}`);
    }
  }
  return lines;
}

function runLine(run: RunReport): string {
  const actual = run.actualUsd === undefined ? "mutabakat bekliyor" : `gerçek ${usd(run.actualUsd)}`;
  const items = run.itemCount === undefined ? "" : `, ${count(run.itemCount)} öğe`;
  return `  ${run.label} [${run.kind}, ${run.status}]: rezerve ${usd(run.reservedUsd)}, ${actual}${items}`;
}

function afterCollectLines(after: AfterCollectSummary): string[] {
  const lines = [
    `Döngü: ${count(after.resolved)} bekleyen bağ çözüldü, ${count(after.suggested)} eşleşme önerisi yazıldı, ` +
      `${count(after.dueCount)} Reels'in ölçümü açık (${count(after.dueNotifications)} yeni bildirim)`,
  ];
  for (const note of after.notes) lines.push(`  döngü notu: ${note}`);
  return lines;
}

export function formatCollectSummary(summary: CollectSummary): string[] {
  const lines = [`Sonuç: ${OUTCOME_LABEL[summary.outcome]}`];

  if (summary.plan) {
    const { plan } = summary;
    const unknown = plan.priceUnknown ? " (en az bir aktörün fiyatı okunamadı; muhafazakâr varsayım)" : "";
    lines.push(`Plan: ${count(plan.jobs.length)} koşu, tahmini toplam ${usd(plan.estimatedUsd)} / tavan ${usd(plan.maxUsd)}${unknown}`);
    for (const job of plan.jobs) lines.push(`  ${job.label} [${job.spec.actorId}, ${count(job.spec.expectedResults)} sonuç]: ${usd(job.estimatedUsd)}`);
  }

  if (summary.outcome === "completed") {
    lines.push("Hesaplar:");
    for (const target of summary.targets) lines.push(...targetLines(target));
    if (summary.runs.length > 0) {
      lines.push("Koşular:");
      lines.push(...summary.runs.map(runLine));
    }
    if (summary.scoring) {
      const failed = summary.scoring.failures.length;
      lines.push(
        `Skor: ${count(summary.scoring.items)} içerik skorlandı (${count(summary.scoring.owners)} hesap${failed > 0 ? `, ${count(failed)} hesapta hata` : ""})`,
      );
      for (const failure of summary.scoring.failures) lines.push(`  skor hatası: ${failure.message}`);
    }
    const actual = summary.cost.actualUsd === undefined ? "mutabakat bekliyor" : usd(summary.cost.actualUsd);
    const pending = summary.cost.pendingReconcile > 0 ? ` (${count(summary.cost.pendingReconcile)} koşunun gerçek tutarı henüz kesinleşmedi)` : "";
    lines.push(`Maliyet: rezerve ${usd(summary.cost.reservedUsd)}, gerçek ${actual}${pending}`);
  }

  if (summary.afterCollect) lines.push(...afterCollectLines(summary.afterCollect));
  for (const note of summary.notes) lines.push(`Not: ${note}`);
  return lines;
}
