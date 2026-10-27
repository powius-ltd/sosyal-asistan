-- 0015_account_type testi: hesap türü sütunu (varsayılan, kontrol, sütun yetkisi), create_workspace aşırı yüklemeleri (11 / 10 / 9 parametre)
-- ve konu kümesi tablosu (anahtar/etiket sınırı, bileşik FK kiracı tutarlılığı, cascade/set null, upsert, RLS).
-- Fixture (_fixture.sql): A-owner = …a1, A-editor = …a2, A-viewer = …a3; çalışma alanları test-a / test-b; A'nın kendi içeriği …d1, rakip içeriği …d2,
-- koşu …f1; B tarafı bbbbbbbb-….

-- ── Sütun: varsayılan business, yalnız business/creator/mixed ───────────────────
select tap.eq($$select account_type from public.workspaces where slug = 'test-a'$$, 'business', 'mevcut çalışma alanı varsayılan business (migration veriye dokunmaz)');
select tap.eq($$update public.workspaces set account_type = 'creator' where slug = 'test-a' returning account_type$$, 'creator', 'creator kabul');
select tap.eq($$update public.workspaces set account_type = 'mixed' where slug = 'test-a' returning account_type$$, 'mixed', 'mixed (karma) kabul');
select tap.eq($$update public.workspaces set account_type = 'business' where slug = 'test-a' returning account_type$$, 'business', 'business kabul');
select tap.throws('23514', $$update public.workspaces set account_type = 'agency' where slug = 'test-a'$$, 'bilinmeyen tür reddedilir', 'workspaces_account_type_check');
select tap.throws('23514', $$update public.workspaces set account_type = 'Creator' where slug = 'test-a'$$, 'büyük harf reddedilir', 'workspaces_account_type_check');
select tap.throws('23514', $$update public.workspaces set account_type = '' where slug = 'test-a'$$, 'boş dize reddedilir', 'workspaces_account_type_check');
select tap.throws('23502', $$update public.workspaces set account_type = null where slug = 'test-a'$$, 'NULL reddedilir (zorunlu)');

