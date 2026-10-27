# TikTok Apify fixture'ları

**Gerçek koşu çıktısı DEĞİLDİR.** `clockworks/tiktok-scraper` aktörünün herkese açık veri kümesi şemasından ve README örneklerinden
(Apify API `acts/clockworks~tiktok-scraper/builds/default`, yapı 0.0.616, 2026-10-13) elle kuruldu; hesap, ad, kimlik ve adresler uydurmadır
(gerçek kişi verisi yok). Testler (`src/lib/platforms/tiktok/*.test.ts`) bunları parse eder.

| Dosya | İçerik |
|---|---|
| `videos.json` | Bir hesabın 4 satırı: düz video · sabitlenmiş + sponsorlu · slayt (fotoğraf) gönderisi · uzun video (kaydetme alanı yok, paylaşım `null`, etiket yalnız açıklamada) |
| `errors.json` | Hata satırı biçimi: `PROFILE_PRIVATE`, `NOT_FOUND`, `PROFILE_EMPTY` (`{ url, input, error, errorCode }`) |

İlk gerçek (onaylı) koşudan sonra bu dosyalar temizlenmiş gerçek çıktıyla değiştirilmeli; temizlik kuralları Instagram fixture'larıyla aynıdır
(yorum / anılan / üçüncü kişi alanları silinir, imzalı CDN adresleri kısaltılır, sır yok).
