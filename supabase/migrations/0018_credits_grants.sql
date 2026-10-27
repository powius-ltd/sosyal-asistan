-- panel — 0018: kredi defteri yetkilerinin daraltılması (0017'nin düzeltmesi; 0017 uygulandığı için dosyası değiştirilmedi).
-- YALNIZ yetki + bir trigger; tablo, sütun ve satırlara dokunmaz. Uygulama: `npx -y supabase@2.118.0 migration up --local`.
--
-- Neden: yerel Supabase'de `public` şemasına açılan her tabloya service role'e varsayılan olarak TÜM yetkiler verilir. 0017'deki dar
-- `grant` satırları bunu daraltmaz; "service role defteri güncelleyemez / silemez" kuralı yalnız satır trigger'ına dayanıyordu ve TRUNCATE
-- (satır trigger'ı çalıştırmaz) açık kalıyordu. Burada fazla yetkiler geri alınır ve defterin TRUNCATE'i her rol için kapatılır.
--   · defter + dağılım: service role yalnız okur ve ekler (RPC'ler ekler; FK'nin bağ koparması / cascade tablo sahibi olarak çalışır).
--   · ayırma: service role okur, ekler, günceller (durum geçişi RPC'de; trigger sınırlar); silemez.
--   · hesap: service role okur, ekler, SİLER (hesabın tamamı: test temizliği, ileride hesap kapatma); güncelleyemez.
revoke update, delete, truncate, references, trigger on public.credit_ledger from service_role;
revoke update, delete, truncate, references, trigger on public.credit_hold_allocations from service_role;
revoke delete, truncate, references, trigger on public.credit_holds from service_role;
revoke update, truncate, references, trigger on public.credit_accounts from service_role;
revoke insert, update, delete, truncate, references, trigger on public.credit_lots from service_role;

-- Defter TRUNCATE ile de boşaltılamaz (her rol; `truncate credit_accounts cascade` dahil).
create function private.credit_ledger_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'credit_ledger_immutable' using errcode = '23514', detail = 'Defter boşaltılamaz.';
end;
$$;
revoke all on function private.credit_ledger_no_truncate() from public, anon, authenticated;
create trigger credit_ledger_no_truncate before truncate on public.credit_ledger
  for each statement execute function private.credit_ledger_no_truncate();