-- ── create_workspace (11 parametre): tür yazılır, boş dize/NULL = business ──────
select tap.eq($$select account_type from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Üretici', 'uretici', '', '', '', 'TR', 'instagram', 'uretici.hesap', 'tr', 'creator')$$, 'creator', 'tür çalışma alanına yazılır');
select tap.eq($$select account_type from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Boş Tür', 'bos-tur', '', '', '', 'TR', 'instagram', 'bos.tur', '', '')$$, 'business', 'boş dize = business');
select tap.eq($$select account_type from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Null Tür', 'null-tur', '', '', '', 'TR', 'instagram', 'null.tur', null, null)$$, 'business', 'NULL = business');
select tap.eq($$select concat_ws('/', content_language, account_type) from public.workspaces where slug = 'uretici'$$, 'tr/creator', 'tür ve dil birlikte yazılır');
select tap.eq($$select account_type from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Karma Hesap', 'karma-hesap', '', '', '', 'TR', 'instagram', 'karma.hesap', '', 'mixed')$$, 'mixed', 'karma tür çalışma alanına yazılır');

-- ── Eski imzalar bozulmadı: tür business, diğer alanlar 0013/0014 ile aynı ──────
select tap.eq($$select account_type || '/' || coalesce(content_language, 'NULL') from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'On Parametre', 'on-parametre', '', '', '', 'TR', 'instagram', 'on.parametre', 'en')$$, 'business/en', '10 parametreli imza business ile çalışır, dili korur');
select tap.eq($$select account_type || '/' || coalesce(content_language, 'NULL') || '/' || timezone from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Dokuz Parametre', 'dokuz-parametre', '', '', '', '', 'instagram', 'dokuz.parametre')$$, 'business/NULL/Europe/Istanbul', '9 parametreli imza business ile çalışır');
select tap.eq($$select count(*)::text from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where w.slug in ('uretici', 'karma-hesap', 'on-parametre', 'dokuz-parametre') and m.role = 'owner'$$, '4', 'üç imza da sahip üyelik yazar (11 parametreli iki çağrı dahil)');

-- ── Hata: geçersiz tür hiçbir kayıt bırakmaz (atomik) ──────────────────────────
select tap.throws('23514', $$select * from public.create_workspace('aaaaaaaa-0000-4000-8000-0000000000a1', 'Bozuk Tür', 'bozuk-tur', '', '', '', '', 'instagram', 'bozuk.tur', '', 'agency')$$,
  'geçersiz hesap türü reddedilir', 'workspaces_account_type_check');
select tap.eq($$select count(*)::text from public.workspaces where slug = 'bozuk-tur'$$, '0', 'tür hatasında çalışma alanı kalmadı');

-- ── Yetki: üç imza da yalnız service role; tür sütununu yalnız sahip günceller ──
select tap.ok(has_function_privilege('service_role', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text, text, text)', 'execute'),
  '11 parametreli create_workspace yalnız service role''a açık');
select tap.ok(has_function_privilege('service_role', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text, text)', 'execute'),
  '10 parametreli imza yetkisi korunur (yalnız service role)');
select tap.ok(has_function_privilege('service_role', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_workspace(uuid, text, text, text, text, text, text, public.platform, text)', 'execute'),
  '9 parametreli imza yetkisi korunur (yalnız service role)');
select tap.ok(has_column_privilege('authenticated', 'public.workspaces', 'account_type', 'update') and not has_column_privilege('anon', 'public.workspaces', 'account_type', 'update'),
  'account_type sütun yetkisi: authenticated günceller, anon güncelleyemez');

select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a1'), true);
set local role authenticated;
select tap.affects(1, $$update public.workspaces set account_type = 'creator' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'sahip hesap türünü günceller');
reset role;
select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.affects(0, $$update public.workspaces set account_type = 'business' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'izleyici hesap türünü değiştiremez (RLS: 0 satır)');
reset role;
select tap.eq($$select account_type from public.workspaces where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'creator', 'izleyicinin denemesi türü değiştirmedi');

-- ═══ content_topic_clusters ════════════════════════════════════════════════════
-- ── Şekil kısıtları ────────────────────────────────────────────────────────────
select tap.eq($$select count(*)::text from public.content_topic_clusters where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '1', 'fixture: A''da tek küme satırı var; rakip içerik (…d2) kümelenmemiş = satır yok');
select tap.throws('23505', $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 'baska', 'Başka', 'p')$$,
  'içerik başına tek küme (PK)', 'content_topic_clusters_pkey');
select tap.throws('23514', $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'Sabah Rutini', 'Sabah rutini', 'p')$$,
  'küme anahtarı taksonomi biçimi (küçük harf + alt çizgi)', 'content_topic_clusters_cluster_key_check');
select tap.throws('23514', $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', '1_rutin', 'Rutin', 'p')$$,
  'küme anahtarı harfle başlar', 'content_topic_clusters_cluster_key_check');
select tap.throws('23514', $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', repeat('a', 41), 'Rutin', 'p')$$,
  'küme anahtarı ≤ 40 karakter', 'content_topic_clusters_cluster_key_check');
select tap.throws('23502', $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', null, 'Rutin', 'p')$$,
  'küme anahtarı zorunlu: karar yoksa satır yok');
select tap.throws('23514', $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'rutin', '   ', 'p')$$,
  'küme etiketi boşluktan ibaret olamaz', 'content_topic_clusters_cluster_label_check');
select tap.throws('23514', $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'rutin', repeat('x', 81), 'p')$$,
  'küme etiketi ≤ 80 karakter', 'content_topic_clusters_cluster_label_check');
select tap.affects(1, $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', repeat('a', 40), repeat('x', 80), 'p')$$,
  'anahtar 40, etiket 80 karakterde sınırda kabul edilir');
delete from public.content_topic_clusters where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
select tap.throws('23514', $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'rutin', 'Rutin', ' ')$$,
  'prompt_version boş olamaz', 'content_topic_clusters_prompt_version_check');

-- ── Kiracı tutarlılığı (bileşik FK) ────────────────────────────────────────────
-- B'nin fixture satırı PK çakışması yaratmasın diye geçici kaldırılır (FK testinden sonra aynen geri konur).
delete from public.content_topic_clusters where content_item_id = 'bbbbbbbb-0000-4000-8000-0000000000d1';
select tap.throws('23503', $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version)
  values ('bbbbbbbb-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 'rutin', 'Rutin', 'p')$$,
  'başka çalışma alanının içeriği kümelenemez (bileşik FK)', 'content_topic_clusters_content_fkey');
