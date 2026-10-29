/**
 * `/isler` başlatma panelinin metinleri (saf). Düğme adları sözlükten gelir (`JOB_KIND_PLAIN`); buradaki cümleler yalnız YÖNETİCİ
 * ekranında, işin ne yaptığını bir satırda anlatır. Sağlayıcı adı, komut ve panel jargonu yazılmaz.
 */
import type { JobKind } from "@/lib/domain/panel-job";

/** Tek tek başlatılabilen işler, haftalık turdaki sıralarıyla; ölçüm sonda. */
export const SINGLE_JOB_KINDS = ["collect", "analyze", "label", "plan", "briefing", "measure"] as const satisfies readonly JobKind[];
export type SingleJobKind = (typeof SINGLE_JOB_KINDS)[number];

export const JOB_KIND_ABOUT: Record<JobKind, string> = {
  routine: "Sırayla hazırlık, video inceleme, plan, sonuç kontrolü ve notlar. Yeni veri toplamak para harcar: onaylamazsan o adım atlanır, gerisi yapılır.",
  collect: "Hesabının ve izlediğin hesapların son videolarını getirir. Para harcar: önce ne kadar tutacağını gösteririm.",
  analyze: "Yeni gelen videoları tek tek izleyip ne anlattığını çıkarır.",
  label: "Videoların neye dokunduğunu ve kime seslendiğini işaretler.",
  plan: "Gelecek haftanın planını ve çekilecek fikirleri hazırlar.",
  briefing: "Bugün bilmen gerekenleri yeniden yazar.",
  measure: "Paylaştığın videoların sonuçlarını getirir. Para harcar: önce ne kadar tutacağını gösteririm.",
  onboarding: "Yeni eklenen hesaba ilk bakış ve ilk inceleme. Buradan değil, başlangıç akışından başlar.",
  measure_zernio: "Paylaştığın videoların sonuçlarını bağlı hesaptan okur. Para harcamaz.",
  order_return: "Stüdyodan dönen videoyu yayın onayına hazırlar. Para harcamaz; yayın onayını sen verirsin.",
  publish: "Onayladığın videoyu planlanan saatte yayına zamanlar. Para harcamaz; yalnız onayladığın videoya dokunur.",
  order: "Plan öğesinden stüdyo için sipariş fişi yazar. Para harcamaz; fiş onayını sen verirsin.",
  ads_sync: "Reklam hesabındaki harcama ve sonuçları okur. Para harcamaz; reklam hesabına yazmaz.",
  produce: "Fişteki videoyu stüdyoda üretir. Para harcar (ses): önce ne kadar tutabileceğini gösteririm. Paylaşmadan önce yine onayını isterim.",
  discover: "Benzer hesapları arar ve aday olarak ekler. Para harcar: önce ne kadar tutacağını gösteririm.",
};

/** `collect` işinde hesap başına video sayısı seçenekleri; boş değer = varsayılan (işin kendi ayarı). */
export const COLLECT_LIMIT_CHOICES = [5, 10, 20, 30, 50] as const;
