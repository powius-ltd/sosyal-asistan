/**
 * Tarayıcı bildirimi ve sekme başlığı işareti (istemci yardımcıları; iş bitişini sekme arka plandayken duyurmak için).
 *
 * Servis çalışanı / push sunucusu YOK: bildirim yalnız sekme AÇIKKEN gelir (iş durumu yoklaması sürdüğü sürece). İzin kendiliğinden
 * istenmez; kullanıcı "Bitince haber ver"e basınca `enableBrowserNotice` ister. `window` / `Notification` her yerde korumalıdır (sunucu
 * çizimi, bildirimi desteklemeyen tarayıcı, depolama kapalı): hiçbiri sayfayı bozmaz, durum `unsupported` olur.
 */

const OPT_IN_KEY = "sp-finish-notify";

/** unsupported: tarayıcı desteklemiyor · off: açık değil (izin istenebilir) · on: izin verildi ve kullanıcı istedi · denied: izin reddedildi. */
export type BrowserNoticeState = "unsupported" | "off" | "on" | "denied";

const listeners = new Set<() => void>();

/** Durum değişince (`enable` / `disable`) çağrılır; `useSyncExternalStore` aboneliği. */
export function subscribeBrowserNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function supported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function optedIn(): boolean {
  try {
    return window.localStorage.getItem(OPT_IN_KEY) === "1";
  } catch {
    return false;
  }
}

function setOptIn(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(OPT_IN_KEY, "1");
    else window.localStorage.removeItem(OPT_IN_KEY);
  } catch {
    // Depolama kapalı: kullanıcı tercihi bu sekme oturumunda hatırlanmaz; izin yine tarayıcıda durur.
  }
}

export function browserNoticeState(): BrowserNoticeState {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && optedIn() ? "on" : "off";
}

/** İzni ister (yalnız kullanıcının düğmesinden çağrılır). Sonuçtaki durumu döndürür; hata fırlatmaz. */
export async function enableBrowserNotice(): Promise<BrowserNoticeState> {
  if (!supported()) return "unsupported";
  try {
    const permission = await Notification.requestPermission();
    setOptIn(permission === "granted");
  } catch {
    // Eski tarayıcılar sözü desteklemeyebilir ya da istek engellenebilir: durum aşağıda okunur.
  }
  emit();
  return browserNoticeState();
}

/** Kullanıcı tercihini kapatır (izin tarayıcıda kalır; yalnız bu uygulama bildirim göndermez). */
export function disableBrowserNotice(): BrowserNoticeState {
  setOptIn(false);
  emit();
  return browserNoticeState();
}

/**
 * Bildirimi gösterir. Yalnız tercih açıkken VE sekme arka plandayken (görünür sekmede baloncuk yeter). Gösterildiyse true.
 * `tag` aynı iş için ikinci bildirimi birleştirir.
 */
export function showBrowserNotice(notice: { title: string; body: string; tag: string }): boolean {
  if (browserNoticeState() !== "on" || document.visibilityState === "visible") return false;
  try {
    const shown = new Notification(notice.title, { body: notice.body, tag: notice.tag });
    shown.onclick = () => {
      window.focus();
      shown.close();
    };
    return true;
  } catch {
    return false;
  }
}

/** Etkin işaretin kaldırıcısı: aynı anda tek işaret durur (ikinci bir bitiş eskisini kaldırıp kendisini koyar; iki gözlemci birbirini yeniden yazmaz). */
let clearActiveMark: (() => void) | undefined;

/**
 * Sekme başlığına işaret koyar: `● <metin> · <eski başlık>`. Sekme görünür olunca ya da odak gelince eski başlığa döner. Dönen işlev
 * işareti hemen kaldırır. İşaret sekme gizliyken KALIR: iş bitince durum şeridi sayfa verisini yeniler (`router.refresh()`) ve Next başlığı
 * yeniden yazar; gizliyken başlık dışarıdan değişirse (yenileme, gezinti) yeni başlık "eski başlık" olur ve işaret yeniden konur.
 */
export function markTabTitle(text: string, mark: string): () => void {
  if (typeof document === "undefined") return () => undefined;
  clearActiveMark?.();
  let original = document.title;
  let marked = "";
  /** Başlığı yazar ve tarayıcının normalleştirdiği hâlini saklar (boşluklar kırpılır / birleşir; yoksa karşılaştırma hep farklı çıkar). */
  const applyMark = () => {
    document.title = `${mark} ${text} · ${original}`;
    marked = document.title;
  };
  applyMark();
  const observer =
    typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver(() => {
          if (document.title === marked) return;
          if (document.visibilityState === "visible") {
            restore();
            return;
          }
          original = document.title;
          applyMark();
        });
  observer?.observe(document.head, { subtree: true, childList: true, characterData: true });
  const restore = () => {
    observer?.disconnect();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", restore);
    if (document.title === marked) document.title = original;
    if (clearActiveMark === restore) clearActiveMark = undefined;
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") restore();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", restore);
  clearActiveMark = restore;
  return restore;
}
