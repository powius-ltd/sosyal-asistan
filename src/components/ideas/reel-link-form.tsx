"use client";

import { Link2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { linkIdeaToReelAction } from "@/app/actions/idea-links";
import { callAction } from "@/components/common/call-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TAP } from "@/components/weekly-plan/tap-target";
import type { Platform } from "@/lib/domain/platform";
import { platformText } from "@/lib/platforms/text";
import { cn } from "@/lib/utils";

/**
 * "Bu fikir şu Reels oldu": yayınlanan Reels'in bağlantısını fikre bağlar (kullanıcı linki verdi = onay). Kendi hesap içeriğiyle
 * eşleşirse fikir hemen "Yayınlandı" olur; içerik henüz toplanmadıysa bir sonraki toplamada eşleşir. Asıl doğrulama sunucudadır.
 * Hata baloncukta değil alanın altında yazılır; alan hatalı işaretlenir ve odak ona döner (D2-12).
 */
export function ReelLinkForm({ ideaId, platform }: { ideaId: string; platform: Platform }) {
  // İçerik türünün adı ve bağlantı örneği platformdan ("Reels" / "video"): tek yer `platformText`.
  const { contentNoun, contentUrlPlaceholder } = platformText(platform);
  const [url, setUrl] = useState("");
  // Nesne: aynı iletiyle art arda hata alınsa da odak her seferinde alana döner.
  const [failure, setFailure] = useState<{ message: string }>();
  const error = failure?.message;
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const inputId = `reel-url-${ideaId}`;
  const errorId = `${inputId}-error`;

  // Alan işlem sürerken devre dışıdır; hata gelince (alan açılınca) odak ona taşınır.
  useEffect(() => {
    if (failure && !pending) input.current?.focus();
  }, [failure, pending]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await callAction(() => linkIdeaToReelAction({ ideaId, url }), "Bağlantı kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
      if (!result.ok) {
        setFailure({ message: result.message });
        return;
      }
      setFailure(undefined);
      setUrl("");
      toast.success(
        result.status === "confirmed"
          ? `${contentNoun} bağlandı; fikir “Yayınlandı” oldu.`
          : `Bağlantı kaydedildi. ${contentNoun} henüz toplanmamış: bir sonraki toplamada eşleşecek.`,
      );
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-1.5">
      <Label htmlFor={inputId} className="text-xs font-medium">
        Bu fikir şu {contentNoun} oldu
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={inputId}
          type="url"
          inputMode="url"
          value={url}
          ref={input}
          onChange={(event) => {
            setUrl(event.target.value);
            setFailure(undefined);
          }}
          placeholder={contentUrlPlaceholder}
          disabled={pending}
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : errorId}
          className={cn("h-8 min-w-48 flex-1", TAP)}
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending || url.trim() === ""} className={TAP}>
          <Link2 aria-hidden />
          {pending ? "Bağlanıyor…" : "Bağla"}
        </Button>
      </div>
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
