/**
 * Bilinen sonuç kodları (adımda `code`, işte `result.outcome`). İşçi betik özetlerini bu kodlara çevirir; ekran cümleyi KODDAN kurar
 * (`JOB_OUTCOME_PLAIN`), ham nottan değil. Düz başarıda kod yoktur.
 */
export const JOB_OUTCOME_CODES = [
  "nothing_to_do", // yapılacak yeni iş yoktu (seçilebilir video yok)
  "no_targets", // bakılacak / ölçülecek hesap yok
  "no_reels", // ölçümü gelen video yok
  "skipped_account_type", // hesap türü bu adımı uygulamıyor
  "kept_existing", // plan: fikir üretimi yetersiz, mevcut plan korundu
  "voice_unusable", // plan: ses profili yetersiz, plan üretilmedi
  "needs_recollect", // inceleme: video adresi yok / süresi dolmuş, yeniden toplama gerekli
  "over_approved_amount", // tahmin onaylı tutarı aşıyor: hiçbir koşu başlamadı
  "budget_refused", // aylık tavan onaysız, kalan hak yetmiyor ya da aylık tavan aşılırdı
  "approval_missing", // satırda geçerli onay kaydı yok (kayıt yok, dayanak bu türde geçersiz, tutar geçersiz): harcanmadı
  "approval_expired", // onay `JOB_APPROVAL_TTL_MS`'ten eski: harcanmadı
  "insufficient_credits", // iş için ayrılmış kredi yok ya da ilk adıma yetmiyor: hiçbir şey yapılmadı
  "credits_exhausted", // ayrılan kredi yarıda bitti: yapılan kaldı, kalan adım / video başlatılmadı
  "backend_unavailable", // video inceleme arka ucu kullanılamıyor
  "analysis_unsupported", // inceleme: bu platformda video incelemesi yok (adım atlandı; hat sayılar + açıklama ile sürer)
  "llm_unavailable", // yazı arka ucu (Claude CLI) kullanılamıyor
  "precheck_failed", // önkontrol başarısız
  "step_failed", // en az bir adım başarısız (kısmi)
  "timeout", // süre tavanı aşıldı
  "worker_lost", // işçi yanıt vermedi (DB yazar: yetim iş kapatma)
  "error", // beklenmeyen hata
  "account_private", // başlangıç: hesap gizli, herkese açık veri alınamıyor (akış durur)
  "account_not_found", // başlangıç: bu kullanıcı adıyla hesap yok (akış durur)
  "no_videos", // başlangıç: hesapta incelenecek video yok (akış durur)
  "few_videos", // başlangıç: `ONBOARDING_LOW_DATA_VIDEOS`'tan az video; devam edilir, sonuçlar düşük güvenli
  "plan_not_ready", // başlangıç: videolar incelendi ama plan çıkmadı (daha çok veri gerek)
  "no_plan", // sipariş: bu hafta için plan yok ya da yazılacak öğe çıkmadı (fiş yazılmadı)
  "zernio_key_missing", // Zernio ölçümü: bu hesap için API anahtarı yok (hiçbir çağrı yapılmadı)
  "order_not_sendable", // üretime gönder: fiş taslak değil ya da stüdyonun yapamadığı türde / modda (hiçbir şey yazılmadı)
  "voice_key_missing", // üretime gönder: bu hesabın ses anahtarı yok (stüdyo çağrılmadı)
  "studio_unavailable", // üretime gönder: stüdyo klasörü / komutu bulunamadı (fiş dosyası geri alındı)
  "studio_busy", // üretime gönder: stüdyo başka bir videoyu üretiyor (fiş dosyası geri alındı, fiş hata)
  "studio_failed", // üretime gönder: stüdyo videoyu üretemedi (nedeni fişte)
  "not_implemented", // bu iş türünün koşucusu henüz yok: hiçbir şey yapılmadı
] as const;
export type JobOutcomeCode = (typeof JOB_OUTCOME_CODES)[number];
