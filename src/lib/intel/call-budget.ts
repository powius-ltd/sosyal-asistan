/**
 * Video analizi çağrı sayacı + sınırlı eşzamanlı kuyruk (saf; ağ/DB yok). `AGY_MAX_CALLS_PER_RUN` (varsayılan 40) abonelik
 * kotasını korur: bir iş BAŞLAMADAN önce sayaca bakılır (kullanılan ≥ tavan ise iş başlamaz, `skipped` olur); iş bitince gerçek çağrı
 * sayısı (yeniden deneme + düzeltme turu dahil) eklenir. Eşzamanlı işler aynı sayacı paylaşır; tek iş en çok birkaç çağrı yaptığı için
 * tavan en çok eşzamanlılık kadar aşılabilir (bilinçli: yarım kalan analiz atılmaz).
 */
export const DEFAULT_MAX_AGY_CALLS = 40;
/** Varsayılan eşzamanlı video analizi (`analyze:now --concurrency=N` ile 1–6 arası değişir). */
export const DEFAULT_CONCURRENCY = 3;

export interface CallBudget {
  readonly max: number;
  readonly used: number;
  /** Kota/arka uç sorunu yüzünden kuyruk durduruldu mu (yeni iş başlamaz). */
  readonly halted: boolean;
  /** Yeni iş başlatılabilir mi. */
  canStart(): boolean;
  add(calls: number): void;
  /** Sürekli hata (abonelik kotası dolu, arka uç yok): kalan işler başlatılmaz. */
  halt(): void;
}

export function createCallBudget(max: number): CallBudget {
  let used = 0;
  let halted = false;
  return {
    max,
    get used() {
      return used;
    },
    get halted() {
      return halted;
    },
    canStart: () => !halted && used < max,
    add: (calls) => {
      used += Math.max(0, Math.floor(calls));
    },
    halt: () => {
      halted = true;
    },
  };
}

/** `AGY_MAX_CALLS_PER_RUN` okur: pozitif tam sayı; yoksa/bozuksa varsayılan. */
export function readMaxAgyCalls(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env.AGY_MAX_CALLS_PER_RUN?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_AGY_CALLS;
}

export interface QueueOutcome<I, R> {
  done: { item: I; result: R }[];
  /** Çağrı tavanı dolduğu için başlatılmayanlar. */
  skipped: I[];
}

/**
 * `items`'ı sırayla, en çok `concurrency` eşzamanlı işler. `work` iş sonucuyla birlikte harcanan çağrı sayısını döndürür. `work`
 * fırlatırsa kuyruk DURUR: işçilerin paylaştığı `stopped` bayrağı yüzünden diğer işçiler yeni iş almaz; yolda olan işler biter (yarım
 * kalan video/koşu satırı bırakılmaz), sonra ilk hata yukarı gider (yazma hataları sessizce yutulmaz). `work` kendi iş hatalarını
 * sonuca çevirmelidir.
 */
export async function runBudgetedQueue<I, R>(
  items: readonly I[],
  budget: CallBudget,
  work: (item: I) => Promise<{ result: R; calls: number }>,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<QueueOutcome<I, R>> {
  const done: { item: I; result: R }[] = [];
  const skipped: I[] = [];
  let next = 0;
  let stopped = false;
  const worker = async (): Promise<void> => {
    while (!stopped && next < items.length) {
      const item = items[next++];
      if (!budget.canStart()) {
        skipped.push(item);
        continue;
      }
      try {
        const { result, calls } = await work(item);
        budget.add(calls);
        done.push({ item, result });
      } catch (error) {
        stopped = true;
        throw error;
      }
    }
  };
  const settled = await Promise.allSettled(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  const failure = settled.find((entry): entry is PromiseRejectedResult => entry.status === "rejected");
  if (failure) throw failure.reason;
  const order = new Map(items.map((item, index) => [item, index]));
  done.sort((a, b) => (order.get(a.item) as number) - (order.get(b.item) as number));
  skipped.sort((a, b) => (order.get(a) as number) - (order.get(b) as number));
  return { done, skipped };
}
