-- 0011_creative_labels testi: Kreatif Matris etiket tablosu (eksen enum'ları, alıntı sınırı, bileşik FK kiracı tutarlılığı, cascade/set null, upsert, RLS).
-- Fixture (_fixture.sql): A'nın kendi içeriği …d1 ve B'nin …d1 etiketli; A'nın rakip içeriği …d2 henüz etiketlenmemiş.
-- Kimlikler için bkz. _fixture.sql (A: …0001, içerik …d1 (kendi) / …d2 (rakip), koşu …f1; B tarafı bbbbbbbb-…).

-- ── Şekil kısıtları ────────────────────────────────────────────────────────────
select tap.eq($$select count(*)::text from public.content_creative_labels where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '1', 'fixture: A''da tek etiket var; rakip içerik (…d2) etiketlenmemiş = satır yok');
select tap.throws('23505', $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 'kimlik', 'sicak-musteri', 'a', 'f', true, 'p')$$,
  'içerik başına tek etiket (PK)', 'content_creative_labels_pkey');
select tap.throws('23514', $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'ornekmarka', 'sicak-musteri', 'a', 'f', true, 'p')$$,
  'açı yalnız taksonomideki dört değerden biri', 'content_creative_labels_angle_check');
select tap.throws('23514', $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'kimlik', 'bilinmiyor', 'a', 'f', true, 'p')$$,
  'katman yalnız taksonomideki beş değerden biri', 'content_creative_labels_funnel_stage_check');
select tap.throws('23502', $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', null, 'sicak-musteri', 'a', 'f', true, 'p')$$,
  'açı zorunlu: karar yoksa satır yok (etiketlenmemiş hücreye düşmez)');
select tap.throws('23502', $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'kimlik', 'sicak-musteri', 'a', 'f', 'p')$$,
  'evidence_verified zorunlu (varsayılan yok): doğrulama sonucu açıkça yazılır');
select tap.throws('23514', $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'kimlik', 'sicak-musteri', '   ', 'f', true, 'p')$$,
  'açı alıntısı boşluktan ibaret olamaz (her etiket kanıtlı)', 'content_creative_labels_angle_evidence_check');
select tap.throws('23514', $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'kimlik', 'sicak-musteri', 'a', repeat('x', 301), true, 'p')$$,
  'katman alıntısı ≤ 300 karakter', 'content_creative_labels_funnel_evidence_check');
select tap.affects(1, $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'kimlik', 'sicak-musteri', repeat('a', 300), repeat('f', 300), false, 'p')$$,
  'alıntı 300 karakterde sınırda kabul edilir (doğrulanmamış etiket de saklanır)');
delete from public.content_creative_labels where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
select tap.throws('23514', $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'kimlik', 'sicak-musteri', 'a', 'f', true, ' ')$$,
  'prompt_version boş olamaz', 'content_creative_labels_prompt_version_check');

-- ── Kiracı tutarlılığı (bileşik FK) ────────────────────────────────────────────
-- B'nin fixture satırı PK çakışması yaratmasın diye geçici kaldırılır (sonda aynen geri konur).
delete from public.content_creative_labels where content_item_id = 'bbbbbbbb-0000-4000-8000-0000000000d1';
select tap.throws('23503', $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version)
  values ('bbbbbbbb-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 'kimlik', 'sicak-musteri', 'a', 'f', true, 'p')$$,
  'başka çalışma alanının içeriği etiketlenemez (bileşik FK)', 'content_creative_labels_content_fkey');
insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version, model)
  values ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-000000000001', 'kimlik', 'cozum-ariyor', 'B alıntısı', 'B alıntısı', true, 'label-angles-v1', 'claude-test');
select tap.throws('23503', $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version, run_id)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'kimlik', 'sicak-musteri', 'a', 'f', true, 'p', 'bbbbbbbb-0000-4000-8000-0000000000f1')$$,
  'etiket başka çalışma alanının koşusuna bağlanamaz (bileşik FK)', 'content_creative_labels_run_fkey');

-- ── Service role: yazar (upsert = yeniden etiketleme üzerine yazar) ────────────
set local role service_role;
select tap.affects(1, $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version, model, run_id)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'sosyal-kanit', 'urunu-biliyor', 'Üç ayda 12 kilo verdim', 'Hangisini seçmeliyim diyorsan', false, 'label-angles-v1', 'claude-test', 'aaaaaaaa-0000-4000-8000-0000000000f1')$$,
  'service role doğrulanmamış etiketi yazar');
