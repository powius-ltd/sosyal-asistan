import { EvidenceChip } from "@/components/common/why-disclosure";
import type { BriefingEvidenceRef } from "@/lib/domain/briefing";
import { briefingRefHref, parseBriefingRef, type ParsedBriefingRef } from "@/lib/domain/briefing-refs";
import { checkpointPhrase } from "@/lib/plain-language";

interface ResolvedRef {
  ref: string;
  kind: ParsedBriefingRef["kind"];
  /** Video sayfasına giden ref'lerin (içerik, ölçümü gelen Reels) içerik kimliği. */
  contentId?: string;
  href: string;
  /** Düz dil etiketi: "1. video", "3. gün sonucu", "yaklaşım + izleyici"; aynı etiketten birden fazlaysa sıra no ("2. video"). */
  label: string;
}

/** Ref türünün kısa düz dil etiketi (bağlantı metni; cümle içinde okunur). Ölçüm ref'i hangi günün sonucu olduğunu söyler. */
function baseLabel(parsed: ParsedBriefingRef): string {
  switch (parsed.kind) {
    case "content":
      return "video";
    case "due":
      return checkpointPhrase(parsed.day);
    case "cell":
      return "yaklaşım + izleyici";
    case "topic":
      return "konu + açılış";
    case "plan":
      return "haftalık plan";
    case "idea":
      return "fikir";
  }
}

/**
 * Kanıt ref'lerini bağlantıya çözer; çözülemeyen (bozuk/bilinmeyen) ref atlanır, kart çökmez. Aynı etiketten birden fazlası
 * "1. video", "2. video" diye numaralanır (sıra no önde: "Video 1" değil).
 */
export function resolveEvidence(evidence: readonly string[]): ResolvedRef[] {
  const resolved: { ref: string; parsed: ParsedBriefingRef; href: string; base: string }[] = [];
  for (const ref of evidence) {
    const parsed = parseBriefingRef(ref);
    const href = briefingRefHref(ref);
    if (parsed === undefined || href === undefined) continue;
    resolved.push({ ref, parsed, href, base: baseLabel(parsed) });
  }
  const totals = new Map<string, number>();
  for (const r of resolved) totals.set(r.base, (totals.get(r.base) ?? 0) + 1);
  const seen = new Map<string, number>();
  return resolved.map(({ ref, parsed, href, base }) => {
    const index = (seen.get(base) ?? 0) + 1;
    seen.set(base, index);
    const contentId = parsed.kind === "content" || parsed.kind === "due" ? parsed.contentId : undefined;
    const duplicated = (totals.get(base) ?? 0) > 1;
    // Aynı günün sonucundan birden fazlası "7. gün sonucu (1. video)"; diğerleri "1. video" gibi sıra no önde.
    const label = !duplicated ? base : parsed.kind === "due" ? `${base} (${index}. video)` : `${index}. ${base}`;
    return { ref, kind: parsed.kind, contentId, href, label };
  });
}

/**
 * Maddenin kanıt bağlantıları: video → `/video/[id]`, yaklaşım/konu tablosu, plan, fikir → ilgili sayfa. Her biri ortak kanıt
 * çipidir (`EvidenceChip`: ≥ 44 px dokunma alanı); aralarında 8 px boşluk vardır.
 */
export function EvidenceLinks({ evidence }: { evidence: readonly BriefingEvidenceRef[] }) {
  const links = resolveEvidence(evidence);
  if (links.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-2" aria-label="Kanıt">
      {links.map((link) => (
        <li key={link.ref} className="min-w-0">
          <EvidenceChip href={link.href}>{link.label}</EvidenceChip>
        </li>
      ))}
    </ul>
  );
}
