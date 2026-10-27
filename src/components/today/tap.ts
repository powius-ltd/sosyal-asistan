/**
 * Bugün'de dokunma hedefleri: dar ekranda ≥ 48 px (`min-h-tap`), `md`+ 44 px. Ortak "Neden?" katmanı ve kanıt çipleri (`components/common`)
 * 44 px'tir; Bugün onları yalnız burada, üst öğenin sınıfıyla büyütür (ortak bileşene dokunmadan). Ortak bileşen dar ekranda 48'e çıkınca
 * bu iki sabit gereksiz kalır.
 */

/** `WhyDisclosure`'ın `className`'ine: açılır başlık satırı (`<summary>`). */
export const TAP_WHY = "[&>summary]:min-h-tap md:[&>summary]:min-h-11";

/** `EvidenceLinks`'i saran kabın `className`'ine: kanıt çiplerinin bağlantıları (kısa etiketli çip 44 px genişte kalmasın). */
export const TAP_CHIPS = "[&_a]:min-h-tap [&_a]:min-w-tap md:[&_a]:min-h-11 md:[&_a]:min-w-11";

/** Bağlantısını başka bileşenin çizdiği bölümü (ör. hafta şeridinin "Planı aç"ı) saran kabın `className`'ine. */
export const TAP_INNER_LINKS = "[&_a]:min-h-tap md:[&_a]:min-h-11";

/** Satır içi bağlantı ya da bağlantı-düğme: dar ekranda 48 px. */
export const TAP_LINK = "min-h-tap md:min-h-11";
