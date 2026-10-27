-- 0013_workspace_create testi: create_workspace atomikliği, slug çakışması, varsayılanlar ve yetki.
-- Fixture (_fixture.sql): A-owner = aaaaaaaa-…-a1 (auth.users'ta var); çalışma alanları test-a / test-b.

-- ── Yetki: yalnız service role çağırabilir ─────────────────────────────────────
select tap.ok(has_function_privilege('service_role', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text)', 'execute')
  and not has_function_privilege('anon', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text)', 'execute'),
  'create_workspace yalnız service role''a açık');

-- ── Tek işlemde dört kayıt + varsayılanlar ─────────────────────────────────────
create temp table _created on commit drop as
  select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', '  Yeni Marka ', 'yeni-marka', 'Europe/Istanbul', 'America/New_York', 'Niş özeti', 'TR_US', 'instagram', 'yeni.marka');
select tap.eq($$select slug from _created$$, 'yeni-marka', 'slug olduğu gibi (çakışma yok)');
select tap.eq($$select name from _created$$, 'Yeni Marka', 'ad kırpılır');
select tap.eq($$select count(*)::text from public.workspace_members m join _created c on c.id = m.workspace_id
  where m.user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' and m.role = 'owner'$$, '1', 'sahip üyelik yazıldı');
select tap.eq($$select count(*)::text from public.social_accounts s join _created c on c.id = s.workspace_id
  where s.handle = 'yeni.marka' and s.platform = 'instagram' and s.connection = 'scrape_only' and s.followers is null$$, '1', 'kendi hesap scrape_only, ölçülemeyen alanlar NULL');
select tap.eq($$select count(*)::text from public.alert_settings a join _created c on c.id = a.workspace_id$$, '1', 'uyarı ayarı satırı yazıldı');
select tap.eq($$select apify_monthly_cap_usd::text from _created$$, '10.000000', 'Apify tavanı tablo varsayılanı');
select tap.eq($$select coalesce(measure_monthly_cap_usd::text, 'NULL') from _created$$, 'NULL', 'ölçüm tavanı onaysız (NULL)');
select tap.eq($$select compliance_region || '/' || audience_timezone || '/' || niche_brief from _created$$, 'TR_US/America/New_York/Niş özeti', 'bölge, hedef kitle saat dilimi, niş yazıldı');
select tap.eq($$select count(*)::text from public.competitors c join _created w on w.id = c.workspace_id$$, '0', 'rakip yok: yeni çalışma alanı boş doğar');
select tap.eq($$select count(*)::text from public.collection_runs r join _created w on w.id = r.workspace_id$$, '0', 'koşu yok: toplama kendiliğinden başlamaz');

-- ── İsteğe bağlı alanlar boş dize/NULL: varsayılanlar ──────────────────────────
create temp table _minimal on commit drop as
  select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Asgari', 'asgari', '', '', '', '', 'instagram', 'asgari');
select tap.eq($$select timezone || '/' || coalesce(audience_timezone, 'NULL') || '/' || coalesce(niche_brief, 'NULL') || '/' || compliance_region from _minimal$$,
  'Europe/Istanbul/NULL/NULL/TR', 'boş dizeler = verilmedi (varsayılan / NULL)');

-- ── Slug çakışması: -2, -3 ─────────────────────────────────────────────────────
select tap.eq($$select slug from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Yeni Marka', 'yeni-marka', '', '', '', '', 'instagram', 'yeni.marka2')$$, 'yeni-marka-2', 'slug çakışınca -2');
select tap.eq($$select slug from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Yeni Marka', 'yeni-marka', '', '', '', '', 'instagram', 'yeni.marka3')$$, 'yeni-marka-3', 'ikinci çakışmada -3');
select tap.eq($$select slug from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Uzun', repeat('a', 60), '', '', '', '', 'instagram', 'uzun1')$$, repeat('a', 60), '60 karakterlik slug kabul');
select tap.eq($$select length(slug)::text from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Uzun', repeat('a', 60), '', '', '', '', 'instagram', 'uzun2')$$, '62', 'uzun slug sonek eklenince 63 sınırını aşmaz');

-- ── Atomiklik: hata olursa HİÇBİR kayıt kalmaz ─────────────────────────────────
-- (a) kendi hesap adımı düşer (handle kısıtı) → çalışma alanı + üyelik geri alınır.
select tap.throws('23514', $$select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Bozuk Hesap', 'bozuk-hesap', '', '', '', '', 'instagram', 'BÜYÜK HARF!')$$,
  'geçersiz kullanıcı adı reddedilir', 'social_accounts_handle_check');
select tap.eq($$select count(*)::text from public.workspaces where slug = 'bozuk-hesap'$$, '0', 'hesap adımı düşünce çalışma alanı kalmadı');
select tap.eq($$select count(*)::text from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where w.name = 'Bozuk Hesap'$$, '0', 'üyelik de kalmadı');
-- (b) üyelik adımı düşer (kullanıcı yok) → çalışma alanı geri alınır.
select tap.throws('23503', $$select * from public.create_workspace('99999999-0000-4000-8000-000000000000', 'Hayalet', 'hayalet', '', '', '', '', 'instagram', 'hayalet')$$,
  'olmayan kullanıcıya üyelik yazılamaz', 'workspace_members_user_id_fkey');
select tap.eq($$select count(*)::text from public.workspaces where slug = 'hayalet'$$, '0', 'üyelik adımı düşünce çalışma alanı kalmadı');
-- (c) geçersiz uyum bölgesi → hiçbir şey yazılmaz.
select tap.throws('23514', $$select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Bölge', 'bolge', '', '', '', 'EU', 'instagram', 'bolge')$$,
  'geçersiz uyum bölgesi reddedilir', 'workspaces_compliance_region_check');
select tap.eq($$select count(*)::text from public.workspaces where slug = 'bolge'$$, '0', 'bölge hatasında çalışma alanı kalmadı');
-- (d) zorunlu argüman eksik.
select tap.throws('22023', $$select * from public.create_workspace(null, 'Ad', 'ad', '', '', '', '', 'instagram', 'ad')$$, 'sahip kullanıcı zorunlu');

-- ── Mevcut çalışma alanları etkilenmez ─────────────────────────────────────────
select tap.eq($$select count(*)::text from public.workspaces where slug in ('test-a', 'test-b')$$, '2', 'fixture çalışma alanları yerinde');
