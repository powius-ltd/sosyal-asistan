"use client";

import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { isOverLimit, LimitCounter } from "@/components/collections/limit-counter";
import { TAP_ICON, TAP_TARGET } from "@/components/notifications/tap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COLLECTION_NAME_MAX } from "@/lib/domain/collection";
import { cn } from "@/lib/utils";

interface NewCollectionFormProps {
  disabled: boolean;
  /** Başarılıysa true döner; alan yalnız o zaman temizlenir. */
  onCreate: (name: string) => Promise<boolean>;
}

/** "Kaydet" menüsünde satır içi "Yeni koleksiyon": ad yaz, Enter ya da düğmeyle oluştur (içerik hemen eklenir). */
export function NewCollectionForm({ disabled, onCreate }: NewCollectionFormProps) {
  const [name, setName] = useState("");
  const empty = name.trim() === "";
  const over = isOverLimit(name, COLLECTION_NAME_MAX);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (empty || over || disabled) return;
    if (await onCreate(name)) setName("");
  }

  return (
    <form onSubmit={submit} className="grid gap-1">
      <div className="flex items-center gap-1.5">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Yeni koleksiyon"
          aria-label="Yeni koleksiyon adı"
          aria-invalid={over}
          aria-describedby={name === "" ? undefined : "new-collection-limit"}
          autoComplete="off"
          disabled={disabled}
          className={TAP_TARGET}
        />
        <Button
          type="submit"
          size="icon"
          variant="outline"
          aria-label="Koleksiyon oluştur ve kaydet"
          disabled={empty || over || disabled}
          className={cn("shrink-0", TAP_ICON)}
        >
          <Plus aria-hidden />
        </Button>
      </div>
      {name === "" ? null : <LimitCounter id="new-collection-limit" value={name} max={COLLECTION_NAME_MAX} label="Ad" />}
    </form>
  );
}
