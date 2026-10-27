-- 0014_content_language testi: sütun kısıtı, create_workspace aşırı yüklemesi (10 parametre) ve eski 9 parametreli imzanın devri.
-- Fixture (_fixture.sql): A-owner = aaaaaaaa-…-a1 (auth.users'ta var); çalışma alanları test-a / test-b.

-- ── Sütun: NULL varsayılan, yalnız tr/en ───────────────────────────────────────
select tap.eq($$select coalesce(content_language, 'NULL') from public.workspaces where slug = 'test-a'$$, 'NULL', 'mevcut çalışma alanının dili NULL kalır (migration veriye dokunmaz)');
select tap.eq($$update public.workspaces set content_language = 'tr' where slug = 'test-a' returning content_language$$, 'tr', 'tr kabul');
select tap.eq($$update public.workspaces set content_language = 'en' where slug = 'test-a' returning content_language$$, 'en', 'en kabul');
select tap.eq($$update public.workspaces set content_language = null where slug = 'test-a' returning coalesce(content_language, 'NULL')$$, 'NULL', 'NULL (otomatik) kabul');
select tap.throws('23514', $$update public.workspaces set content_language = 'de' where slug = 'test-a'$$, 'desteklenmeyen dil reddedilir', 'workspaces_content_language_check');
select tap.throws('23514', $$update public.workspaces set content_language = 'TR' where slug = 'test-a'$$, 'büyük harf reddedilir', 'workspaces_content_language_check');
select tap.throws('23514', $$update public.workspaces set content_language = '' where slug = 'test-a'$$, 'boş dize reddedilir (NULL kullanılır)', 'workspaces_content_language_check');

-- ── create_workspace (10 parametre): dil yazılır, boş dize = ayarlanmadı ────────
select tap.eq($$select coalesce(content_language, 'NULL') from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Türkçe Marka', 'turkce-marka', '', '', '', 'TR', 'instagram', 'turkce.marka', 'tr')$$, 'tr', 'dil çalışma alanına yazılır');
select tap.eq($$select coalesce(content_language, 'NULL') from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Boş Dil', 'bos-dil', '', '', '', 'TR', 'instagram', 'bos.dil', '')$$, 'NULL', 'boş dize = ayarlanmadı (NULL)');
select tap.eq($$select coalesce(content_language, 'NULL') from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Null Dil', 'null-dil', '', '', '', 'TR', 'instagram', 'null.dil', null)$$, 'NULL', 'NULL = ayarlanmadı');

-- ── Eski 9 parametreli imza bozulmadı: dil NULL, diğer alanlar 0013 ile aynı ────
select tap.eq($$select coalesce(content_language, 'NULL') || '/' || compliance_region || '/' || timezone from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Eski Çağrı', 'eski-cagri', '', '', '', '', 'instagram', 'eski.cagri')$$, 'NULL/TR/Europe/Istanbul', 'eski imza dil NULL ile çalışır');
select tap.eq($$select count(*)::text from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where w.slug = 'eski-cagri' and m.role = 'owner'$$, '1', 'eski imza da üyelik yazar');

-- ── Hata: geçersiz dil hiçbir kayıt bırakmaz (atomik) ──────────────────────────
select tap.throws('23514', $$select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Bozuk Dil', 'bozuk-dil', '', '', '', '', 'instagram', 'bozuk.dil', 'xx')$$,
  'geçersiz içerik dili reddedilir', 'workspaces_content_language_check');
select tap.eq($$select count(*)::text from public.workspaces where slug = 'bozuk-dil'$$, '0', 'dil hatasında çalışma alanı kalmadı');

-- ── Yetki: iki imza da yalnız service role ─────────────────────────────────────
select tap.ok(has_function_privilege('service_role', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text, text)', 'execute'),
  '10 parametreli create_workspace yalnız service role''a açık');
select tap.ok(has_function_privilege('service_role', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text)', 'execute'),
  'eski 9 parametreli imza yetkisi korunur (yalnız service role)');
