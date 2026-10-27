"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { discardOnboardingAccountAction } from "@/app/actions/onboarding";
import { callAction } from "@/components/common/call-action";
import { ONBOARDING_ADD_HREF } from "@/components/onboarding/add-intent";
import { FOCUS_ALERT, FOCUS_SECONDARY } from "@/components/onboarding/surface";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ReplaceAccountButtonProps {
  /** Düğme metni ("Bu ben değilim", "Başka bir hesap ekle"). */
  label: string;
  /** Kaldırma isteği başarısız olursa gösterilen Türkçe not (ağ / sunucu hatası). */
  failure: string;
  className?: string;
}

/**
 * Yanlış açılan hesabı bırakıp başka hesap eklemeye geçer ("bu ben değilim", "başka hesap dene"): önce çalışma alanı kaldırılmaya çalışılır,
 * sonra hesap ekleme formu açılır. Kaldırma kuralı sunucudadır (onaylanmamış, ilk turu açılmamış, gerçek veri taşımayan çalışma alanı):
 * kaldırılamıyorsa hata DEĞİLDİR, çalışma alanı yerinde kalır ve form yine açılır. Yalnız sunucuya ulaşılamazsa ekranda kalınır ve not yazılır.
 * Gece yüzeyinde ikincil düğme görünümündedir (`FOCUS_SECONDARY`).
 */
export function ReplaceAccountButton({ label, failure, className }: ReplaceAccountButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const replace = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const result = await callAction(() => discardOnboardingAccountAction(), failure);
    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }
    router.push(ONBOARDING_ADD_HREF);
  };

  return (
    <>
      <Button type="button" variant="outline" className={cn("w-full sm:w-auto", FOCUS_SECONDARY, className)} disabled={busy} aria-busy={busy} onClick={() => void replace()}>
        {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
        {label}
      </Button>
      {error !== undefined ? (
        <p role="alert" className={cn(FOCUS_ALERT, "w-full")}>
          {error}
        </p>
      ) : null}
    </>
  );
}
