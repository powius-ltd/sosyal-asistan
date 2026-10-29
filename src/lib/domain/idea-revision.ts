/**
 * Fikir revizyon kaydı (SPN-35): kullanıcı sohbette "şunu değiştir" deyince fikrin hook / taslak / senaryosu yeniden yazılır; ESKİ hâl
 * `IdeaDetails.revisions` içinde saklanır (en yeni başta, en çok `IDEA_REVISIONS_MAX`). Kayıt, değişikliğin isteğini ve eski içeriği taşır.
 */
export const IDEA_REVISIONS_MAX = 5;

export interface IdeaRevision {
  /** Değişikliğin yapıldığı an (ISO). */
  at: string;
  /** Kullanıcının isteği (kendi sözleriyle, kısaltılmış). */
  request: string;
  /** Değişiklikten ÖNCEKİ içerik. */
  hooks: string[];
  hookTypes?: string[];
  scriptOutline: string[];
  script?: string;
}
