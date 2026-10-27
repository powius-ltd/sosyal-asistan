import { cn } from "@/lib/utils";

/** Karakter sayısı (kod noktası bazlı: emoji ve birleşik harf tek sayılır; sunucu şemasıyla aynı ölçü). */
export function charCount(text: string): number {
  return Array.from(text).length;
}

/** Sınırı aşıyor mu? Boşluklar kırpıldıktan sonra sayılır (sunucu `trim()` ile doğrular). */
export function isOverLimit(text: string, max: number): boolean {
  return charCount(text.trim()) > max;
}

interface LimitCounterProps {
  /** Alanın `aria-describedby` ile bağlandığı kimlik. */
  id: string;
  value: string;
  max: number;
  /** Aşım mesajının öznesi: "Ad", "Açıklama". */
  label: string;
}

/**
 * Alan altı sayaç ("23 / 60"). Alan `maxLength` ile sessizce kesmez (120 karakterlik yapıştırma 60'a kırpılıp hata vermiyordu; D3-22):
 * sınır aşılınca sayaç kırmızıya döner, mesaj yazılır ve gönderme kapanır; kullanıcı neyin gittiğini görür.
 */
export function LimitCounter({ id, value, max, label }: LimitCounterProps) {
  const length = charCount(value.trim());
  const over = length > max;
  return (
    <p id={id} className={cn("flex justify-between gap-2 text-xs", over ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
      <span>{over ? `${label} en fazla ${max} karakter olabilir; ${length - max} karakter fazla.` : ""}</span>
      <span className="tabular">
        {length} / {max}
      </span>
    </p>
  );
}
