/**
 * Hook türü × lift grupları (`Insights.hookTypes`) ve "kanıtı doğrulanmış hook türü" kuralı — TEK yer: karşılaştırma içgörüsü
 * (`views/insights.ts`) ve plan taslağı (`lib/insights/pool.ts`) aynı haritayı kullanır, böylece iki ekran aynı videoyu aynı hook
 * türüyle gruplar.
 *  - Hook türü YALNIZ `status = ok` VE `evidenceVerified` analizden gelir (kanıtı doğrulanmamış etiketten grup çıkmaz).
 *  - Analizi olmayan içerik gruba girmez: "analiz yok" bir hook türü değildir.
 *  - Lift özeti `groupedLift` → `groupStat` → `summarizeLiftSamples` (`lib/metrics/hook-lift.ts`): olgun + ölçülmüş lift, güven
 *    örnek sayısından ve baz çizgisi tavanıyla.
 */
import type { ContentItem } from "@/lib/domain/content";
import { HOOK_TYPES, type HookType } from "@/lib/domain/hook-types";
import type { GroupedLift, UnmeasuredInsight } from "@/lib/domain/insights";
import { groupedLift } from "@/lib/data/views/insights-groups";
import type { AnalysisRef } from "@/lib/insights/types";

/** İçerik kimliği → doğrulanmış analizdeki hook türü (analizi/doğrulaması/hook türü olmayan içerik haritada yoktur). */
export function verifiedHookTypeById(analyses: readonly AnalysisRef[] | undefined): Map<string, HookType> {
  const byId = new Map<string, HookType>();
  for (const a of analyses ?? []) if (a.status === "ok" && a.evidenceVerified && a.hookType) byId.set(a.contentItemId, a.hookType);
  return byId;
}

/** Sıra: taksonomideki sıra, ardından taksonomide olmayan (başka sürümden gelen) türler alfabetik; hiçbir tür sessizce düşmez. */
function hookTypeOrder(byId: ReadonlyMap<string, HookType>): HookType[] {
  const known = new Set(HOOK_TYPES);
  const extra = [...new Set(byId.values())].filter((type) => !known.has(type)).sort();
  return [...HOOK_TYPES, ...extra];
}

/** Kendi/rakip videolarının hook türü grupları (çağıran niş dışı içeriği önceden süzer). */
export function hookTypeGroups(own: readonly ContentItem[], rivals: readonly ContentItem[], byId: ReadonlyMap<string, HookType>): GroupedLift<HookType> {
  return groupedLift<HookType>(own, rivals, (c) => byId.get(c.id), hookTypeOrder(byId));
}

export interface HookTypesScope {
  /** Analiz verisi verildi mi (`InsightsInput.analyses`). */
  analysesProvided: boolean;
  hasOwnScope: boolean;
  hasTrackedRivals: boolean;
}

/** Hook türü tablosu boş kalan taraf için sebep (yoksa undefined). Boş tablo yerine açıklama gösterilir. */
export function hookTypesUnmeasured(groups: GroupedLift<HookType>, scope: HookTypesScope): UnmeasuredInsight | undefined {
  const section = "hook_types" as const;
  if (!scope.analysesProvided) return { section, reason: "Video analizi verisi verilmedi; hook türü ölçülemedi." };
  if (groups.own.length === 0 && groups.competitors.length === 0) {
    return { section, reason: "Analiz edilmiş (kanıtı doğrulanmış) video yok; hook türü ölçülemedi." };
  }
  if (scope.hasOwnScope && groups.own.length === 0) return { section, reason: "Kendi videoların henüz analiz edilmedi; hook türü kendi tarafta ölçülemedi." };
  if (scope.hasTrackedRivals && groups.competitors.length === 0) {
    return { section, reason: "İzlenen rakiplerin videoları henüz analiz edilmedi; hook türü rakip tarafta ölçülemedi." };
  }
  return undefined;
}
