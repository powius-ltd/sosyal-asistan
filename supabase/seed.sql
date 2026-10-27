-- panel — lokal tohum verisi (`npm run db:reset` sonrası otomatik çalışır; tekrar çalıştırılabilir).
-- SABİT UUID'ler: seed her seferinde aynı kimlikleri üretir (env: LOCAL_WORKSPACE_ID, LOCAL_USER_ID).
--   workspace                    7a3f0000-0000-4000-8000-000000000001   (Ornek)
--   yerel kullanıcı (owner)      7a3f0000-0000-4000-8000-000000000a01
--   @ornekhesap (kendi)       7a3f0000-0000-4000-8000-000000000b01
--   @ornekrakipbir                7a3f0000-0000-4000-8000-000000000c01
--   @ornekrakipiki                 7a3f0000-0000-4000-8000-000000000c02
--   @ornekrakipuc            7a3f0000-0000-4000-8000-000000000c03
--   @ornekrakipdort (aday)           7a3f0000-0000-4000-8000-000000000c04
-- Faz 1'de giriş ekranı yok: sunucu service role + bu workspace ile çalışır. Yerel kullanıcı, yayın onayı kaydının
-- (publish_jobs.approved_by) yazılabilmesi için vardır; parolası yoktur, giriş yapamaz. Faz 3.5'te gerçek hesap
-- oluşturulunca bu satır silinebilir ya da parolası admin API ile verilebilir.
-- Ölçülemeyen alanlar (takipçi sayısı, görünen ad …) NULL bırakılır; ilk toplamada dolar.

-- Yerel kullanıcı (handle_new_user trigger'ı profiles satırını açar).
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '7a3f0000-0000-4000-8000-000000000a01',
  'authenticated', 'authenticated', 'yerel@panel.local', now(),
  '', '', '', '',
  '{"provider": "email", "providers": ["email"]}', '{"display_name": "Yerel kullanıcı"}', now(), now()
)
on conflict (id) do nothing;

-- Hedef kitle ABD (kullanıcı kararı, Faz 2): audience_timezone = America/New_York, uyum bölgesi TR_US. Mevcut veritabanında
-- aynı iki alan 0007_intel_v2.sql içinde güncellenir (idempotent).
insert into public.workspaces (id, name, slug, timezone, audience_timezone, compliance_region, niche_brief)
values (
  '7a3f0000-0000-4000-8000-000000000001',
  'Ornek',
  'ornek',
  'Europe/Istanbul',
  'America/New_York',
  'TR_US',
  'Danışmanlık; İngilizce içerik, ABD hedefli; kadın girişimcilere hizalanma/yenilenme programları'
)
on conflict (id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role)
values ('7a3f0000-0000-4000-8000-000000000001', '7a3f0000-0000-4000-8000-000000000a01', 'owner')
on conflict (workspace_id, user_id) do nothing;

-- Kendi hesap: resmi API bağlantısı yok (Faz 3'e kadar yalnız herkese açık kazıma).
insert into public.social_accounts (id, workspace_id, platform, handle, connection)
values (
  '7a3f0000-0000-4000-8000-000000000b01',
  '7a3f0000-0000-4000-8000-000000000001',
  'instagram', 'ornekhesap', 'scrape_only'
)
on conflict (id) do nothing;

-- Rakipler: İngilizce/ABD seti izlenir; @ornekrakipdort Türkçe alternatif olarak aday (candidate) — izleme kararı kullanıcıda.
insert into public.competitors (id, workspace_id, platform, handle, status, source)
values
  ('7a3f0000-0000-4000-8000-000000000c01', '7a3f0000-0000-4000-8000-000000000001', 'instagram', 'ornekrakipbir', 'tracked', 'manual'),
  ('7a3f0000-0000-4000-8000-000000000c02', '7a3f0000-0000-4000-8000-000000000001', 'instagram', 'ornekrakipiki', 'tracked', 'manual'),
  ('7a3f0000-0000-4000-8000-000000000c03', '7a3f0000-0000-4000-8000-000000000001', 'instagram', 'ornekrakipuc', 'tracked', 'manual'),
  ('7a3f0000-0000-4000-8000-000000000c04', '7a3f0000-0000-4000-8000-000000000001', 'instagram', 'ornekrakipdort', 'candidate', 'manual')
on conflict (id) do nothing;

-- Uyarı ayarları: tablo varsayılanları (DEFAULT_ALERT_SETTINGS ile aynı).
insert into public.alert_settings (workspace_id)
values ('7a3f0000-0000-4000-8000-000000000001')
on conflict (workspace_id) do nothing;
