import { Badge } from "@/components/ui/badge";
import { HOOK_SOURCE_LABEL, type HookSource } from "@/lib/domain/intel";

/**
 * Hook'un kaynağı rozeti: konuşma / ekran yazısı / açıklama. Hook kütüphanesi ve video analizi aynı rozeti kullanır.
 * Bilinmeyen kaynak (eski analiz) için çağıran taraf karar verir: listede rozet çizilmez, video analizinde tire + sebep.
 */
export function HookSourceBadge({ source }: { source: HookSource }) {
  return (
    <Badge variant="outline" data-hook-source={source}>
      {HOOK_SOURCE_LABEL[source]}
    </Badge>
  );
}
