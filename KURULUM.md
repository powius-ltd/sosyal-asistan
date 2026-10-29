# Kurulum

## Sana düşen (yalnız bunlar)
1. **Supabase hesabı aç** (supabase.com, ücretsiz). Veritabanı projesini Claude açar; sen yalnız tarayıcıda "izin ver" dersin.
2. **Apify hesabı aç** (apify.com, ücretsiz; ayda 5 $ kredi gelir) ve Settings > API & Integrations sayfasından jetonu kopyala.
3. Claude'un söylediği anahtarları (Supabase "service role" anahtarı, Apify jetonu) `.env.local` dosyasına yapıştır. Anahtarı sohbete yazma.
4. Bilgisayarda Claude Code'da giriş yapılmış olmalı (kendi aboneliğin). Gerisini Claude'a bırak: "kur" de.

---

## Claude için: sıralı adımlar
Bu dosyayı baştan sona, sırayla uygula. Tam denetim 8. adımdadır (`npm run kurulum -- denetle`); daha önce çalıştırırsan sırası gelmemiş adımlar "eksik" görünür, bu normaldir: yalnız o ana kadar yaptığın adımın satırına bak. Para harcayan ya da müşterinin hesabında kalıcı değişiklik yapan adımdan önce müşteriye sor. Bu klasörde `.env.local` dışında anahtar saklama; anahtarı ekrana basma. Kurulum sırasında kaynak koda (`src/`, `scripts/`) dokunma: bir komut hata verirse düzeltmeye kalkma, hatayı müşteriye düz dille söyle ve kuran ekibe (bize) iletmesini iste.

İşletim sistemini anla (macOS, Windows ya da Linux). Aşağıda her adımda önce macOS, sonra Windows, sonra Linux yazar.

### 1. Araçlar
Node.js (20 ya da üstü), ffmpeg, Python 3.10+.
- **macOS:** Homebrew yoksa kur (brew.sh). Sonra `brew install node ffmpeg python@3.12 libpq && brew link --force libpq` (libpq haftalık yedek için `pg_dump` getirir).
- **Windows:** `winget install OpenJS.NodeJS.LTS`, `winget install Gyan.FFmpeg`, `winget install Python.Python.3.12`. Kurulumdan sonra terminali kapatıp yeniden aç.
- **Linux (Debian/Ubuntu):** `sudo apt install -y nodejs npm ffmpeg python3 python3-venv` (Node 20'den eskiyse nodejs.org'dan kur).

**Klasör yeri (şart):** bu kopya kullanıcı klasöründe korunmayan bir yerde durmalı, örneğin `~/panel`. Masaüstü, Belgeler ve İndirilenler klasörlerinde olmasın: macOS bu klasörlere zamanlanmış işin erişimini engeller ("Operation not permitted") ve günlük iş sessizce çalışmaz. Kopya oralardaysa `~/panel` altına taşı, sonra devam et.

Sonra bu klasörde: `npm ci`.

### 2. Ayar dosyası
`.env.example` dosyasını `.env.local` olarak kopyala. İçinde bu kopya için gereken ayarlar hazırdır (panel sürümü, video incelemesi için Claude, günlük tur açık). Boş kalan anahtarlar sonraki adımlarda dolar.

### 3. Konuşma yazıya dökme (Whisper, bilgisayarda çalışır, ücretsiz)
Videolardaki konuşmayı yazıya çevirir. Bir kez kurulur, `medium` modeli önceden indirilir (yaklaşık 1,5 GB; `small` Türkçede özel adları bozuyor). Diskte en az 2 GB boş yer olmalı; indirme bağlantıya göre birkaç dakika ile yarım saat sürer, müşteriye söyle. Model bu klasöre değil kullanıcı önbelleğine iner (`~/.cache/huggingface`).
- **macOS / Linux** (macOS'ta brew `python3` adını bağlamaz: `python3.12` yaz; Linux'ta `python3.12` yoksa `python3`):
  ```
  python3.12 -m venv .venv
  .venv/bin/pip install faster-whisper
  .venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('medium', device='cpu', compute_type='int8')"
  ```
  `.env.local` içine `WHISPER_PYTHON=<bu klasörün tam yolu>/.venv/bin/python` yaz.
- **Windows (PowerShell):**
  ```
  py -3 -m venv .venv
  .venv\Scripts\pip install faster-whisper
  .venv\Scripts\python -c "from faster_whisper import WhisperModel; WhisperModel('medium', device='cpu', compute_type='int8')"
  ```
  `.env.local` içine `WHISPER_PYTHON=<bu klasörün tam yolu>\.venv\Scripts\python.exe` yaz.

