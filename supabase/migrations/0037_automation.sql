-- panel — 0037: otomatik işler (`/otomatik`). YALNIZ EKLEMELİ: `workspaces`'e üç mantıksal sütun. db reset YOK.
-- Şema ↔ domain: src/lib/domain/run.ts (`Workspace.autoWeeklyPlan | autoMeasure | autoProduce`), src/lib/automation/flags.ts (varsayılanlar).
--
-- Anlam: kapalıysa halka (`src/lib/cycle`) o işi kendiliğinden açmaz; kullanıcının elle başlatması etkilenmez.
--   auto_weekly_plan  topla → incele → plan (varsayılan AÇIK: para kapısı ayrıdır, ajan tavanı onaylı değilse zaten harcanmaz)
--   auto_measure      Zernio'dan kendi video sayıları ($0; varsayılan AÇIK)
--   auto_produce      onaylı plandaki fişi stüdyoya gönderip videoyu üretir (para harcar; varsayılan KAPALI, bilerek açılır)

alter table public.workspaces
  add column auto_weekly_plan boolean not null default true,
  add column auto_measure boolean not null default true,
  add column auto_produce boolean not null default false;
comment on column public.workspaces.auto_weekly_plan is 'Halka haftalık planı (topla, incele, plan) kendiliğinden açar mı. Kapalıysa halka toplama / inceleme / etiket / plan işi açmaz.';
comment on column public.workspaces.auto_measure is 'Halka günlük ölçümü (measure_zernio) kendiliğinden açar mı.';
comment on column public.workspaces.auto_produce is 'Halka onaylı plandaki fişi üretime kendiliğinden gönderir mi (para harcar; varsayılan kapalı).';
