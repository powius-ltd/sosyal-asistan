/**
 * Çalışma alanı başına eşzamanlı tek sohbet çağrısı (süreç içi kilit). Aynı çalışma alanından ikinci istek, ilki bitmeden `acquire`
 * ile REDDEDİLİR (çağıran "meşgul" der): abonelik çağrıları ve alt süreçler sınırsız çoğalmasın. Kilit çağrının GERÇEKTEN bittiği an
 * (alt süreç çıktığında) bırakılır; istemci kopsa da süreç sürüyorsa kilit sürer. Takılı kalma güvencesi: `ttlMs` sonra kilit düşer
 * (asılı bir söz kilidi sonsuza dek tutmasın). Saat: `performance.now()` (tek saat kuralı sayfa/bileşenler içindir; bu süreç içi süredir).
 */

export interface ChatLockOptions {
  /** Kilidin en uzun ömrü (ms). Varsayılan: sohbet zaman aşımı + pay. */
  ttlMs?: number;
  /** Test için saat (ms). */
  now?: () => number;
}

/** Zaman aşımı (90 sn) + düzeltme turu/yazım payı: bundan sonra kilit kendiliğinden düşer. */
export const CHAT_LOCK_TTL_MS = 150_000;

export interface ChatLock {
  /** Kilidi alır ve BIRAKMA işlevini döndürür; çalışma alanı meşgulse undefined. Bırakma işlevi birden çok çağrılabilir. */
  acquire(workspaceId: string): (() => void) | undefined;
}

export function createChatLock(options: ChatLockOptions = {}): ChatLock {
  const ttlMs = options.ttlMs ?? CHAT_LOCK_TTL_MS;
  const now = options.now ?? (() => performance.now());
  const held = new Map<string, { token: symbol; expiresAt: number }>();
  return {
    acquire(workspaceId) {
      const current = held.get(workspaceId);
      if (current !== undefined && current.expiresAt > now()) return undefined;
      const token = Symbol(workspaceId);
      held.set(workspaceId, { token, expiresAt: now() + ttlMs });
      return () => {
        // Yalnız KENDİ kilidini bırakır: süresi dolup başkasına geçmiş kilidi silmez.
        if (held.get(workspaceId)?.token === token) held.delete(workspaceId);
      };
    },
  };
}

/** Süreç genelinde tek kilit (route handler modülü paylaşır). */
export const chatLock: ChatLock = createChatLock();
