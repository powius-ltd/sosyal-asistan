# Instagram Apify fixture'ları

Gerçek Apify çıktıları, **temizlenmiş**. Testler (`src/lib/platforms/instagram/*.test.ts`) bunları parse eder.
Elle düzenleme: alan yapısı gerçek çıktıdır, bozma. Yenilemek istersen aynı temizlik kurallarını uygula.

| Dosya | Kaynak | Not |
|---|---|---|
| `reel.json` | `apify/instagram-reel-scraper`, @ornekhesap, `resultsLimit: 10`, `includeTranscript: false` (2026-09-30) | 10 reel |
| `profile.json` | `apify/instagram-profile-scraper`, @ornekhesap (2026-09-30) | `latestPosts` 3, `latestIgtvVideos` 1 öğeye kısaltıldı |
| `search.json` | `apify/instagram-search-scraper`, `search: "life coach women"`, `searchType: "user"`, `searchLimit: 10` (2026-09-30) | üçüncü kişi hesapları: kullanıcı adı/ad/kimlik **takma adla** değiştirildi, biyografi/bağlantı/görsel/Facebook sayfası silindi; sayılar gerçek |
| `posts.legacy.json` | eski `apify/instagram-scraper` (gönderi) çıktısı, `rakip analiz` ham örneği (2026-09-01) | gizli beğeni (-1), sabitlenmiş gönderiler, oynatma + görüntüleme sayısı birlikte; ortak yazar hesabı takma adlı |
| `access-not-found.json` | aynı ham örnekten gerçek hata satırı biçimi | kullanıcı adı takma adlı |

## Temizlik kuralları

- Her derinlikte silinen alanlar: `latestComments`, `firstComment`, `taggedUsers`, `coauthorProducers`, `mentions`, `sponsors`, `ownerId`, `ownerFullName`, `owner`, `alt`, `externalUrlShimmed`, `lynx_url`, `fbid`.
- Açıklamalardaki `@hesap` anmaları `@kullanici` ile değiştirildi.
- CDN görsel/video adresleri (süreli imzalı) sorgu dizesi atılıp 90 karaktere kısaltıldı: `videoUrl` gerçek bir indirme adresi DEĞİLDİR.
- Apify anahtarı ya da başka sır fixture'da yoktur (`boundary.test.ts` denetler).

## Gözlemler (S2 için)

- Reel aktörü: `videoPlayCount` dolu, `videoViewCount` her zaman `null`; `isPinned` her satırda boolean (`false` dahil); `productType: "clips"`.
- Eski gönderi aktörü: video satırlarında iki sayı birlikte gelir (`videoPlayCount` ≫ `videoViewCount`); `likesCount: -1` = gizli beğeni; `isPinned` yalnız `true` iken var.
- Profil aktörü: `relatedProfiles` boş dizi (@ornekhesap); `businessCategoryName` `null`, `isBusinessAccount: false`.
- Arama aktörü (`searchType: "user"`): profil biçiminde satır; `relatedProfiles` yalnız bir kısmında var; `businessCategoryName` bazen `"None"` metni.
