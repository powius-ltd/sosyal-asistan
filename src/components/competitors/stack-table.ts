/**
 * Dar ekranda tablo satırı → kart (D3-04): tek DOM, yalnız `max-md:` sınıflarıyla. 375 px'te tablo yatay kayıp asıl veriyi /
 * eylemi (İzle, Yoksay, yeniden adlandır) gizliyordu; satır artık kendi kartıdır, hücreler `data-label` etiketiyle iki sütunlu
 * ızgarada alt alta durur, eylem kartın altında tam genişliktedir. `md`+ ekranda sınıflar etkisizdir (tablo aynen kalır).
 */

/** `Table` kabına: tablo, gövde ve satırlar blok olur, başlık satırı gizlenir (etiketler hücrede). */
export const STACK_TABLE = "max-md:block max-md:[&_thead]:hidden max-md:[&_tbody]:block";

/** `TableRow`'a: kart çerçevesi + iki sütunlu ızgara. */
export const STACK_ROW =
  "max-md:mb-3 max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-2.5 max-md:rounded-xl max-md:border max-md:bg-card max-md:p-3 max-md:last:mb-0";

/** `TableCell`'e: blok, dolgusuz, sarılır; `data-label` varsa etiket hücrenin üstünde küçük yazılır. */
export const STACK_CELL = "max-md:block max-md:min-w-0 max-md:p-0 max-md:whitespace-normal max-md:text-left";

/** `data-label`'lı hücrenin etiketi (yalnız dar ekranda görünür). */
export const STACK_LABEL =
  "max-md:before:mb-0.5 max-md:before:block max-md:before:text-xs max-md:before:font-normal max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]";

/** Kartta tam genişlik tutan hücre (hesap adı, eylemler). */
export const STACK_FULL = "max-md:col-span-2";
