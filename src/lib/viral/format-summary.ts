/** `ViralHuntSummary` → CLI çıktısı. Gizli değer içermez: konular, sayılar, tutarlar. Ölçülemeyen gerçek tutar "mutabakat bekliyor" (0 değil). */
import "server-only";

import { formatDecimal, formatNumber } from "@/lib/format";
import type { ViralHuntSummary } from "@/lib/viral/run";

const usd = (amount: number | undefined): string => {
  const text = formatDecimal(amount, 4);
  return text === undefined ? "—" : `${text} USD`;
};

const OUTCOME_LABEL: Record<ViralHuntSummary["outcome"], string> = {
  dry_run: "kuru koşu (hiçbir koşu başlatılmadı, para harcanmadı)",
  no_topics: "konu yok",
  done: "tamamlandı",
  blocked: "ENGELLENDİ",
};

export function formatViralSummary(summary: ViralHuntSummary): string[] {
  const lines = [`Viral av: ${OUTCOME_LABEL[summary.outcome]}`];
  if (summary.reason) lines.push(`  ${summary.reason}`);
  if (summary.topics.length > 0) lines.push(`Konular (${summary.topics.length}): ${summary.topics.map((t) => `${t.query} [${t.source}]`).join(" · ")}`);
  for (const job of summary.plan.jobs) {
    lines.push(`  ${job.platform} · "${job.topic.query}": ${formatNumber(job.spec.expectedResults)} sonuç ≈ ${usd(job.estimatedUsd)}${job.priceUnknown ? " (fiyat okunamadı: yedek fiyat)" : ""}`);
  }
  for (const profile of summary.plan.profiles) {
    lines.push(`  ${profile.platform} · yazar profilleri: en çok ${formatNumber(profile.expectedProfiles)} hesap ≈ ${usd(profile.estimatedUsd)}${profile.priceUnknown ? " (fiyat okunamadı: yedek fiyat)" : ""}`);
  }
  if (summary.plan.jobs.length > 0) {
    lines.push(`Tahmini toplam: ${usd(summary.plan.estimatedUsd)} (haftalık tavan ${usd(summary.plan.capUsd)}${summary.plan.withinCap ? "" : " — AŞIYOR"})`);
  }
  if (summary.outcome === "done") {
    for (const report of summary.topicReports) {
      const found = report.found === undefined ? `yapılmadı (${report.skippedReason ?? "—"})` : `${formatNumber(report.found)} video`;
      lines.push(`  ${report.platform} · "${report.query}": ${found}, patlamış ${formatNumber(report.viral)}`);
    }
    lines.push(`Ön süzgeçten geçen: ${formatNumber(summary.prefiltered)} · takipçisi okunan yazar: ${formatNumber(summary.profilesRead)} · eşiği geçen: ${formatNumber(summary.selected)}`);
    if (summary.written) lines.push(`Havuz: ${formatNumber(summary.written.inserted)} yeni, ${formatNumber(summary.written.refreshed)} tazelendi`);
    if (summary.cost) lines.push(`Maliyet: ayrılan ${usd(summary.cost.reservedUsd)} · gerçek ${summary.cost.actualUsd === undefined ? "mutabakat bekliyor" : usd(summary.cost.actualUsd)}`);
  }
  for (const note of summary.notes) lines.push(`Not: ${note}`);
  return lines;
}