### 4. Claude girişi
Terminalde `claude` yaz, giriş yapılı değilse müşteriye giriş yaptır (kendi aboneliği). Panelin yazı ve video işleri bu girişle çalışır; ayrıca anahtar gerekmez. Anthropic API anahtarı **koyma**: koyarsan işler abonelik yerine anahtardan ücretlenir.

### 5. Veritabanı (Supabase)
0. **Bağlayıcı olmadan da kurulur:** bağlayıcı eklenemiyorsa ya da izin penceresi açılmıyorsa 1–3'ü atla; müşteri Supabase panelinde Frankfurt'ta yeni proje açar, Project Settings > API sayfasındaki proje adresini ve anahtarları `.env.local`'a kendisi yapıştırır, sonra 4–5. Müşteriye araç adı, izin komutu (`/permissions`, `mcp__…`) söyleme; "tarayıcıda açılan pencerede izin ver" de yeter.
1. Claude Code'a Supabase bağlayıcısını ekle: `claude mcp add --transport http supabase https://mcp.supabase.com/mcp`. Müşteri tarayıcıda izin verir.
2. Bağlayıcıyla yeni proje aç: bölge Frankfurt (eu-central-1), ücretsiz plan. Veritabanı şifresini müşteri kendisi belirler ve Claude'a söylemez; şifreyi hiçbir yere yazma.
3. Proje adresini ve "anon" (herkese açık) anahtarı bağlayıcıdan al, `.env.local`'a yaz (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. **"service role" anahtarını bağlayıcı vermez.** Müşteriye söyle: Supabase paneli > Project Settings > API > `service_role` anahtarını kopyalayıp `.env.local`'a `SUPABASE_SERVICE_ROLE_KEY=` satırına kendisi yapıştırsın.
5. Tabloları kur. **Veritabanı adresini (içinde parola var) sohbete yazma, Claude'a söyleme.** Müşteri kendisi yapar: Supabase panelinde "Connect" sayfasını aç, "Session pooler" bağlantı adresini kopyala, `[YOUR-PASSWORD]` yerine veritabanı şifresini yaz ve `.env.local` dosyasına `SUPABASE_DB_URL=<adres>` satırı olarak yapıştır. Şifrede `@`, `#`, `/`, `:`, `?`, `%` gibi karakter varsa adreste URL-kodlu yazılır (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`, `?` → `%3F`, `%` → `%25`); en kolayı şifreyi yalnız harf ve rakamla belirlemektir. Müşteri "yapıştırdım" deyince Claude `npm run kurulum -- veritabani` çalıştırır (adresi `.env.local`'dan kendisi okur, parolayı ekrana basmaz). Önce `npm run kurulum -- veritabani --dry-run` ile bekleyenleri gösterebilir. Bu komut tabloları sırayla kurar, var olanı silmez. Docker gerekmez. Aynı adres haftalık yedek (`gunluk`) için de kullanılır.
6. Kurulum bitince Supabase bağlayıcısını kaldır (`claude mcp remove supabase`) ya da salt okunur yap.

### 6. Hesap
Müşteriden Instagram ya da TikTok kullanıcı adını al (ve hesabın türünü: işletme, içerik üreticisi ya da karma).
`npm run kurulum -- hesap --handle=<kullanıcı adı> --platform=instagram` (TikTok için `--platform=tiktok`; tür için `--type=business|creator|mixed`).
Bu komut hesabı açar, `.env.local`'a `LOCAL_USER_ID` ve `LOCAL_WORKSPACE_ID` yazar ve aylık otomatik harcama tavanını 4,5 $ yapar (Apify'ın ücretsiz 5 $'ının altında).

### 7. Apify
Müşteri jetonu `.env.local`'daki `APIFY_TOKEN=` satırına yapıştırır; panel açıldıktan sonra Ayarlar > Anahtarlar kartından da girebilir ("Dene" düğmesi ücretsiz bir istekle anahtarın çalıştığını gösterir; Zernio ve ElevenLabs anahtarları da oradan girilir). Para harcatan ilk toplamayı **müşteriye sormadan başlatma** (günlük zamanlayıcı da toplama başlatır: adım 11'deki soruyu sor).

### 8. Denetim
`npm run kurulum -- denetle`: hepsi tamam olmalı (ayar dosyası, Claude girişi, ffmpeg, Whisper ve model, Apify anahtarı, veritabanı bağlantısı). Eksik satırı ne yapılacağını söyler; düzelt, yeniden çalıştır.

### 9. Paneli başlat
`npm run build`, sonra `npm run start`. Panel `http://localhost:3100` adresinde açılır. 3100 doluysa başka port ver (`npm run start -- -p 3200`) ve kısayoldaki adresi de aynı porta yaz. Derleme (`npm run build`) hata verirse kurulumu durdur: bu bizim hatamızdır, hatayı müşteriye düz dille söyle ve ekibe iletmesini iste. Müşteriye göster; ilk açılışta hesap için kısa bir kurulum akışı çıkar, onu müşteri kendisi yürütür (düğmeye basmadan para harcanmaz).

