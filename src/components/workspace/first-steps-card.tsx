import { ArrowRight, Terminal } from "lucide-react";
import Link from "next/link";

import { linkButtonClass } from "@/components/content/link-button";
import { FIRST_STEPS_ID } from "@/components/workspace/anchors";
import { JobCommand } from "@/components/workspace/job-command";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ONBOARDING_TODAY_BODY_PLAIN, ONBOARDING_TODAY_PLAIN } from "@/lib/plain-language-onboarding";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { WorkspaceCommandRef } from "@/lib/workspace/command";

/** Yedek komutta toplama için örnek Apify tavanı (USD); kullanıcı kendi tutarını yazar. */
const EXAMPLE_APIFY_MAX_USD = 0.5;
const COMMAND_LEAD = "Terminalde:";

/**
 * Boş çalışma alanı için "ilk adımlar": artık başlangıç akışına (`/baslangic`) yönlendirir. Hesaba bakış, benzer hesap seçimi ve ilk plan
 * orada, sırayla ve akıştaki düğmelerin onayıyla yapılır (panel veri toplamayı KENDİLİĞİNDEN başlatmaz). Eski elle yol (rakip ekle → önce
 * bak → veriyi getir + tur) yöneticiye kapalı bir bölümde kalır: iş düğmeleri, işler panelden başlatılamıyorsa komut yedeğiyle
 * (`JobCommand`); toplamayı da yapan tek komut "Başlat"ın yedeğindedir, bu yüzden "Hesaba bak"ın ayrı yedeği yoktur.
 */
export function FirstStepsCard({ workspace, workspaceName }: { workspace: WorkspaceCommandRef; workspaceName: string }) {
  return (
    <Card id={FIRST_STEPS_ID} data-testid="first-steps">
      <CardHeader>
        <CardTitle>İlk adımlar: {workspaceName}</CardTitle>
        <CardDescription>Bu hesap henüz boş. {ONBOARDING_TODAY_BODY_PLAIN.waiting}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <Link href={ROUTES.onboarding} data-slot="first-steps-start" className={cn(linkButtonClass("default", "touch"), "h-12 w-full px-5 text-[0.9375rem] font-semibold sm:w-fit")}>
          {ONBOARDING_TODAY_PLAIN.waiting}
          <ArrowRight aria-hidden />
        </Link>
        <details className="rounded-lg border px-3 py-2" data-slot="first-steps-manual">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium">Elle ilerlemek istersen (yönetici)</summary>
          <div className="flex flex-col gap-4 pt-2 pb-1">
            <div className="flex flex-col gap-1.5">
              <p className="font-medium">1. Rakip ekle</p>
              <p className="text-muted-foreground">
                <Link href={ROUTES.competitors} className="underline underline-offset-2">
                  Rakipler
                </Link>{" "}
                sayfasından izlemek istediğin hesapları ekle.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="font-medium">2. Önce bak (ücretsiz)</p>
              <p className="text-muted-foreground">Hiçbir şey çağrılmaz, yazılmaz; yalnız haftalık turda hangi adımların yapılacağını gösterir.</p>
              <JobCommand request={{ kind: "routine", dryRun: true }} workspace={workspace} lead={COMMAND_LEAD} quietWhenBlocked />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="font-medium">3. Veriyi getir ve turu başlat</p>
              <p className="text-muted-foreground">
                Yeni veri getirmek para harcar: önce ne kadar tutacağını görürsün, tutarı sen onaylarsın. Tur, gelen videoları inceler; planı ve
                notları hazırlar.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
                <JobCommand request={{ kind: "collect" }} command={false} quietWhenBlocked />
                <JobCommand
                  request={{ kind: "routine" }}
                  label="Başlat"
                  variant="outline"
                  workspace={workspace}
                  lead={COMMAND_LEAD}
                  flags={`--apify-max=${EXAMPLE_APIFY_MAX_USD}`}
                  note={
                    <Alert>
                      <Terminal aria-hidden />
                      <AlertTitle>Para harcar</AlertTitle>
                      <AlertDescription>
                        Bu komut Apify&apos;da gerçek harcama yapar; tutarı (<code>--apify-max</code>, USD) sen belirlersin. Panel bunu
                        kendiliğinden başlatmaz: komutu terminalde sen çalıştırırsın.
                      </AlertDescription>
                    </Alert>
                  }
                />
              </div>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
