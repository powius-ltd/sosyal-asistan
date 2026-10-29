"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { removeLocalKey, saveLocalKey, testLocalKey } from "@/app/actions/local-keys";
import { callAction } from "@/components/common/call-action";
import type { ActionResult } from "@/lib/actions/result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { KeyService } from "@/lib/local-keys/names";

export interface ApiKeyRowProps {
  service: KeyService;
  title: string;
  hint: string;
  state: "set" | "missing";
  last4?: string;
  generic?: boolean;
}

/**
 * Tek anahtar satırı (istemci yaprağı). Değer yalnız GİDER: durum satırı "kayıtlı ✓ · …son 4 hane" ya da "yok" der; alan her
 * kayıttan sonra boşalır. Kaldırma iki adımlıdır (onay düğmesi).
 */
export function ApiKeyRow({ service, title, hint, state, last4, generic }: ApiKeyRowProps) {
  const [value, setValue] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputId = `api-key-${service}`;
  const isSet = state === "set";

  function run(task: () => Promise<ActionResult<{ message: string }>>, after?: () => void) {
    startTransition(async () => {
      const result = await callAction(task);
      if (result.ok) {
        toast.success(result.message);
        after?.();
      } else toast.error(result.message);
    });
  }

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => saveLocalKey({ service, value }), () => setValue(""));
  }

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">{title}</h3>
          {isSet ? (
            <Badge variant="outline" className="border-transparent bg-success-soft text-success-soft-foreground">
              kayıtlı ✓ · …{last4}
              {generic ? " · genel anahtar" : ""}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-transparent bg-warning-soft text-warning-soft-foreground">
              yok
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      <form onSubmit={onSave} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={inputId} className="sr-only">
            {title} anahtarı
          </Label>
          <Input
            id={inputId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={isSet ? "Yeni anahtarı yapıştır" : "Anahtarı yapıştır"}
            disabled={pending}
          />
        </div>
        <Button type="submit" disabled={pending || value.trim() === ""} className="min-h-tap sm:min-h-0">
          {pending ? "Bekle…" : "Kaydet"}
        </Button>
      </form>

      {isSet ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => testLocalKey({ service }))}>
            Dene
          </Button>
          {confirmRemove ? (
            <>
              <span className="text-xs text-muted-foreground">Anahtar silinecek. Emin misin?</span>
              <Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => removeLocalKey({ service }), () => setConfirmRemove(false))}>
                Evet, kaldır
              </Button>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirmRemove(false)}>
                Vazgeç
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirmRemove(true)}>
              Kaldır
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
