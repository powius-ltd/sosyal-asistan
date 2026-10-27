import { PenLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/** Hesap sahibinin kendi (sohbetten kaydettirdiği) fikrinin rozeti: kaynağı `Idea.source === "manual"`. */
export function OwnIdeaBadge() {
  return (
    <Badge variant="secondary" className="gap-1" data-source="manual">
      <PenLine aria-hidden />
      Senin fikrin
    </Badge>
  );
}
