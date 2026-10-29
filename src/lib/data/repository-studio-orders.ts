/**
 * `PanelRepository`'nin FİŞ (stüdyo siparişi) bölümü (paket 28 G1): `repository.ts` 400 satır sınırında olduğu için ayrı dosyadadır;
 * `PanelRepository` bu arayüzü genişletir (sözleşme tektir). Fiş uygulama içinde kalıcıdır (`studio_orders`); dosyaya yazma yoktur.
 * Her metot `wsId` alır; zaman `now` ile verilir. Bu dosya yalnız sıralı ajanlar tarafından değiştirilir.
 */
import type { AdvanceStudioOrderInput, CreateStudioOrderInput, StudioOrderQuery, UpdateStudioOrderInput } from "@/lib/data/studio-order-input";
import type { StudioOrder } from "@/lib/domain/studio-order";

export interface StudioOrdersRepository {
  /**
   * Fikir için fiş yazar (`taslak`, onaysız). Girdi `createStudioOrderSchema` ile doğrulanır (`invalid_input`); fikir bu çalışma alanında
   * yoksa `not_found`; aynı fikrin ETKİN (`hata` dışı) fişi varsa `already_exists`. Bilinmeyen çalışma alanı → `not_found`.
   */
  createStudioOrder(wsId: string, input: CreateStudioOrderInput, now: Date): Promise<StudioOrder>;
  /** Tek fiş; bu çalışma alanında yoksa `undefined` (hata değil: ekran "fiş yok" der). */
  getStudioOrder(wsId: string, id: string): Promise<StudioOrder | undefined>;
  /** Fişler (en yeni önce). `ideaIds` verilirse yalnız o fikirlerin (boş liste → boş sonuç), `weekStart` verilirse yalnız o haftanın fişleri. */
  listStudioOrders(wsId: string, query?: StudioOrderQuery): Promise<StudioOrder[]>;
  /**
   * YALNIZ `taslak` fişte üretim türünü (`ticket.tur`) ve/veya serbest notu değiştirir; başka durumda `invalid_state`; fiş yoksa `not_found`;
   * hiçbir alan verilmezse ya da tür bilinmiyorsa `invalid_input`. Güncel fişi döner.
   */
  updateStudioOrder(wsId: string, id: string, patch: UpdateStudioOrderInput, now: Date): Promise<StudioOrder>;
  /**
   * SPN-33: fişin durumunu ilerletir (`uretiliyor` = üretime gönderildi + onaylı, `uretildi` + video, `hata` + not). Geçersiz girdi
   * `invalid_input`, fiş yoksa `not_found`, uygun olmayan geçiş (örn. `hata` / `paylasildi` fiş) `invalid_state`. Aynı duruma tekrar yazmak
   * değişiklik yapmaz (güncel fişi döner). Çağıran yalnız sunucu işidir (gönderme ve dönüş); ekrandan doğrudan çağrılmaz.
   */
  advanceStudioOrder(wsId: string, id: string, patch: AdvanceStudioOrderInput, now: Date): Promise<StudioOrder>;
}
