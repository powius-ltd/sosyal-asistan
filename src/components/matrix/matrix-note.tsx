import { Info } from "lucide-react";
import type { ReactNode } from "react";

/** Haritada bulunamayan kutu / konu için tek cümlelik bilgi (adres eski ya da hatalı). Ekran okuyucuya durum olarak okunur. */
export function MatrixNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
