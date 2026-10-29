/**
 * Fiş (çekim siparişi) ekranının SABİT metinleri: üretim türü ve durum etiketleri tek yerde (ekran, düğme ve testler buradan okur).
 * Panel jargonu yok (`lib/plain-language.ts` `PANEL_JARGON`).
 */
import type { ORDER_KINDS, OrderStatus } from "@/lib/studio-order/schema";

export const ORDER_KIND_LABEL: Record<(typeof ORDER_KINDS)[number], string> = {
  broll: "B-roll",
  animasyon: "Animasyon",
  karisik: "Karışık",
  anlatim: "Anlatım",
  ugc: "UGC",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  taslak: "Taslak",
  uretiliyor: "Üretiliyor",
  uretildi: "Üretildi",
  hata: "Hata",
  paylasildi: "Paylaşıldı",
};

export const TICKET_COPY = {
  title: "Çekim fişi",
  back: "Fikirlere dön",
  print: "Yazdır",
  kind: "Üretim türü",
  kindMissing: "Belirlenmedi",
  column: "Sütun",
  wantedAt: "İstenen saat",
  duration: "Süre",
  durationReason: "Bu fiş için süre belirlenmedi.",
  opening: "Açılış",
  script: "Metin",
  outline: "Ana hat",
  topic: "Konu",
  cta: "Yorum anahtar kelimesi",
  sample: "Örnek video",
  note: "Not",
  status: "Durum",
  changeHint: "Asistan'a “UGC olsun” ya da “nota şunu ekle” diyerek fişi değiştirebilirsin (yalnız taslak fişte).",
  why: {
    title: "Neden bu fikir",
    reason: "Gerekçe",
    direction: "Plandaki yönü",
    directionImpact: "Bu yönün tuttuğu",
    directionNone: "Bu fikir plandaki bir yöne bağlı değil.",
    impactReason: "Bu yön için ölçüm yok.",
    ideaGone: "Bu fiş için fikir artık bulunamıyor; dayanak gösterilemiyor.",
  },
  button: { prepare: "Fiş hazırla", open: "Fişi aç", preparing: "Hazırlanıyor…" },
  notFound: "Fiş bulunamadı",
  notFoundHint: "Silinmiş ya da başka bir hesaba ait olabilir.",
} as const;

/** "Üretime gönder" düğmesi ve onay penceresi (SPN-33). Düğme yalnız yönetici modunda çizilir (işler kapıdan geçer); tutar orada gösterilir. */
export const PRODUCE_COPY = {
  button: "Üretime gönder",
  dialogTitle: "Videoyu şimdi üret",
  dialogLead: "Bu fiş stüdyoya gider ve video şimdi üretilir; birkaç dakika sürebilir.",
  scope: "Video üretilir ama paylaşılmaz: paylaşmadan önce yine senin onayını isteriz. Paylaşım saati fişteki istenen saattir.",
  spend: "Üretim ses için ücretli bir hizmet kullanır.",
  amountLabel: "En çok harcanacak tutar (USD)",
  approve: "Onayla ve üret",
  cancel: "Vazgeç",
  closedSpend: "Harcama bilgisini okuyamadım; üretim şu an başlatılamıyor.",
  retryHint: "Önceki deneme yarıda kaldı; yeniden gönderebilirsin.",
} as const;
