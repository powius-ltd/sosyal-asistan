"use client";

import { TAP_TARGET } from "@/components/notifications/tap";
import { SETTINGS_PLAIN } from "@/lib/plain-language-account";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateContentLanguage } from "@/app/actions/content-language-settings";
import { callAction } from "@/components/common/call-action";
import { LabeledSelect } from "@/components/common/labeled-select";
import { Button } from "@/components/ui/button";
import { CONTENT_LANGUAGE_AUTO, CONTENT_LANGUAGE_OPTIONS, contentLanguageOfSelect } from "@/components/workspace/content-language-options";
import type { ContentLanguage } from "@/lib/domain/content-language";

export interface ContentLanguageFieldProps {
  /** `workspace.contentLanguage` (kayıtlı değer); undefined = Otomatik. */
  language?: ContentLanguage;
}

/**
 * Ayarlar, "İçerik dili": hook, script ve açıklama taslağının dili. Panel metinleri (gerekçe, başlık) bundan bağımsız hep Türkçedir.
 * Otomatik: kendi videolarının konuşma dilinin çoğunluğu, yoksa uyum bölgesi. Kayıt sunucuda doğrulanır (`updateContentLanguage`).
 */
export function ContentLanguageField({ language }: ContentLanguageFieldProps) {
  const saved = language ?? CONTENT_LANGUAGE_AUTO;
  const [value, setValue] = useState<string>(saved);
  const [pending, startTransition] = useTransition();
  const dirty = value !== saved;

  function save() {
    startTransition(async () => {
      const result = await callAction(() => updateContentLanguage({ contentLanguage: contentLanguageOfSelect(value) }), "İçerik dili kaydedilemedi. Tekrar dene.");
      if (result.ok) toast.success("İçerik dili kaydedildi.");
      else toast.error(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="content-language-field">
      <div className="flex flex-wrap items-end gap-2">
        <LabeledSelect label="İçerik dili" value={value} options={CONTENT_LANGUAGE_OPTIONS} onChange={setValue} disabled={pending} className="w-52 min-h-tap md:min-h-0" />
        <Button type="button" variant="secondary" disabled={!dirty || pending} onClick={save} className={TAP_TARGET}>
          {pending ? "Kaydediliyor…" : "Dili kaydet"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{SETTINGS_PLAIN.contentLanguageHelp}</p>
    </div>
  );
}
