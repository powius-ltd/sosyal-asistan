# Kullanım

## Paneli açmak
Masaüstündeki **Panel** kısayoluna çift tıkla. Siyah bir pencere açılır (kapatma, panel o pencerede çalışır) ve tarayıcıda `http://localhost:3100` adresi gelir. İşin bitince pencereyi kapatabilirsin.
Sorun olursa Claude Code'u bu klasörde aç ve ne gördüğünü yaz.

## Haftalık akış
Panel her gün kendiliğinden bir tur atar: rakiplerin yeni videolarına bakar, senin videolarının sonuçlarını izler, plan günceller. Sen haftada bir şunu yaparsın:
1. **Bugün** ekranı: sırada ne olduğunu söyler. Sarı noktalı kart senden bir şey bekliyordur.
2. **Plan** > Bu hafta: o hafta çekilecek videoların fikirleri. Beğendiğin fikri seç.
3. Seçtiğin fikir için **fiş** yazdır: çekim için gereken her şeyi tek sayfada toplar. Fiş `siparisler/` klasörüne dosya olarak yazılır.
4. Videoyu çekip paylaştıktan sonra bağlantısını panele yapıştır; panel sonucu izler ve sonraki planı ona göre yapar.
5. **Sonuçlar**: hangi videon tuttu, rakiplerin ne yaptı.

Paylaşımı panel yapmaz; videoyu sen (ya da ileride stüdyo paketi) paylaşırsın.

## Sohbet
Sağ alttaki düğme (geniş ekranda sağ sütun) asistanla konuşmak içindir. Sorabilirsin: "Bu hafta neye odaklanayım?", "Geçen haftaki videom neden tutmadı?". İstersen iş de yaptırabilirsin: "bu fikir için fiş yaz". Asistan paylaşım yapmaz ve harcama tavanını değiştirmez.

## Para
Para harcayan tek şey rakip ve hesap verisini toplayan Apify. Panel kendi başına **ayda en çok 4,5 $** harcar (Apify'ın ücretsiz 5 $'ının altında); tavanı aşacak iş başlamaz. Yazı ve video işleri Claude aboneliğinle çalışır, ek ücret çıkmaz; yalnız aboneliğinin kullanım sınırı dolarsa iş ertesi güne kalır. Veritabanı ücretsiz plandadır.
Tavanı değiştirmek için Claude Code'a "aylık tavanı X dolar yap" de.

## Yedek
Panel haftada bir veritabanının yedeğini bu klasördeki `yedek/` dizinine alır (son 4 yedek kalır). Günlük tur ayrıca ücretsiz projenin 7 gün boşta kalıp uyumasını engeller. Bilgisayar uzun süre kapalı kalırsa Supabase panelinden projeyi uyandır.

## Sık sorulanlar
- **Bugün bir şey çıkmadı:** ilk günlerde panel veri toplar; bir iki gün sonra dolar.
- **Yeni hesap eklemek:** üst çubuktaki hesap seçiciden "Hesap ekle".
- **Başka bilgisayara taşımak:** Claude Code'a "bu klasörü yeni bilgisayarda kur" de; veri Supabase'te durduğu için kaybolmaz.
