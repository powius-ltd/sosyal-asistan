/**
 * İş durumunun İSTEMCİ deposu: şerit, basılan düğmeler, onay penceresi ve `/isler` aynı durumu okur; yoklayan TEK yerdir (düğme
 * başına ayrı yoklama yok). Kurallar (plan §3):
 *  - yoklama YALNIZ izlenecek iş varken (etkin iş ya da bu sekmeden yeni istenen iş), `JOB_POLL_INTERVAL_MS`'te bir;
 *  - sekme gizliyken durur, görününce hemen bir kez okur (bayat durum kalmasın). TEK istisna `setBackgroundPolling(true)`: kullanıcının
 *    başka sekmeye geçip beklediği uzun iş (başlangıç işi) sürerken yoklama gizli sekmede de sürer (bitiş sekme başlığına / tarayıcı
 *    bildirimine yansısın); tarayıcı gizli sekmede zamanlayıcıyı kendisi seyreltir;
 *  - dinleyen bileşen kalmayınca durur;
 *  - iş bitince bitiş dinleyicileri çağrılır (şerit sayfa verisini yeniler), son görünüm `settled`'da kalır;
 *  - "sırada iş var, işçi görünmüyor" yanıtında işçi dürtülür: en çok `JOB_KICK_MIN_INTERVAL_MS`'te bir (dürtücü yalnız yönetici
 *    şeridi bağladıysa vardır).
 * Saat okunmaz (bayatlık ve "işçi gerekli" sunucuda hesaplanır); süreler zamanlayıcıyladır. Bağımlılıklar enjekte edilir (test).
 */
import { isActiveJobStatus, JOB_KICK_MIN_INTERVAL_MS, JOB_POLL_INTERVAL_MS } from "@/lib/domain/panel-job";
import type { JobsStatusResponse, JobStatusView } from "@/lib/domain/panel-job-view";
import { jobsStatusUrl } from "@/lib/routes";

export interface JobsSnapshot {
  /** Tohumun çalışma alanı; henüz tohumlanmadıysa yok. */
  scope?: string;
  /** Çalışma alanının etkin işi (sırada / çalışıyor). */
  active?: JobStatusView;
  /** Bu sekmeden istenen ama henüz hiçbir yanıtta görülmemiş iş. */
  pendingId?: string;
  /** Bitişi bu sekmede görülen işler (kimlik → son görünüm): düğme ve onay penceresi kendi işinin sonucunu buradan okur. */
  settled: Readonly<Record<string, JobStatusView>>;
  /** En son biten iş (şerit sonuç cümlesini bundan kurar); kapatılınca ya da yeni iş istenince silinir. */
  lastFinished?: JobStatusView;
  /** Sırada bekleyen işi alacak işçi görünmüyor (yalnız yönetici modunda true gelir). */
  workerNeeded: boolean;
}

export const EMPTY_JOBS_SNAPSHOT: JobsSnapshot = { settled: {}, workerNeeded: false };

/** `settled`'da tutulan iş sayısı (eskiler düşer). */
const SETTLED_KEEP = 5;

export interface JobStatusStoreDeps {
  /** Durum ucunu okur; `jobId` verilirse yanıtta o iş de döner (bitmiş olsa bile). Hata fırlatabilir. */
  fetchStatus(jobId: string | undefined): Promise<JobsStatusResponse>;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Sekme şu an görünür mü. */
  isVisible(): boolean;
  /** Görünürlük değişince `listener` çağrılır; dönen işlev aboneliği kaldırır. */
  onVisibilityChange(listener: () => void): () => void;
}

function isStatusResponse(body: unknown): body is JobsStatusResponse {
  return typeof body === "object" && body !== null && typeof (body as { workerNeeded?: unknown }).workerNeeded === "boolean";
}

