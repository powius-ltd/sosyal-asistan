/**
 * İş düğmelerinin ortak tipleri (saf: sunucu sarmalayıcı ve istemci yaprakları aynı şekli kullanır). Sunucu doldurur
 * (`jobs-state.ts`), istemci yalnız okur; hiçbiri tarayıcıdan gelen veriye güvenmez (asıl denetim action ve depodadır).
 */
import type { RequestJobInput } from "@/lib/data/queries";
import type { CostView } from "@/lib/cost";
import type { JobSpendCaps } from "@/lib/domain/panel-job";
import type { JobsStatusResponse } from "@/lib/domain/panel-job-view";

/** Birleşimin her kolundan alanı ayrı ayrı çıkarır (düz `Omit` ayrımlı birleşimi tek nesneye ezerdi). */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * Düğmenin başlatacağı iş: tür + türe özel alanlar (`limit`, `week`, `dryRun`). ONAY BURADAN VERİLMEZ: para harcayan işte onay
 * penceresi açılır, tutarı yönetici orada girer.
 */
export type JobRequest = OmitEach<RequestJobInput, "approval">;

/** Sunucunun çizdiği andaki iş durumu; istemci deposunu bununla tohumlar. `scope` çalışma alanıdır (değişince durum sıfırlanır). */
export interface JobsSeed {
  scope: string;
  status: JobsStatusResponse;
}

/** Onay penceresinin gösterdiği harcama bilgisi (yalnız yönetici modunda okunur). */
export interface JobSpendContext {
  /** Çalışma alanının tavanları: hangi onay biçimi kullanılabilir (`availableApprovalBases`). */
  caps: JobSpendCaps;
  /** Bu ayın harcaması / aylık sınır (`lib/cost` görünümü: harcanan bilinmiyorsa undefined, 0 değil). */
  month: CostView;
}

/** `RunJobButton`'ın sunucudan aldığı bağlam. `JobAction` kendisi doldurur; elle kurmak gerekirse `loadJobRunContext()`. */
export interface JobRunContext {
  seed: JobsSeed;
  /** Okunamadıysa yok: para harcayan iş başlatılamaz (düğme kapalı çizilir, nedeni yazılır). */
  spend?: JobSpendContext;
}
