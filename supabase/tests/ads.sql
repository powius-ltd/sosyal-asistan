-- 0029_ads testi: reklam tabloları (şekil kısıtları, tekillik, bileşik anahtar, cascade, RLS, ads_sync iş türü).
-- Fixture (_fixture.sql): A çalışma alanı …0001, B çalışma alanı bbbbbbbb-…-0001; kullanıcılar A-viewer …a3; kendi içerik …d1.

-- ── Kurulum + şekil kısıtları (service role) ────────────────────
set local role service_role;
select tap.affects(1, $$insert into public.ad_accounts (id, workspace_id, external_account_id, currency, goal_kind, result_label, target_return, gross_margin)
  values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-000000000001', 'act_1', 'TRY', 'value', 'satın alma', 3, 0.4)$$, 'service role getiri hedefli hesap yazar');
select tap.affects(1, $$insert into public.ad_accounts (id, workspace_id, external_account_id, currency)
  values ('aaaaaaaa-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-000000000001', 'act_2', 'USD')$$, 'hedefsiz hesap geçerli (hedef alanları NULL)');
select tap.affects(1, $$insert into public.ad_accounts (id, workspace_id, external_account_id, currency)
  values ('bbbbbbbb-0000-4000-8000-0000000000e1', 'bbbbbbbb-0000-4000-8000-000000000001', 'act_1', 'USD')$$, 'aynı dış kimlik başka çalışma alanında ayrı satırdır');
select tap.throws('23505', $$insert into public.ad_accounts (workspace_id, external_account_id, currency) values ('aaaaaaaa-0000-4000-8000-000000000001', 'act_1', 'TRY')$$, 'aynı hesap ikinci kez yazılamaz', 'ad_accounts_unique');
select tap.throws('23514', $$insert into public.ad_accounts (workspace_id, external_account_id, currency) values ('aaaaaaaa-0000-4000-8000-000000000001', 'act_3', 'tl')$$, 'para birimi 3 harfli büyük kod olmak zorunda', 'ad_accounts_currency_check');
select tap.throws('23514', $$insert into public.ad_accounts (workspace_id, external_account_id, currency, goal_kind, result_label)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'act_4', 'TRY', 'value', 'satın alma')$$, 'getiri hedefi hedef getirisiz yazılamaz', 'ad_accounts_goal_shape');
select tap.throws('23514', $$insert into public.ad_accounts (workspace_id, external_account_id, currency, goal_kind, result_label, target_cost_per_result)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'act_5', 'TRY', 'bogus', 'form', 10)$$, 'hedef türü value | cost', 'ad_accounts_goal_kind_check');
select tap.throws('23514', $$insert into public.ad_accounts (workspace_id, external_account_id, currency, target_return)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'act_6', 'TRY', 3)$$, 'hedef türü olmadan hedef değer yazılamaz', 'ad_accounts_goal_shape');

