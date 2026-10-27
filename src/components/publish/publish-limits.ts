/**
 * 24 saatlik yayın kotası sabiti. Açıklama sınırları ve sayımı (`CAPTION_MAX`, `HASHTAG_MAX`, `countCaptionChars`,
 * `countHashtags`) `lib/domain/publish.ts`'tedir; reklam ibaresi / YZ beyanı denetimi `lib/compliance`'tadır:
 * form, sunucu şeması ve depo aynı kuralı kullanır.
 */

/**
 * Meta: hesap başına 24 saatlik hareketli pencerede 100 API yayını (Instagram Login).
 * Faz 3'te `PublisherAdapter.getQuota` gerçek değeri API'den okur; o zamana dek sabit.
 */
export const PUBLISH_LIMIT_24H = 100;