select tap.affects(1, $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version, model, labeled_at)
  values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'kimlik', 'sicak-musteri', 'Biz buradayız', 'Randevu için yaz', true, 'label-angles-v2', 'claude-test', now() + interval '1 minute')
  on conflict (content_item_id) do update set angle = excluded.angle, funnel_stage = excluded.funnel_stage, angle_evidence = excluded.angle_evidence,
    funnel_evidence = excluded.funnel_evidence, evidence_verified = excluded.evidence_verified, prompt_version = excluded.prompt_version,
    model = excluded.model, run_id = excluded.run_id, labeled_at = excluded.labeled_at$$,
  'yeniden etiketleme (upsert) aynı satırı günceller');
reset role;
select tap.eq($$select concat_ws('/', angle, funnel_stage, evidence_verified::text, prompt_version, coalesce(run_id::text, 'NULL')) from public.content_creative_labels where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$,
  'kimlik/sicak-musteri/true/label-angles-v2/NULL', 'upsert sonucu: yeni hücre, doğrulanmış ve yeni sürüm; run_id yeni koşusuz NULL');
select tap.eq($$select count(*)::text from public.content_creative_labels where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '2', 'upsert satır çoğaltmaz (A''da 2 içerik etiketli)');

-- Matris okuma yolu (getCreativeMatrix): kısmi indeksle aynı koşul, yalnız doğrulanmış etiketler.
update public.content_creative_labels set evidence_verified = false where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
select tap.eq($$select string_agg(content_item_id::text, ',') from public.content_creative_labels where workspace_id = 'aaaaaaaa-0000-4000-8000-000000000001' and evidence_verified$$,
  'aaaaaaaa-0000-4000-8000-0000000000d1', 'matris girdisi: yalnız evidence_verified = true satırları');

-- ── Silme davranışı ────────────────────────────────────────────────────────────
update public.content_creative_labels set run_id = 'aaaaaaaa-0000-4000-8000-0000000000f1' where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
delete from public.collection_runs where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';
select tap.eq($$select coalesce(run_id::text, 'NULL') from public.content_creative_labels where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$, 'NULL',
  'koşu silinince etiket kalır, run_id NULL olur (set null)');
delete from public.content_items where id = 'aaaaaaaa-0000-4000-8000-0000000000d2';
select tap.eq($$select count(*)::text from public.content_creative_labels where content_item_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'$$, '0', 'içerik silinince etiket de gider (cascade)');

-- ── RLS ────────────────────────────────────────────────────────────────────────
select tap.ok(has_table_privilege('service_role', 'public.content_creative_labels', 'insert') and has_table_privilege('authenticated', 'public.content_creative_labels', 'select')
  and not has_table_privilege('authenticated', 'public.content_creative_labels', 'insert')
  and not has_table_privilege('authenticated', 'public.content_creative_labels', 'update')
  and not has_table_privilege('authenticated', 'public.content_creative_labels', 'delete')
  and not has_table_privilege('anon', 'public.content_creative_labels', 'select'),
  'yetki matrisi: service role yazar, authenticated yalnız okur, anon hiçbir şey');

select set_config('request.jwt.claims', tap.claims('aaaaaaaa-0000-4000-8000-0000000000a3'), true);
set local role authenticated;
select tap.eq($$select count(*)::text from public.content_creative_labels$$, '1', 'viewer yalnız kendi çalışma alanının etiketlerini okur');
select tap.eq($$select count(*)::text from public.content_creative_labels where workspace_id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, '0', 'A üyesi B''nin etiketini görmez');
select tap.throws('42501', $$insert into public.content_creative_labels (content_item_id, workspace_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version)
  values ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 'kimlik', 'sicak-musteri', 'a', 'f', true, 'p')$$, 'authenticated etiket yazamaz (yalnız sunucu)');
select tap.throws('42501', $$update public.content_creative_labels set angle = 'kimlik'$$, 'authenticated etiketi değiştiremez');
select tap.throws('42501', $$delete from public.content_creative_labels$$, 'authenticated etiketi silemez');
reset role;

set local role anon;
select tap.throws('42501', $$select count(*) from public.content_creative_labels$$, 'anon etiketi okuyamaz (permission denied)');
reset role;
