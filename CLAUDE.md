# Bu klasör: sosyal panel (müşteri kopyası)

Kısa video (Instagram, TikTok) içerik paneli: kendi hesabını izler, rakipleri tarar, tutan videoları inceler, plan ve çekim fişi çıkarır. Müşteri bu klasörü kendi bilgisayarında, kendi hesaplarıyla (Claude, Supabase, Apify) kullanır.

## Ne yapacaksın
- **"Kur" denirse:** `KURULUM.md` dosyasını baştan sona sırayla uygula. Önce o dosyanın "Sana düşen" kısmını müşteriye kısaca anlat.
- **Panelin nasıl kullanıldığı sorulursa:** `KULLANIM.md` dosyasından anlat. Müşteri yazılımcı değil; teknik terim kullanma, sade Türkçe yaz.
- **Sorun olursa:** önce `npm run kurulum -- denetle` çalıştır, çıktısındaki eksiği düzelt. Sonra `KURULUM.md` "Sorun giderme" bölümüne bak.
- **Günlük işi elle çalıştırmak için:** `npm run gunluk` (önce `-- --dry-run` ile dene).

## Kurallar
- Para harcayan adımı (Apify toplama, ücretli çağrılar) başlatmadan önce müşteriye sor; tutarı ve ne kadar sürdüğünü söyle. Aylık otomatik tavan 4,5 $'dır; müşteri istemeden artırma.
- Veritabanını silme ya da sıfırlama komutlarını çalıştırma (`db reset` yok). Tablolar yalnız eklemeli kurulur.
- `.env.local` içindeki anahtarları ekrana yazma, sohbete yapıştırma, başka dosyaya kopyalama. `.env.local` git'e girmez.
- Anthropic API anahtarı koyma: Claude işleri müşterinin girişli aboneliğiyle çalışır.
- Paylaşımı panel yapmaz; paylaşım ve video üretimi bu paketin dışındadır.
- Kodu müşteri istemeden değiştirme. İstediği bir değişiklik varsa küçük adımlarla yap, `npm run typecheck` ve `npm test -- --maxWorkers=2` çalıştır.
- Testleri tek seferde ve işçi sınırıyla koştur (`--maxWorkers=2`); bilgisayar yavaşlamasın.

## Teknik not (yalnız kod değişikliği gerekirse)
Next.js'in bu sürümünde eski bildiğin bazı kurallar değişmiştir (ör. `params` bir Promise'tir). Kod yazmadan önce `node_modules/next/dist/docs/` altındaki ilgili rehberi oku. Veri yalnız `src/lib/data` üzerinden okunur; ölçülemeyen değer sıfır gösterilmez ("—" ve sebep). Dosya adları İngilizce, ekran metni Türkçe.
