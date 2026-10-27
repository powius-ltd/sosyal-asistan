-- panel — 0028: stüdyo dönüşü + yayın (iş 13). YALNIZ EKLEMELİ: `publish_jobs.order_id` (NULL'lu yeni sütun) + kısmi benzersiz indeks,
-- `panel_jobs_kind_check`'e iki yeni tür (`order_return`, `publish`). `publish_jobs_guard` ve onay CHECK'leri (0004) DEĞİŞMEZ: her yayın hâlâ
-- `awaiting_approval → approved` insan onayından geçer. Mevcut satırlara dokunmaz. Uygulama: `npx -y supabase@2.118.0 migration up --local` (db reset YOK).
-- Şema ↔ domain: src/lib/domain/publish.ts (`PublishJob.orderId`), src/lib/domain/panel-job.ts (`JOB_KINDS`).
--
-- 1) `order_id`: stüdyo fişinin `siparis_id`'si. Dönüş işi (`order_return`) bir fişten tek yayın satırı açar: (çalışma alanı, sipariş) AKTİF satır
--    tekildir. Başarısız / iptal / süresi dolmuş satır tekilliğe girmez (elle yeniden açılabilir); taramanın "bu fiş işlendi mi" sorusu ise
--    durumdan bağımsız satır arar, yani başarısız fiş kendiliğinden yeniden açılmaz.
-- 2) `order_return` ($0: fiş klasörünü okur, yayın satırı + bildirim yazar) ve `publish` (onaylı satırı Zernio'ya zamanlar; Zernio ücreti panelden
--    geçmez) iş türleri: onay alanı taşımaz, önizlemesi yoktur (`panel_jobs_dry_run_kind` değişmez, KISIT 1 / KISIT 2 türleri değişmez).

alter table public.publish_jobs
  add column order_id text check (order_id is null or (btrim(order_id) <> '' and char_length(order_id) <= 120));
comment on column public.publish_jobs.order_id is 'Stüdyo sipariş fişinin siparis_id değeri (dönüş işi yazar). NULL = fişsiz (elle açılmış) yayın.';

create unique index publish_jobs_workspace_order_idx on public.publish_jobs (workspace_id, order_id)
  where order_id is not null and status not in ('failed', 'cancelled', 'expired');

alter table public.panel_jobs
  drop constraint panel_jobs_kind_check,
  add constraint panel_jobs_kind_check check (kind in ('routine', 'collect', 'measure', 'analyze', 'label', 'plan', 'briefing', 'onboarding', 'measure_zernio', 'discover', 'order', 'order_return', 'publish'));
