"use client";

import { LayoutGrid, Table2 } from "lucide-react";

import { OUTLIER_PARAM, type OutlierView } from "@/components/outliers/search-params";
import { useUrlParams } from "@/components/common/use-url-params";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Kart / tablo görünümü (dar ekranda gizli: tablo orada kart olarak gösterilir). Seçim URL'de (`gorunum`) tutulur; kart varsayılan olduğu için parametre silinir. */
export function OutlierViewToggle({ view }: { view: OutlierView }) {
  const { update } = useUrlParams();

  return (
    <ToggleGroup
      variant="outline"
      spacing={0}
      value={[view]}
      onValueChange={(next) => {
        const chosen = next[0];
        // Seçili düğmeye yeniden basmak boş dizi döner: mevcut görünümde kal.
        if (chosen === "cards" || chosen === "table") {
          update({ [OUTLIER_PARAM.view]: chosen === "cards" ? undefined : chosen, cursor: undefined });
        }
      }}
      aria-label="Görünüm"
      className="max-md:hidden"
    >
      <ToggleGroupItem value="cards" aria-label="Kart görünümü">
        <LayoutGrid aria-hidden />
        Kart
      </ToggleGroupItem>
      <ToggleGroupItem value="table" aria-label="Tablo görünümü">
        <Table2 aria-hidden />
        Tablo
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