select tap.affects(1, $$insert into public.ad_campaigns (id, workspace_id, account_id, external_id, name, status) values ('aaaaaaaa-0000-4000-8000-0000000000e3', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'c1', 'Kampanya', 'active')$$, 'kampanya yazılır');
select tap.throws('23503', $$insert into public.ad_campaigns (workspace_id, account_id, external_id, name) values ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'c9', 'Çapraz')$$, 'başka çalışma alanının hesabına kampanya bağlanamaz (bileşik anahtar)', 'ad_campaigns_account_fkey');
select tap.affects(1, $$insert into public.ad_sets (id, workspace_id, campaign_id, external_id, name, daily_budget) values ('aaaaaaaa-0000-4000-8000-0000000000e4', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e3', 's1', 'Set', 250)$$, 'reklam seti okunan günlük bütçeyle yazılır');
select tap.throws('23514', $$insert into public.ad_sets (workspace_id, campaign_id, external_id, name, daily_budget) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e3', 's2', 'Set', -1)$$, 'günlük bütçe eksi olamaz', 'ad_sets_daily_budget_check');
select tap.affects(1, $$insert into public.ad_creatives (id, workspace_id, account_id, format, source_content_id) values ('aaaaaaaa-0000-4000-8000-0000000000e5', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'video', 'aaaaaaaa-0000-4000-8000-0000000000d1')$$, 'kreatif kendi içeriğine bağlanır');
select tap.throws('23514', $$insert into public.ad_creatives (workspace_id, account_id, format) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'gif')$$, 'kreatif biçimi listede olmak zorunda', 'ad_creatives_format_check');
select tap.affects(1, $$insert into public.ads (id, workspace_id, ad_set_id, creative_id, external_id, name, status) values ('aaaaaaaa-0000-4000-8000-0000000000e6', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e4', 'aaaaaaaa-0000-4000-8000-0000000000e5', 'ad1', 'Reklam', 'active')$$, 'reklam yazılır');
select tap.throws('23503', $$insert into public.ads (workspace_id, ad_set_id, creative_id, external_id, name) values ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e4', null, 'ad9', 'Çapraz')$$, 'başka çalışma alanının setine reklam bağlanamaz', 'ads_ad_set_fkey');

-- ── Günlük ölçü: (reklam, gün) tekil; ölçülmeyen NULL ───────────
select tap.affects(1, $$insert into public.ad_daily_metrics (ad_id, date, workspace_id, spend, impressions, clicks, results) values ('aaaaaaaa-0000-4000-8000-0000000000e6', '2026-10-20', 'aaaaaaaa-0000-4000-8000-000000000001', 12.5, 1000, 20, 1)$$, 'günlük ölçü yazılır');
select tap.affects(1, $$insert into public.ad_daily_metrics (ad_id, date, workspace_id, spend, impressions) values ('aaaaaaaa-0000-4000-8000-0000000000e6', '2026-10-21', 'aaaaaaaa-0000-4000-8000-000000000001', 0, 0)$$, 'tıklama / sonuç NULL olabilir (ölçülemeyen ≠ 0)');
select tap.throws('23505', $$insert into public.ad_daily_metrics (ad_id, date, workspace_id, spend, impressions) values ('aaaaaaaa-0000-4000-8000-0000000000e6', '2026-10-20', 'aaaaaaaa-0000-4000-8000-000000000001', 1, 1)$$, 'yinelenen gün reddedilir', 'ad_daily_metrics_pkey');
select tap.throws('23514', $$insert into public.ad_daily_metrics (ad_id, date, workspace_id, spend, impressions) values ('aaaaaaaa-0000-4000-8000-0000000000e6', '2026-10-22', 'aaaaaaaa-0000-4000-8000-000000000001', -1, 1)$$, 'harcama eksi olamaz', 'ad_daily_metrics_spend_check');
select tap.throws('23503', $$insert into public.ad_daily_metrics (ad_id, date, workspace_id, spend, impressions) values ('aaaaaaaa-0000-4000-8000-0000000000e6', '2026-10-23', 'bbbbbbbb-0000-4000-8000-000000000001', 1, 1)$$, 'ölçü reklamın çalışma alanından başkasına yazılamaz', 'ad_daily_metrics_ad_fkey');
-- B tarafı: başka çalışma alanının görünmezlik testi için bir reklam zinciri.
insert into public.ad_campaigns (id, workspace_id, account_id, external_id, name) values ('bbbbbbbb-0000-4000-8000-0000000000e3', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000e1', 'c1', 'B kampanya');
reset role;

-- ── RLS: üye yalnız kendi çalışma alanını okur, yazamaz; anon göremez ─────────
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.ad_accounts$$, '3', 'viewer yalnız kendi çalışma alanının hesaplarını görür (B hesabı görünmez)');
select tap.eq($$select count(*)::text from public.ad_campaigns$$, '2', 'B kampanyası görünmez');
select tap.eq($$select count(*)::text from public.ad_daily_metrics$$, '3', 'viewer kendi günlük ölçülerini okur');
select tap.throws('42501', $$insert into public.ad_accounts (workspace_id, external_account_id, currency) values ('aaaaaaaa-0000-4000-8000-000000000001', 'x', 'TRY')$$, 'üye hesap yazamaz (yalnız sunucu)');
select tap.throws('42501', $$insert into public.ad_daily_metrics (ad_id, date, workspace_id, spend, impressions) values ('aaaaaaaa-0000-4000-8000-0000000000e6', '2026-11-01', 'aaaaaaaa-0000-4000-8000-000000000001', 1, 1)$$, 'üye ölçü yazamaz');
select tap.throws('42501', $$update public.ad_sets set daily_budget = 999$$, 'üye bütçe değiştiremez');
select tap.throws('42501', $$delete from public.ads$$, 'üye reklam silemez');
reset role;
set local role anon;
select tap.throws('42501', $$select count(*) from public.ad_accounts$$, 'anon reklam hesabını okuyamaz (permission denied)');
reset role;

-- ── İş türü ─────────────────────────────────────────────────
set local role service_role;
select tap.affects(1, $$insert into public.panel_jobs (workspace_id, kind, requested_by) values ('aaaaaaaa-0000-4000-8000-000000000001', 'ads_sync', 'aaaaaaaa-0000-4000-8000-0000000000a1')$$, 'ads_sync iş türü onaysız yazılır ($0)');
select tap.throws('23514', $$insert into public.panel_jobs (workspace_id, kind, requested_by, approval_basis, approved_max_usd) values ('bbbbbbbb-0000-4000-8000-000000000001', 'ads_sync', 'bbbbbbbb-0000-4000-8000-0000000000b1', 'one_time', 1)$$, 'ads_sync onay kaydı taşıyamaz (harcamaz)');
reset role;

-- ── Cascade: çalışma alanı silinince reklam verisi de gider ─────────────────
delete from public.workspaces where id = 'bbbbbbbb-0000-4000-8000-000000000001';
select tap.eq($$select (select count(*) from public.ad_accounts where workspace_id = 'bbbbbbbb-0000-4000-8000-000000000001')::text || '/' || (select count(*) from public.ad_campaigns where workspace_id = 'bbbbbbbb-0000-4000-8000-000000000001')::text$$, '0/0', 'çalışma alanı silinince reklam satırları da gider (cascade)');
-- Kreatif içeriği silinirse bağ kopar, kreatif kalır.
delete from public.content_items where id = 'aaaaaaaa-0000-4000-8000-0000000000d1';
select tap.eq($$select (source_content_id is null)::text from public.ad_creatives where id = 'aaaaaaaa-0000-4000-8000-0000000000e5'$$, 'true', 'içerik silinince kreatifin bağı kopar, kreatif kalır');
