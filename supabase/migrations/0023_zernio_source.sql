-- panel — ölçüm kaynağı: Zernio (kendi hesap analitiği, ücretsiz). Yalnız EKLEMELİ: iki `source` kısıtına 'zernio' eklenir.
-- Veri değişmez; eski kısıt değerleri korunur, bu yüzden mevcut satırlar yeni kısıtı geçer.

alter table public.metric_snapshots drop constraint metric_snapshots_source_check;
alter table public.metric_snapshots
  add constraint metric_snapshots_source_check check (source in ('apify', 'graph_api', 'youtube_api', 'zernio'));

alter table public.account_snapshots drop constraint account_snapshots_source_check;
alter table public.account_snapshots
  add constraint account_snapshots_source_check check (source in ('apify', 'graph_api', 'youtube_api', 'zernio'));