select tap.throws('23503', $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version, run_id)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'rutin', 'Rutin', 'p', 'bbbbbbbb-0000-4000-8000-0000000000f1')$$,
  'küme başka çalışma alanının koşusuna bağlanamaz (bileşik FK)', 'content_topic_clusters_run_fkey');
insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version, model)
  values ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-000000000001', 'b_kumesi', 'B kümesi', 'cluster-topics-v1', 'claude-test');

-- ── Service role: yazar (upsert = yeniden kümeleme üzerine yazar) ──────────────
set local role service_role;
select tap.affects(1, $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version, model, run_id)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'odak', 'Odak', 'cluster-topics-v1', 'claude-test', 'aaaaaaaa-0000-4000-8000-0000000000f1')$$,
  'service role küme satırını yazar');
select tap.affects(1, $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version, model, clustered_at)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'uyku', 'Uyku ve enerji', 'cluster-topics-v2', 'claude-test', now() + interval '1 minute')
  on conflict (content_item_id) do update set cluster_key = excluded.cluster_key, cluster_label = excluded.cluster_label,
    prompt_version = excluded.prompt_version, model = excluded.model, run_id = excluded.run_id, clustered_at = excluded.clustered_at$$,
  'yeniden kümeleme (upsert) aynı satırı günceller');
reset role;
select tap.eq($$select concat_ws('/', cluster_key, cluster_label, prompt_version, coalesce(run_id::text, 'NULL')) from public.content_topic_clusters where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$,
  'uyku/Uyku ve enerji/cluster-topics-v2/NULL', 'upsert sonucu: yeni küme ve sürüm; run_id yeni koşusuz NULL');
select tap.eq($$select count(*)::text from public.content_topic_clusters where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '2', 'upsert satır çoğaltmaz (A''da 2 içerik kümeli)');

-- Matris okuma yolu: küme başına içerik (indeksle aynı sorgu).
select tap.eq($$select string_agg(content_item_id::text, ',' order by content_item_id) from public.content_topic_clusters where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and cluster_key = 'sabah_rutini'$$,
  'aaaaaaaa-0000-4000-8000-0000000000d1', 'küme anahtarıyla içerik okunur');

-- ── Silme davranışı ────────────────────────────────────────────────────────────
update public.content_topic_clusters set run_id = 'aaaaaaaa-0000-4000-8000-0000000000f1' where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
delete from public.collection_runs where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';
select tap.eq($$select coalesce(run_id::text, 'NULL') from public.content_topic_clusters where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$, 'NULL',
  'koşu silinince küme satırı kalır, run_id NULL olur (set null)');
delete from public.content_items where id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
select tap.eq($$select count(*)::text from public.content_topic_clusters where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$, '0', 'içerik silinince küme satırı da gider (cascade)');

-- ── RLS ────────────────────────────────────────────────────────────────────────
select tap.ok(has_table_privilege('service_role', 'public.content_topic_clusters', 'insert') and has_table_privilege('authenticated', 'public.content_topic_clusters', 'select')
  and not has_table_privilege('authenticated', 'public.content_topic_clusters', 'insert')
  and not has_table_privilege('authenticated', 'public.content_topic_clusters', 'update')
  and not has_table_privilege('authenticated', 'public.content_topic_clusters', 'delete')
  and not has_table_privilege('anon', 'public.content_topic_clusters', 'select'),
  'yetki matrisi: service role yazar, authenticated yalnız okur, anon hiçbir şey');

select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.content_topic_clusters$$, '1', 'viewer yalnız kendi çalışma alanının kümelerini okur');
select tap.eq($$select count(*)::text from public.content_topic_clusters where workspace_id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, '0', 'A üyesi B''nin kümesini görmez');
select tap.throws('42501', $$insert into public.content_topic_clusters (content_item_id, workspace_id, cluster_key, cluster_label, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 'rutin', 'Rutin', 'p')$$, 'authenticated küme yazamaz (yalnız sunucu)');
select tap.throws('42501', $$update public.content_topic_clusters set cluster_key = 'rutin'$$, 'authenticated kümeyi değiştiremez');
select tap.throws('42501', $$delete from public.content_topic_clusters$$, 'authenticated kümeyi silemez');
reset role;

set local role anon;
select tap.throws('42501', $$select count(*) from public.content_topic_clusters$$, 'anon kümeyi okuyamaz (permission denied)');
reset role;
