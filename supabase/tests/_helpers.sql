-- Test yardımcıları (minik assert kütüphanesi; pgTAP gerekmez). scripts/db-test.mjs her test dosyasının başına ekler;
-- transaction içinde yaratılır, ROLLBACK ile kalkar. Fonksiyonlar security INVOKER'dır: ifadeler çağıranın rolüyle
-- (postgres / authenticated / anon / service_role) çalışır, böylece yetki ve RLS gerçekten sınanır.
-- Başarı `raise notice 'ok - …'` ile bildirilir; başarısızlık `raise exception 'FAIL: …'` ile dosyayı durdurur.

create schema tap;
grant usage on schema tap to public;

-- İstek kimliği: PostgREST'in `request.jwt.claims` ayarını taklit eder (auth.uid() bunu okur).
create function tap.claims(p_uid uuid, p_role text default 'authenticated') returns text
language sql immutable as $$
  select json_build_object('sub', p_uid, 'role', p_role)::text
$$;

create function tap.ok(p_cond boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'ok - %', p_label;
end;
$$;

-- Sorgu tek değer döner (metne çevrilir); beklenen değerle karşılaştırılır (NULL = 'NULL' değil, gerçek NULL için p_want NULL ver).
create function tap.eq(p_query text, p_want text, p_label text) returns void
language plpgsql as $$
declare
  v_got text;
begin
  execute p_query into v_got;
  if v_got is distinct from p_want then
    raise exception 'FAIL: % — beklenen %, gelen % [%]', p_label, coalesce(p_want, 'NULL'), coalesce(v_got, 'NULL'), p_query;
  end if;
  raise notice 'ok - %', p_label;
end;
$$;

-- UPDATE/DELETE/INSERT kaç satır etkiledi.
create function tap.affects(p_rows integer, p_stmt text, p_label text) returns void
language plpgsql as $$
declare
  v_n integer;
begin
  execute p_stmt;
  get diagnostics v_n = row_count;
  if v_n <> p_rows then
    raise exception 'FAIL: % — % satır beklendi, % etkilendi', p_label, p_rows, v_n;
  end if;
  raise notice 'ok - %', p_label;
end;
$$;

-- İfade beklenen SQLSTATE ile hata vermeli (istenirse ileti/ayrıntı/kısıt adı bir metin içermeli).
create function tap.throws(p_sqlstate text, p_stmt text, p_label text, p_match text default null) returns void
language plpgsql as $$
declare
  v_state text;
  v_text text;
begin
  begin
    execute p_stmt;
  exception when others then
    get stacked diagnostics v_text = message_text;
    v_state := sqlstate;
    declare
      v_detail text;
      v_constraint text;
    begin
      get stacked diagnostics v_detail = pg_exception_detail, v_constraint = constraint_name;
      v_text := concat_ws(' | ', v_text, v_detail, v_constraint);
    end;
    if v_state <> p_sqlstate then
      raise exception 'FAIL: % — beklenen SQLSTATE %, gelen % (%)', p_label, p_sqlstate, v_state, v_text;
    end if;
    if p_match is not null and position(p_match in v_text) = 0 then
      raise exception 'FAIL: % — hata iletisinde "%" yok: %', p_label, p_match, v_text;
    end if;
    raise notice 'ok - %', p_label;
    return;
  end;
  raise exception 'FAIL: % — hata beklendi ama ifade başarılı oldu', p_label;
end;
$$;