/** Tarayıcı bağımlılıkları. Hiçbiri modül yüklenirken çağrılmaz (sunucu çiziminde `document` yoktur). */
export const BROWSER_JOB_STORE_DEPS: JobStatusStoreDeps = {
  async fetchStatus(jobId) {
    const response = await fetch(jobsStatusUrl(jobId), { cache: "no-store", headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`iş durumu okunamadı (${response.status})`);
    const body: unknown = await response.json();
    if (!isStatusResponse(body)) throw new Error("iş durumu yanıtı beklenen biçimde değil");
    return body;
  },
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  isVisible: () => document.visibilityState === "visible",
  onVisibilityChange(listener) {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
};

type OptionalKey = "scope" | "active" | "pendingId" | "lastFinished";

/** Verilen isteğe bağlı alanları taşımayan kopya (alan `undefined` değeriyle bırakılmaz). */
function without(state: JobsSnapshot, ...keys: OptionalKey[]): JobsSnapshot {
  const next = { ...state };
  for (const key of keys) delete next[key];
  return next;
}

const sameView = (a: JobStatusView | undefined, b: JobStatusView | undefined): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

export class JobStatusStore {
  private readonly deps: JobStatusStoreDeps;
  private state: JobsSnapshot = EMPTY_JOBS_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private readonly finishListeners = new Set<() => void>();
  private timer: unknown;
  private inFlight = false;
  private pollAgain = false;
  private stopVisibility: (() => void) | undefined;
  private kick: (() => void) | undefined;
  private kickCooling = false;
  private background = false;
  /** Durum ucunun "böyle bir etkin iş yok" dediği ve son görünümü de vermediği işler: aynı iş yeniden tohumlanırsa izlenmez. */
  private readonly gone = new Set<string>();

  constructor(deps: JobStatusStoreDeps) {
    this.deps = deps;
  }

  /** `useSyncExternalStore` aboneliği. İlk dinleyiciyle yoklama kurulur, sonuncusu gidince durur. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.stopVisibility = this.deps.onVisibilityChange(this.onVisibility);
      this.schedule();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size > 0) return;
      this.stopVisibility?.();
      this.stopVisibility = undefined;
      this.cancelTimer();
    };
  };

  getSnapshot = (): JobsSnapshot => this.state;

  /** İzlenen iş bittiğinde çağrılır (şerit sayfa verisini yeniler). Dönen işlev aboneliği kaldırır. */
  onFinish(listener: () => void): () => void {
    this.finishListeners.add(listener);
    return () => {
      this.finishListeners.delete(listener);
    };
  }

  /**
   * Sunucunun çizdiği durumla tohumlar (her sunucu çiziminde yeniden çağrılır). Başka çalışma alanı → durum sıfırlanır. Sunucu "etkin iş
   * yok" derken bir iş izleniyorsa bitişi burada VARSAYILMAZ: yoklama son görünümüyle birlikte çözer. Bittiği zaten bilinen iş (bayat
   * çizim) ve durum ucunun tanımadığı iş yeniden etkin sayılmaz: yoksa çizim ile durum ucu anlaşamadığında "izle → bitti → sayfayı
   * yenile → yeniden izle" döngüsü oluşurdu.
   */
  seed(scope: string, response: JobsStatusResponse): void {
    const prev = this.state;
    if (prev.scope !== scope) {
      this.gone.clear();
      this.commit({ ...EMPTY_JOBS_SNAPSHOT, scope, ...(response.active ? { active: response.active } : {}), workerNeeded: response.workerNeeded });
    } else if (response.active === undefined) {
      if (prev.active !== undefined) void this.poll();
      return;
    } else if (prev.settled[response.active.id] !== undefined || this.gone.has(response.active.id)) {
      return;
    } else {
      const next: JobsSnapshot = { ...prev, active: response.active, workerNeeded: response.workerNeeded };
      this.commit(prev.pendingId === response.active.id ? without(next, "pendingId") : next);
    }
    if (response.workerNeeded) this.maybeKick();
    this.schedule();
  }

  /** Bu sekmeden yeni istenen işi izlemeye alır ve hemen bir kez okur (eski sonuç satırı düşer). */
  follow(jobId: string): void {
    this.commit({ ...without(this.state, "lastFinished"), pendingId: jobId });
    void this.poll();
  }

  /** Hemen bir kez okur (ör. "Durdur" sonrası). */
  refresh(): void {
    void this.poll();
  }

  /** Şeritteki sonuç satırını kapatır. */
  dismissFinished(): void {
    if (this.state.lastFinished !== undefined) this.commit(without(this.state, "lastFinished"));
  }

  /** İşçi dürtücüsünü bağlar (yalnız yönetici şeridi); `undefined` ayırır. Bağlanırken işçi gerekiyorsa hemen dürtülür. */
  setKick(kick: (() => void) | undefined): void {
    this.kick = kick;
    if (kick !== undefined && this.state.workerNeeded) this.maybeKick();
  }

  /**
   * Gizli sekmede de yoklamayı sürdürür (`true`) ya da sekme gizliyken durdurur (`false`, varsayılan). Çağıran iş bitince kapatır;
   * izlenecek iş yokken zaten yoklama yapılmaz.
   */
  setBackgroundPolling(on: boolean): void {
    if (this.background === on) return;
    this.background = on;
    if (on) this.schedule();
    else if (!this.deps.isVisible()) this.cancelTimer();
  }

  /** Durumu, dinleyicileri ve zamanlayıcıları sıfırlar (test). */
  reset(): void {
    this.cancelTimer();
    this.stopVisibility?.();
    this.stopVisibility = undefined;
    this.listeners.clear();
    this.finishListeners.clear();
    this.state = EMPTY_JOBS_SNAPSHOT;
    this.gone.clear();
    this.inFlight = false;
    this.pollAgain = false;
    this.kick = undefined;
    this.kickCooling = false;
    this.background = false;
  }

  private onVisibility = (): void => {
    if (!this.deps.isVisible()) {
      if (!this.background) this.cancelTimer();
      return;
    }
    if (this.watching()) void this.poll();
  };

  /** Dinleyen var mı ve izlenecek iş var mı. */
  private watching(): boolean {
    return this.listeners.size > 0 && (this.state.active !== undefined || this.state.pendingId !== undefined);
  }

  private schedule(): void {
    if (this.timer !== undefined || this.inFlight || !this.watching() || !(this.background || this.deps.isVisible())) return;
    this.timer = this.deps.setTimer(() => {
      this.timer = undefined;
      void this.poll();
    }, JOB_POLL_INTERVAL_MS);
  }

  private cancelTimer(): void {
    if (this.timer === undefined) return;
    this.deps.clearTimer(this.timer);
    this.timer = undefined;
  }

  private async poll(): Promise<void> {
    if (this.inFlight) {
      this.pollAgain = true;
      return;
    }
    this.cancelTimer();
    this.inFlight = true;
    const scope = this.state.scope;
    const polledId = this.state.active?.id ?? this.state.pendingId;
    try {
      const response = await this.deps.fetchStatus(polledId);
      // Yanıt beklenirken çalışma alanı değiştiyse eski alanın yanıtı uygulanmaz.
      if (this.state.scope === scope) this.apply(response, polledId);
    } catch {
      // Ağ / sunucu hatası: durum korunur, sıradaki yoklama yeniden dener.
    } finally {
      this.inFlight = false;
      if (this.pollAgain) {
        this.pollAgain = false;
        void this.poll();
      } else {
        this.schedule();
      }
    }
  }

  private apply(response: JobsStatusResponse, polledId: string | undefined): void {
    const prev = this.state;
    const finished = response.job !== undefined && !isActiveJobStatus(response.job.status) ? response.job : undefined;
    const newlySettled = finished !== undefined && prev.settled[finished.id] === undefined;
    // İzlenen iş artık etkin değil (bitti ya da yerini başka iş aldı).
    const ended = prev.active !== undefined && response.active?.id !== prev.active.id;

    let next: JobsSnapshot = { ...without(prev, "active"), workerNeeded: response.workerNeeded };
    if (response.active !== undefined) next.active = response.active;
    // İstenen iş için İLK yanıt geldi: ne derse desin artık "bekleyen" değil (yanıtta yoksa düğme "izlenemedi" der).
    if (prev.pendingId !== undefined && prev.pendingId === polledId) next = without(next, "pendingId");
    if (newlySettled) {
      next.settled = Object.fromEntries([...Object.entries(prev.settled), [finished.id, finished] as const].slice(-SETTLED_KEEP));
      next.lastFinished = finished;
    } else if (ended) {
      // Son görünümü okunamadan biten iş: önceki işin sonuç satırı onun yerine gösterilmez.
      next = without(next, "lastFinished");
      if (prev.active !== undefined && finished?.id !== prev.active.id) this.gone.add(prev.active.id);
    }
    this.commit(next);
    if (newlySettled || ended) for (const listener of [...this.finishListeners]) listener();
    if (response.workerNeeded) this.maybeKick();
  }

  private maybeKick(): void {
    if (this.kick === undefined || this.kickCooling) return;
    this.kickCooling = true;
    this.deps.setTimer(() => {
      this.kickCooling = false;
    }, JOB_KICK_MIN_INTERVAL_MS);
    this.kick();
  }

  private commit(next: JobsSnapshot): void {
    const prev = this.state;
    const unchanged =
      prev.scope === next.scope &&
      prev.pendingId === next.pendingId &&
      prev.workerNeeded === next.workerNeeded &&
      prev.settled === next.settled &&
      sameView(prev.active, next.active) &&
      sameView(prev.lastFinished, next.lastFinished);
    if (unchanged) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }
}

/** Sekmenin tek deposu. Yalnız tarayıcıda dinlenir; sunucu çiziminde bileşenler kendi tohumlarını gösterir (`useJobsStatus`). */
export const jobStatusStore = new JobStatusStore(BROWSER_JOB_STORE_DEPS);
