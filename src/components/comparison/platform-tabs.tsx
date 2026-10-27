"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface PlatformTab {
  value: string;
  label: string;
  content: ReactNode;
}

/**
 * Platform sekmeleri: aynı hesabın iki platformdaki sütunları tek tabloda 8 sütuna çıkmasın diye her platform kendi tablosunda gösterilir.
 * Tek platform varsa sekme çizilmez. İçerik sunucuda hazırlanıp verilir; yalnız etkin sekme görünür.
 */
export function PlatformTabs({ tabs, label }: { tabs: readonly PlatformTab[]; label: string }) {
  const [only] = tabs;
  if (tabs.length === 1 && only) return <>{only.content}</>;
  return (
    <Tabs defaultValue={only?.value} className="gap-3">
      <TabsList aria-label={label} className="h-auto w-full justify-start sm:w-fit">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="min-h-tap px-4 md:min-h-8">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
