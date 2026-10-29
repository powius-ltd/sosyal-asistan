-- panel — 0034: `produce` iş türü (SPN-33 "Hat H1: kapı"). YALNIZ EKLEMELİ: `panel_jobs` kısıtlarında tür listesi genişler; veri silmez.
-- Şema ↔ domain: src/lib/domain/panel-job.ts (`JOB_KINDS`, `JOB_KIND_SPEC.produce`). Uygulama: `npx -y supabase@2.118.0 migration up --local` (db reset YOK).
--
-- `produce`: fişteki "Üretime gönder" düğmesinin işi. Fişi stüdyonun sipariş klasörüne `onay: evet` ile yazar, stüdyoyu sabit argümanla
-- çalıştırır, biter bitmez o siparişin dönüşünü koşturur (yayın satırı `awaiting_approval` + panel fişi `uretildi` / `hata`). Stüdyo ses
-- için ücretli sağlayıcı kullanır: HARCAMA TÜRÜDÜR. Kuru koşu YOK (`panel_jobs_dry_run_kind` değişmez), USD onayı (`one_time`) ister
-- (KISIT 1: kredi onayı yetmez) ve onay kaydı taşıyabilir (KISIT 2). Parametre `params.orderId` panel fişinin kimliğidir (jsonb, ek sütun yok).

alter table public.panel_jobs
  drop constraint panel_jobs_kind_check,
  add constraint panel_jobs_kind_check check (kind in ('routine', 'collect', 'measure', 'analyze', 'label', 'plan', 'briefing', 'onboarding', 'measure_zernio', 'discover', 'order', 'order_return', 'publish', 'ads_sync', 'produce')),
  drop constraint panel_jobs_spend_needs_approval,
  add constraint panel_jobs_spend_needs_approval check (dry_run or kind not in ('collect', 'measure', 'onboarding', 'discover', 'produce') or (approval_basis is not null and approval_basis <> 'credits')),
  drop constraint panel_jobs_approval_scope,
  add constraint panel_jobs_approval_scope check (approval_basis is null or (not dry_run and (approval_basis = 'credits' or kind in ('collect', 'measure', 'routine', 'onboarding', 'discover', 'produce'))));
comment on constraint panel_jobs_spend_needs_approval on public.panel_jobs
  is 'Onaysız harcama yok: collect/measure/onboarding/discover/produce işi kuru koşu değilse USD onayı ister; kredi onayı yetmez.';
