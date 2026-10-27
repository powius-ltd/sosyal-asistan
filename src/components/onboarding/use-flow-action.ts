"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { callAction } from "@/components/common/call-action";
import type { ActionResult } from "@/lib/actions/result";

export interface FlowAction {
  /** Action çağrılıyor ya da sayfa verisi yenileniyor: düğmeler kapalı çizilir. */
  busy: boolean;
  /** Son çağrının Türkçe hata mesajı (sunucudan); yoksa undefined. */
  error: string | undefined;
  clearError(): void;
  /**
   * Action'ı çağırır. Başarıda `onOk` (varsa) çalışır ve sayfa verisi yenilenir: akışın adımı sunucuda yeniden türetilir, ekran oradan
   * değişir (adım istemcide tutulmaz). Başarısızlıkta mesaj `error`'a yazılır, ekran yerinde kalır.
   */
  run<T extends object>(call: () => Promise<ActionResult<T>>, options?: { failure?: string; onOk?: (result: { ok: true } & T) => void }): Promise<boolean>;
}

/** Akış ekranlarındaki düğmelerin ortak çağrı durumu (bekleme düğmede, hata ekranda; ham `try/catch` yok: `callAction`). */
export function useFlowAction(): FlowAction {
  const router = useRouter();
  const [calling, setCalling] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string>();

  const run = useCallback<FlowAction["run"]>(
    async (call, options) => {
      setError(undefined);
      setCalling(true);
      const result = await callAction(call, options?.failure);
      setCalling(false);
      if (!result.ok) {
        setError(result.message);
        return false;
      }
      options?.onOk?.(result);
      startRefresh(() => router.refresh());
      return true;
    },
    [router],
  );

  const clearError = useCallback(() => setError(undefined), []);
  return { busy: calling || refreshing, error, clearError, run };
}
