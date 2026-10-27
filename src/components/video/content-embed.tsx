"use client";

import { Play, VideoOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Video/kapak: YALNIZ platformun resmi gömme (embed) sayfası ve YALNIZ kullanıcı tıklayınca yüklenir (kullanıcı kararı). İlk görünümde
 * sadece "<Platform> oynatıcısında aç" düğmesi vardır; iframe tıklamadan önce DOM'da yoktur (platforma hiçbir istek gitmez).
 * Rakip CDN görseli `<img>` ile kullanılmaz, süreli CDN adresi hiçbir yerde gösterilmez. Platforma dallanmaz: gömme adresini sayfa
 * `PlatformModule.embedUrl(permalink)` ile türetip verir; türetilemezse (`embedUrl` yok) oynatıcı sunulmaz.
 */
export function ContentEmbed({ embedUrl, platformLabel, title }: { embedUrl?: string; platformLabel: string; title: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Video</CardTitle>
        <CardDescription>{platformLabel} resmi oynatıcısı; tıklayınca yüklenir.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        {!embedUrl ? (
          <div className="flex w-full flex-col items-center gap-2 rounded-lg bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
            <VideoOff className="size-6" aria-hidden />
            <p>Bu içerik için gömülü oynatıcı yok: herkese açık {platformLabel} adresi bulunamadı.</p>
          </div>
        ) : loaded ? (
          <iframe
            src={embedUrl}
            title={title}
            className="h-[640px] w-full max-w-[420px] rounded-lg border bg-background"
            allow="encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div className="flex w-full flex-col items-center gap-3 rounded-lg bg-muted px-4 py-8 text-center">
            <Button type="button" onClick={() => setLoaded(true)}>
              <Play aria-hidden />
              {platformLabel} oynatıcısında aç
            </Button>
            <p className="max-w-xs text-xs text-muted-foreground">
              Düğmeye basınca {platformLabel} gömme sayfası yüklenir; o ana kadar {platformLabel} tarafına istek gitmez.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