### 10. Masaüstü kısayolu
Kısayol paneli başlatır ve tarayıcıyı açar. `<KLASÖR>` yerine bu klasörün tam yolunu yaz.
- **macOS:** Masaüstüne `Panel.command` dosyası oluştur, içi:
  ```
  #!/bin/zsh -l
  cd "<KLASÖR>" || exit 1
  (sleep 4; open http://localhost:3100) &
  npm run start
  ```
  Sonra `chmod +x ~/Desktop/Panel.command`.
- **Windows:** Masaüstüne `Panel.bat` oluştur, içi:
  ```
  @echo off
  cd /d "<KLASÖR>"
  start "" http://localhost:3100
  npm run start
  ```
- **Linux:** `~/Desktop/Panel.desktop` oluştur: `Exec=bash -lc 'cd "<KLASÖR>" && npm run start'`, `Terminal=true`, `Type=Application`; dosyayı çalıştırılabilir yap.

### 11. Günlük iş (her gün kendiliğinden çalışsın)
`npm run gunluk` komutu panelin günlük turunu atar (ajan turu işleri açar, ardından aynı komut ayrı bir işçi başlatmadan o işleri koşturur: yeni içerik toplama, inceleme, plan; sonra varsa ölçüm; haftada bir veritabanı yedeği `yedek/` klasörüne). Her gün sabah 09:00'da çalışması için bilgisayarın zamanlayıcısına ekle. Zamanlayıcıya ayrıca işçi eklenmez, tek komut yeter. Önce komutu elle bir kez `npm run gunluk -- --dry-run` ile dene (hiçbir şey yazmaz, işçi de koşmaz).

**Eklemeden önce müşteriye sor** (zamanlayıcı ilk sabah kendiliğinden yeni video toplar, bu para harcar): "Yarından itibaren her sabah 09:00'da panel yeni videoları kendisi toplar; ayda en çok 4,5 $ harcar, Apify'ın ücretsiz 5 $'ı içinde kalır. Açayım mı?" Evet derse aşağıdakini ekle. Hayır derse zamanlayıcıyı ekleme; müşteri ilk toplamayı panelden kendisi başlatır, istediğinde bu adım sonra yapılır.
- **macOS (launchd):** `~/Library/LaunchAgents/panel.gunluk.plist` oluştur:
  ```
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0"><dict>
    <key>Label</key><string>panel.gunluk</string>
    <key>ProgramArguments</key><array>
      <string>/bin/zsh</string><string>-lc</string>
      <string>cd "<KLASÖR>" &amp;&amp; npm run gunluk &gt;&gt; yedek/gunluk.log 2&gt;&amp;1</string>
    </array>
    <key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
  </dict></plist>
  ```
  Sonra `mkdir -p yedek && launchctl load ~/Library/LaunchAgents/panel.gunluk.plist`. Bilgisayar o saatte uykudaysa iş uyanınca çalışır.
- **Windows (Görev Zamanlayıcı):** `mkdir yedek` ve sonra
  `schtasks /Create /SC DAILY /ST 09:00 /TN PanelGunluk /TR "cmd /c cd /d <KLASÖR> && npm run gunluk >> yedek\gunluk.log 2>&1"`.
  Görev ayarlarında "Kaçırılan görevi mümkün olan en kısa sürede çalıştır" seçeneğini aç.
- **Linux (cron):** `mkdir -p yedek`, sonra `crontab -e` ile ekle: `0 9 * * * cd "<KLASÖR>" && npm run gunluk >> yedek/gunluk.log 2>&1`.

### 12. Bitiş
Müşteriye `KULLANIM.md` dosyasını göster. Kurulumda yapılanları ve kalan işi (varsa) iki üç satırda özetle.

## Sorun giderme
- `npm run kurulum -- denetle` her sorunda önce çalıştırılır; eksiği ve çözümü yazar.
- Panel açılmıyorsa: başka bir uygulama 3100 portunu tutuyor olabilir (`EADDRINUSE`); `npm run start -- -p 3200` ile başka portta aç, kısayolu da o porta göre düzelt.
- Veritabanı adımı "SSL" / "TLS" hatası verirse: `SUPABASE_DB_URL` adresinin sonuna `?sslmode=require` ekle (Supabase bulutu SSL ister).
- Claude "limit doldu" derse günlük tur ertesi güne kalır; bir şey bozulmaz.
- Veritabanına ulaşılamıyorsa ücretsiz proje 7 gün boşta kalınca uyumuş olabilir: Supabase panelinden "Restore" de.
