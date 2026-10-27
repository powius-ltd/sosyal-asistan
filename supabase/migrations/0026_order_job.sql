-- Stüdyo siparişi iş türü (`order`): plan öğesinden sipariş fişi dosyası yazar. $0, onaysız, önizlemesiz.
-- Yalnız tür listesi genişler (EKLEMELİ; veri silmez). Harcama / onay kısıtları aynen kalır: `order` onay alanı taşıyamaz.
alter table public.panel_jobs
  drop constraint panel_jobs_kind_check,
  add constraint panel_jobs_kind_check check (kind in ('routine', 'collect', 'measure', 'analyze', 'label', 'plan', 'briefing', 'onboarding', 'measure_zernio', 'discover', 'order'));
