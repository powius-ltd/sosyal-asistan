/**
 * Gövde türü karışımını (`AnatomyBodyMixRow[]`: her tür için var/yok × lift) tek `GroupedLift` tablosuna düzleştirir: satır anahtarı
 * `<tür>:<with|without>`, böylece mevcut `LiftGroupTable` (kendi ↔ rakip, n, medyan lift, tutan, güven) yeniden kullanılır.
 */
import { sectionTypeLabel } from "@/components/video/taxonomy-labels";
import { bodyMixPlain } from "@/lib/anatomy/plain";
import type { AnatomyBodyMixRow } from "@/lib/domain/anatomy";
import type { GroupedLift } from "@/lib/domain/insights";

export function bodyMixGroups(rows: readonly AnatomyBodyMixRow[]): { groups: GroupedLift; order: string[] } {
  const flatten = (side: "own" | "competitors") =>
    rows.flatMap((row) => row.presence[side].map((stat) => ({ ...stat, key: `${row.type}:${stat.key}` })));
  return {
    groups: { own: flatten("own"), competitors: flatten("competitors") },
    order: rows.flatMap((row) => [`${row.type}:with`, `${row.type}:without`]),
  };
}

/** "insight:with" → "Fikir / içgörü var". */
export function bodyMixLabel(key: string): string {
  const [type, presence] = key.split(":");
  return bodyMixPlain(sectionTypeLabel(type), presence);
}
