-- panel — Kreatif Matris: içerik başına açı + farkındalık katmanı etiketi.
-- Şema ↔ domain eşlemesi: src/lib/domain/creative-matrix.ts (`ContentCreativeLabel`, eksenler); yazan ve okuyan aynı zod şemasını kullanır:
-- src/lib/data/creative-label-schema.ts. Yazan sunucu görevi `label:angles` (service role); matris `getCreativeMatrix` bunlardan türetilir.
-- Gerçek veri taşıyan veritabanına `migration up` ile UYGULANIR (db reset YOK): yalnız eklemeli (yeni tablo); mevcut satırlara dokunmaz.

-- İçerik başına GÜNCEL etiket (yeniden etiketleme üzerine yazar). Eksenler kullanıcının kendi taksonomisinden
-- (`rakip analiz/referans/taksonomi.json`): açı (4) × farkındalık katmanı (5, Schwartz) = 20 hücre.
-- Karar verilemeyen içerik (metin yok, eksenlerden biri belirsiz) → satır YAZILMAZ: satırın yokluğu "etiketlenmedi" demektir,
-- hücreye düşmez (karar verilemez ≠ rastgele bir hücre). Her etiket birebir alıntıyla kanıtlanır.
create table public.content_creative_labels (
  content_item_id uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  angle text not null check (angle in ('sonuc-kazanim', 'aci-korku', 'kimlik', 'sosyal-kanit')),
  funnel_stage text not null
    check (funnel_stage in ('hic-farkinda-degil', 'sorunu-biliyor', 'cozum-ariyor', 'urunu-biliyor', 'sicak-musteri')),
  -- Açıyı / katmanı doğrulayan birebir alıntı (transcript, ekran yazısı ya da açıklamadan); boş olamaz, ≤ 300.
  angle_evidence text not null check (char_length(btrim(angle_evidence)) between 1 and 300),
  funnel_evidence text not null check (char_length(btrim(funnel_evidence)) between 1 and 300),
  -- Her iki alıntı kaynakta bulundu mu (`lib/intel/evidence` denetimi). false ise matrise GİRMEZ ("kanıtsız etiket hücre doldurmaz").
  evidence_verified boolean not null,
  prompt_version text not null check (btrim(prompt_version) <> ''),
  model text,
  -- Etiketlemeyi üreten koşu (abonelik çağrı sayacı); koşu silinirse satır kalır, run_id NULL olur.
  run_id uuid,
  labeled_at timestamptz not null default now(),
  constraint content_creative_labels_content_fkey foreign key (content_item_id, workspace_id)
    references public.content_items (id, workspace_id) on delete cascade,
  constraint content_creative_labels_run_fkey foreign key (run_id, workspace_id)
    references public.collection_runs (id, workspace_id) on delete set null (run_id)
);
-- getCreativeMatrix: workspace'in doğrulanmış etiketleri (tek sorgu).
create index content_creative_labels_verified_idx on public.content_creative_labels (workspace_id, content_item_id) where evidence_verified;
create index content_creative_labels_run_idx on public.content_creative_labels (run_id) where run_id is not null;
alter table public.content_creative_labels enable row level security;

comment on table public.content_creative_labels is 'Kreatif Matris (LLM): içerik başına açı × farkındalık katmanı + birebir alıntı. Satır yok = etiketlenmedi; evidence_verified = false matrise girmez.';

-- ── Yetki + RLS ────────────────────────────────────────────
-- 0006/0007/0008 deseni: istemci rollerine varsayılan yetki kapalı; service role'e açıkça verilir. Üyeler okur, yazan yalnız sunucu.
grant all on public.content_creative_labels to service_role;
grant select on public.content_creative_labels to authenticated;

create policy "content_creative_labels: üye okur" on public.content_creative_labels
  for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
