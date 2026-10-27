"use client";

import { Plus } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { addCompetitorAction } from "@/app/actions/competitors";
import {
  ADDABLE_PLATFORMS,
  ESTIMATED_CONTENT_COUNT,
  ESTIMATED_COST_USD,
  isAddablePlatform,
} from "@/components/competitors/add-config";
import { HANDLE_ERROR_MESSAGE, isOwnHandle, parseHandle } from "@/components/competitors/handle";
import { TAP_TARGET } from "@/components/notifications/tap";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PLATFORM_LABEL, PLATFORMS, type Platform } from "@/lib/domain/platform";
import { formatUsd } from "@/lib/format";
import { RIVAL_PLAIN } from "@/lib/plain-language-account";
import { platformText } from "@/lib/platforms/text";
import { cn } from "@/lib/utils";

const PLATFORM_ITEMS = PLATFORMS.map((p) => ({
  value: p,
  label: isAddablePlatform(p) ? PLATFORM_LABEL[p] : `${PLATFORM_LABEL[p]} (yakında)`,
}));

interface AddCompetitorDialogProps {
  defaultPlatform?: Platform;
  /** Yönetici görünümü (`isOperatorMode()`): tahmini maliyet satırı yalnız burada; müşteriye tutar / sağlayıcı yazılmaz, kısa süre cümlesi yazılır (D3-08). */
  operator?: boolean;
  /** Kendi hesapların: aynı kullanıcı adı rakip olarak eklenemez (D3-17; sunucuda da denetlenir). */
  ownAccounts?: readonly { platform: Platform; handle: string }[];
}

/**
 * "Rakip ekle" düğmesi + dialog: handle girişi (canlı normalize önizleme), platform, maliyet notu (yalnız yönetici) ya da süre
 * cümlesi (müşteri). `defaultPlatform` kendi hesabın platformudur (rakip aynı platformdan olur); verilmezse eklenebilir ilk platform.
 */
export function AddCompetitorDialog({ defaultPlatform, operator = false, ownAccounts = [] }: AddCompetitorDialogProps = {}) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>(defaultPlatform !== undefined && isAddablePlatform(defaultPlatform) ? defaultPlatform : ADDABLE_PLATFORMS[0]);
  const [raw, setRaw] = useState("");
  const [pending, startTransition] = useTransition();

  const parsed = parseHandle(raw, platform);
  const own = parsed.ok && isOwnHandle(ownAccounts, platform, parsed.handle);
  const showError = raw.trim() !== "" && (!parsed.ok || own);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setRaw("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed.ok || own || pending) return;
    startTransition(async () => {
      const result = await addCompetitorAction({ platform, handle: raw });
      if (result.ok) {
        toast.success(result.message);
        handleOpenChange(false);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button className={TAP_TARGET} />}>
        <Plus aria-hidden />
        Rakip ekle
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Rakip ekle</DialogTitle>
            <DialogDescription>
              Kullanıcı adını ya da profil bağlantısını gir; hesap doğrudan takibe alınır.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="competitor-platform">Platform</Label>
            <Select
              value={platform}
              items={PLATFORM_ITEMS}
              onValueChange={(value) => value && setPlatform(value as Platform)}
            >
              <SelectTrigger id="competitor-platform" className={cn("w-full", TAP_TARGET)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORM_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value} disabled={!isAddablePlatform(item.value)}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="competitor-handle">Kullanıcı adı ya da bağlantı</Label>
            <Input
              id="competitor-handle"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder={platformText(platform).handlePlaceholder}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={showError}
              className={TAP_TARGET}
              aria-describedby="competitor-handle-preview"
              autoFocus
            />
            <p
              id="competitor-handle-preview"
              className={showError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
              aria-live="polite"
            >
              {own ? (
                RIVAL_PLAIN.ownHandle
              ) : parsed.ok ? (
                <>
                  Eklenecek hesap: <span className="font-mono font-medium text-foreground">@{parsed.handle}</span>
                </>
              ) : showError && !parsed.ok ? (
                HANDLE_ERROR_MESSAGE[parsed.reason]
              ) : (
                "@ ve büyük harf gerekmez; bağlantı yapıştırırsan kullanıcı adı ayıklanır."
              )}
            </p>
          </div>

          <p className="rounded-lg bg-muted px-2.5 py-2 text-xs text-muted-foreground" data-testid="add-note">
            {operator
              ? `Tahmini maliyet: ~${ESTIMATED_CONTENT_COUNT} içerik ≈ ${formatUsd(ESTIMATED_COST_USD)} (Apify). Aylık tavan aşılırsa hesap eklenmez.`
              : RIVAL_PLAIN.addWait}
          </p>

          <DialogFooter>
            <Button type="submit" disabled={!parsed.ok || own || pending} className={cn(TAP_TARGET, "max-md:w-full")}>
              {pending ? "Ekleniyor…" : "Ekle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
