import type { StudioOrder } from "@/lib/domain/studio-order";

const OPENING_LINE = /^(?:Seçili|Önerilen) açılış:\s*(.+)$/u;

/**
 * Fişin açılış cümlesi: konu modunda ana hattın ilk satırı, senaryo modunda nottaki "Seçili / Önerilen açılış" satırı (kurucu ikisine de yazar).
 * Yoksa `undefined` (ekranda satır çizilmez). `outline` / `note`: açılış satırı çıkarılmış hâli (aynı cümle iki kez görünmesin).
 */
export function ticketOpening(order: Pick<StudioOrder, "ticket" | "note">): { opening?: string; outline: string[]; note: string } {
  let opening: string | undefined;
  const outline: string[] = [];
  for (const line of order.ticket.ana_hat ?? []) {
    const match = OPENING_LINE.exec(line.trim());
    if (match && opening === undefined) opening = match[1];
    else outline.push(line);
  }
  const noteLines: string[] = [];
  for (const line of order.note.split("\n")) {
    const match = OPENING_LINE.exec(line.trim());
    if (match) opening ??= match[1];
    else noteLines.push(line);
  }
  return { opening, outline, note: noteLines.join("\n").trim() };
}
