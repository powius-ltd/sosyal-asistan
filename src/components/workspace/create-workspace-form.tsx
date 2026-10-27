"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { createWorkspaceAndSwitch } from "@/app/actions/workspace";
import { callAction } from "@/components/common/call-action";
import { LabeledSelect, type SelectOption } from "@/components/common/labeled-select";
import { ACCOUNT_TYPE_OPTIONS } from "@/components/workspace/account-type-options";
import { FIRST_STEPS_ID } from "@/components/workspace/anchors";
import { CONTENT_LANGUAGE_AUTO, CONTENT_LANGUAGE_OPTIONS, contentLanguageOfSelect } from "@/components/workspace/content-language-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NICHE_BRIEF_MAX_LENGTH } from "@/lib/data/queries";
import { ACCOUNT_TYPE_PROFILE, DEFAULT_ACCOUNT_TYPE, isAccountType } from "@/lib/domain/account-type";
import { COMPLIANCE_REGION_LABEL, COMPLIANCE_REGIONS, DEFAULT_COMPLIANCE_REGION } from "@/lib/domain/compliance";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { ROUTES } from "@/lib/routes";

const REGION_OPTIONS: SelectOption[] = COMPLIANCE_REGIONS.map((value) => ({ value, label: COMPLIANCE_REGION_LABEL[value] }));

/**
 * Yeni çalışma alanı formu (OPERATÖR MODU). Doğrulama sunucudadır (`createWorkspaceAndSwitch`: zod + operatör modu denetimi); burada yalnız
 * alanlar toplanır ve hata mesajı sunucudan gösterilir. Başarıda yeni çalışma alanına geçilir ve "ilk adımlar" kutusuna gidilir.
 * Otomatik toplama başlatılmaz.
 */
export function CreateWorkspaceForm({ platforms }: { platforms: readonly SelectOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState(platforms[0]?.value ?? "");
  const [nicheBrief, setNicheBrief] = useState("");
  const [timezone, setTimezone] = useState("");
  const [audienceTimezone, setAudienceTimezone] = useState("");
  const [region, setRegion] = useState<string>(DEFAULT_COMPLIANCE_REGION);
  const [contentLanguage, setContentLanguage] = useState<string>(CONTENT_LANGUAGE_AUTO);
  const [accountType, setAccountType] = useState<string>(DEFAULT_ACCOUNT_TYPE);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await callAction(
        () =>
          createWorkspaceAndSwitch({
            name,
            handle,
            platform,
            nicheBrief,
            timezone,
            audienceTimezone,
            complianceRegion: region,
            contentLanguage: contentLanguageOfSelect(contentLanguage) ?? "",
            accountType,
          }),
        "Çalışma alanı oluşturulamadı. Bağlantını kontrol edip tekrar dene.",
      );
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`"${result.name}" oluşturuldu ve geçildi. Aşağıdaki ilk adımlar kutusuna bak.`);
      setName("");
      setHandle("");
      setNicheBrief("");
      setTimezone("");
      setAudienceTimezone("");
      router.push(`${ROUTES.settings}#${FIRST_STEPS_ID}`);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" data-testid="create-workspace-form">
      <fieldset disabled={pending} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-ws-name">Çalışma alanı adı</Label>
            <Input id="new-ws-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Örn. Kahve Dükkanı" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-ws-handle">Kendi hesabın (kullanıcı adı)</Label>
            <Input
              id="new-ws-handle"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="@kullaniciadi"
              autoCapitalize="none"
              required
            />
          </div>
        </div>

        {platforms.length > 1 ? (
          <LabeledSelect label="Platform" value={platform} options={platforms} onChange={setPlatform} className="w-52" />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <LabeledSelect label="Hesap türü" value={accountType} options={ACCOUNT_TYPE_OPTIONS} onChange={setAccountType} className="w-64" />
          <p className="text-xs text-muted-foreground">
            {isAccountType(accountType) ? ACCOUNT_TYPE_PROFILE[accountType].description : ACCOUNT_TYPE_PROFILE[DEFAULT_ACCOUNT_TYPE].description} Sonra Ayarlar&apos;dan
            değiştirebilirsin.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="new-ws-niche">Niş özeti (isteğe bağlı)</Label>
            <span className="text-xs text-muted-foreground tabular">
              {Array.from(nicheBrief).length} / {NICHE_BRIEF_MAX_LENGTH}
            </span>
          </div>
          <Textarea
            id="new-ws-niche"
            value={nicheBrief}
            onChange={(event) => setNicheBrief(event.target.value)}
            placeholder="Ör. Danışmanlık; İngilizce içerik, ABD hedefli."
            className="min-h-20"
          />
          <p className="text-xs text-muted-foreground">Konu eleği ve fikir üretimi bunu girdi olarak kullanır; sonra Ayarlar&apos;dan değiştirebilirsin.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-ws-tz">Saat dilimi</Label>
            <Input id="new-ws-tz" value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder={DEFAULT_TIMEZONE} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-ws-audience-tz">Hedef kitle saat dilimi</Label>
            <Input
              id="new-ws-audience-tz"
              value={audienceTimezone}
              onChange={(event) => setAudienceTimezone(event.target.value)}
              placeholder="Örn. America/New_York"
            />
          </div>
          <LabeledSelect label="Uyum bölgesi" value={region} options={REGION_OPTIONS} onChange={setRegion} className="w-full" />
        </div>
        <LabeledSelect label="İçerik dili" value={contentLanguage} options={CONTENT_LANGUAGE_OPTIONS} onChange={setContentLanguage} className="w-52" />
        <p className="text-xs text-muted-foreground">
          Açılış cümlesi, senaryo ve açıklama taslağı bu dilde üretilir. Otomatik: kendi videolarının dilinden, yoksa uyum bölgesinden bulunur.
        </p>
        <p className="text-xs text-muted-foreground">
          Saat dilimleri IANA adıyla yazılır; boş bırakılırsa {DEFAULT_TIMEZONE} (hedef kitle için çalışma alanı saat dilimi) kullanılır. Aylık Apify
          tavanı varsayılan kalır, ölçüm tavanı onaysızdır; ikisi de Ayarlar&apos;dan değişir.
        </p>
      </fieldset>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Oluşturuluyor…" : "Çalışma alanı oluştur"}
        </Button>
      </div>
    </form>
  );
}
