-- panel — 0036: video revizesi (SPN-36). YALNIZ EKLEMELİ: `studio_orders.revision` / `revisions` (varsayılanlı yeni sütunlar), koruma tetikleyicisi,
-- `request_order_revision` RPC'si. Şema ↔ domain: src/lib/domain/studio-order.ts (`StudioOrder.revision`, `revisions`, `ORDER_REVISION_MAX`).
-- Uygulama: `npx -y supabase@2.118.0 migration up --local` (db reset YOK).
--
-- Revize = müşteri paylaşmadan önce videoya not yazıp aynı fişi stüdyoya geri yollar. `revision` 1'den başlar (ilk sürüm), her revizede bir artar;
-- en çok 3 revize (revision <= 4). `revisions[]` eskiyi SAKLAR (değişmez, yalnız eklenir): her eleman { version, orderId, requestedAt, note, video?, cover?,
-- publishJobId } = revize ile yerini yitiren sürümün kaydı. Stüdyoya giden sipariş kimliği sürümü taşır: ilk sürüm `<taban>`, sonrası `<taban>-r<n>`
-- (taban = ilk sürümün kimliği = `revisions[0].orderId`, yoksa fişin kimliği); böylece stüdyo dosyası üstüne yazılmaz.
-- Revize yalnız ÜRETİLMİŞ (`uretildi`) fişte ve yayın satırı onay bekliyorken (`awaiting_approval` ya da `draft`) yapılır; paylaşılmış / onaylanmış /
-- planlanmış video hiçbir yoldan revize edilemez: kural RPC'de VE tetikleyicidedir (RPC'yi atlayan doğrudan yazım da reddedilir).

alter table public.studio_orders
  add column revision integer not null default 1 check (revision between 1 and 4),
  add column revisions jsonb not null default '[]'::jsonb check (jsonb_typeof(revisions) = 'array'),
  add constraint studio_orders_revisions_count check (jsonb_array_length(revisions) = revision - 1);
comment on column public.studio_orders.revision is 'Video sürümü: 1 = ilk sürüm, her revizede +1; en çok 4 (3 revize).';
comment on column public.studio_orders.revisions is 'Revize ile yerini yitiren sürümlerin kaydı (eklemeli): { version, orderId, requestedAt, note, video?, cover?, publishJobId }.';

create function private.studio_orders_revision_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.revision is not distinct from old.revision then
    if new.revisions is distinct from old.revisions then
      raise exception 'order_revision_history_frozen' using errcode = '23514', detail = 'Revize geçmişi yalnız revize anında eklenir.';
    end if;
    return new;
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'order_revision_step' using errcode = '23514', detail = 'Sürüm bir bir artar.';
  end if;
  if old.status <> 'uretildi' then
    raise exception 'order_revision_not_produced' using errcode = '23514', detail = 'Yalnız üretilmiş video revize edilir.';
  end if;
  if exists (
    select 1 from public.publish_jobs j
     where j.workspace_id = old.workspace_id and j.order_id = old.ticket ->> 'siparis_id'
       and j.status in ('approved', 'publishing', 'ready', 'published')
  ) then
    raise exception 'order_revision_published' using errcode = '23514', detail = 'Onaylanmış, planlanmış ya da paylaşılmış video revize edilmez.';
  end if;
  if jsonb_array_length(new.revisions) <> jsonb_array_length(old.revisions) + 1 then
    raise exception 'order_revision_history_frozen' using errcode = '23514', detail = 'Her revize geçmişe tek kayıt ekler.';
  end if;
  return new;
end;
$$;
create trigger studio_orders_revision_guard before update on public.studio_orders
  for each row execute function private.studio_orders_revision_guard();

-- Tek işlemde: eski yayın satırı iptal, geçmişe kayıt, sürüm +1, fiş yeniden taslak (gönderilmeye hazır) ve fişe `revize_notu` + `onceki_video`.
create function public.request_order_revision(p_ws uuid, p_order uuid, p_note text, p_at timestamptz)
returns public.studio_orders
language plpgsql
set search_path = ''
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
  v_order public.studio_orders;
  v_job public.publish_jobs;
  v_old_id text;
  v_base text;
  v_next integer;
  v_ticket jsonb;
begin
  if p_ws is null or p_order is null or p_at is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if char_length(v_note) < 1 or char_length(v_note) > 500 then
    raise exception 'order_revision_note_invalid' using errcode = '22023', detail = 'Revize notu 1–500 karakter olmalı.';
  end if;
  select * into v_order from public.studio_orders where id = p_order and workspace_id = p_ws for update;
  if not found then
    raise exception 'studio_order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'uretildi' or v_order.ticket ->> 'video' is null then
    raise exception 'order_revision_not_produced' using errcode = '23514';
  end if;
  if v_order.revision > 3 then
    raise exception 'order_revision_limit' using errcode = '23514';
  end if;
  v_old_id := v_order.ticket ->> 'siparis_id';
  select * into v_job from public.publish_jobs
   where workspace_id = p_ws and order_id = v_old_id and status in ('awaiting_approval', 'draft')
   for update;
  if not found then
    raise exception 'order_revision_no_pending_publish' using errcode = '23514', detail = 'Yayın satırı onay beklemiyor.';
  end if;

  update public.publish_jobs set status = 'cancelled' where id = v_job.id;

  v_base := coalesce(v_order.revisions -> 0 ->> 'orderId', v_old_id);
  v_next := v_order.revision + 1;
  v_ticket := (v_order.ticket - 'video' - 'kapak' - 'hata_notu' - 'zernio_post_id' - 'yayin_url')
    || jsonb_strip_nulls(jsonb_build_object(
         'siparis_id', v_base || '-r' || v_next,
         'durum', 'taslak',
         'onay', false,
         'revize_notu', v_note,
         'onceki_video', v_order.ticket ->> 'video'));
  update public.studio_orders
     set revision = v_next,
         revisions = v_order.revisions || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
           'version', v_order.revision,
           'orderId', v_old_id,
           'requestedAt', to_char(p_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'note', v_note,
           'video', v_order.ticket ->> 'video',
           'cover', v_order.ticket ->> 'kapak',
           'publishJobId', v_job.id))),
         ticket = v_ticket,
         status = 'taslak'
   where id = p_order
   returning * into v_order;
  return v_order;
end;
$$;
revoke all on function public.request_order_revision(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.request_order_revision(uuid, uuid, text, timestamptz) to service_role;
