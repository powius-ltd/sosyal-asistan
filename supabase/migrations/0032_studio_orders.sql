-- panel — paket 28 G1: fiş (stüdyo siparişi) uygulama içinde kalıcı. Plan: docs/isler/28-haftalik-akis/SPEC.md §1.
-- Gerçek veri taşıyan veritabanına `migration up` ile UYGULANIR (db reset YOK): yalnız eklemeli (1 yeni tablo).
-- Fiş = fikrin çekim siparişi. `ticket` stüdyo sözleşmesinin (SIPARIS v2) `ticketSchema` çıktısıdır (zod doğrulaması sunucuda; burada
-- yalnız nesne olduğu ve durumun tutarlı olduğu denetlenir). Yazan yalnız sunucu (service role); üye okur.

create table public.studio_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  idea_id uuid not null,
  -- Hangi haftanın planından / hangi sıradan geldiği (plansız ya da elle fikirde NULL).
  week_start date,
  slot integer check (slot is null or slot >= 0),
  ticket jsonb not null check (jsonb_typeof(ticket) = 'object'),
  -- Serbest not (dosya biçiminde frontmatter sonrası gövde); üretim türü sohbetten değişir, not da.
  note text not null default '' check (char_length(note) <= 4000),
  status text not null default 'taslak' check (status in ('taslak', 'uretiliyor', 'uretildi', 'hata', 'paylasildi')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_orders_ws_id unique (id, workspace_id),
  -- Fiş fikirle AYNI çalışma alanında olmak ZORUNDA (bileşik yabancı anahtar); fikir silinirse fiş de gider.
  constraint studio_orders_idea_fkey foreign key (idea_id, workspace_id) references public.ideas (id, workspace_id) on delete cascade,
  -- Durum sütunu fişin kendi `durum` alanının aynasıdır; ikisi ayrışamaz.
  constraint studio_orders_status_matches_ticket check (status = ticket ->> 'durum')
);
create index studio_orders_workspace_idx on public.studio_orders (workspace_id, week_start);
create index studio_orders_idea_idx on public.studio_orders (idea_id);

-- Fikir başına tek ETKİN fiş. Etkin = `hata` dışındaki her durum (taslak, üretiliyor, üretildi, paylaşıldı): taslak varken ikinci taslak,
-- üretilmiş ya da paylaşılmış fikre yeni fiş açılamaz (çift üretim / çift yayın parası yok). `hata` ile biten fiş etkin sayılmaz: üretim
-- başarısızsa aynı fikir için yeniden fiş yazılabilir. Başka durumlarda yeniden deneme yolu yoktur (bilerek: önce mevcut fiş çözülür).
create unique index studio_orders_one_active_per_idea on public.studio_orders (idea_id) where status <> 'hata';

create trigger studio_orders_set_updated_at before update on public.studio_orders
  for each row execute function private.set_updated_at();

comment on table public.studio_orders is 'Fiş (stüdyo siparişi): fikrin çekim siparişi. ticket = ticketSchema; fikir başına tek etkin (hata dışı) fiş.';

-- ── Yetki + RLS (0029 deseni): istemci rollerine varsayılan yetki kapalı; üye okur, yazan yalnız sunucu ──
grant all on public.studio_orders to service_role;
grant select on public.studio_orders to authenticated;
alter table public.studio_orders enable row level security;
create policy "studio_orders: üye okur" on public.studio_orders for select to authenticated using (workspace_id in (select private.member_workspace_ids()));
