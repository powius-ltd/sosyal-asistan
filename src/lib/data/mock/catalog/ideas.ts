/**
 * Fikir kartı şablonları (15). Kanıt videoları ve gerekçe üreteçte (`generators/ideas.ts`)
 * gerçek içeriklerden bağlanır; burada yalnız başlık, hook önerileri ve script taslağı var.
 */
import type { ContentFormat } from "@/lib/platforms/types";

export interface IdeaTemplate {
  topicKey: string;
  title: string;
  format?: ContentFormat;
  /** 3–5 hook önerisi. */
  hooks: string[];
  /** Script taslağı: her madde bir sahne/adım. */
  outline: string[];
}

export const IDEA_TEMPLATES: IdeaTemplate[] = [
  {
    topicKey: "email",
    title: "3 madde yaz, e-postayı yapay zekâ bitirsin",
    hooks: [
      "Günde bir saatini e-postaya veriyorsan bu videoyu kaydet.",
      "E-postamı üç maddeyle yazıp gerisini yapay zekâya bırakıyorum.",
      "Bu komutla e-postaların artık tam senin gibi yazılıyor.",
      "Yarım saatlik e-posta işini beş dakikaya indirdim.",
    ],
    outline: [
      "0-3 sn: Açılış — dolu gelen kutusu ekran kaydı",
      "3-10 sn: Sorun — her e-postayı sıfırdan yazmak",
      "10-22 sn: Üslup özetleme komutu, ekranda yaz",
      "22-34 sn: Üç madde → hazır e-posta dönüşümü",
      "34-40 sn: Çağrı — komutu kaydet",
    ],
  },
  {
    topicKey: "meeting_notes",
    title: "Toplantı kaydından 2 dakikada aksiyon tablosu",
    hooks: [
      "Toplantıdan çıkınca herkes başka bir şey mi hatırlıyor?",
      "Bir saatlik toplantıyı iki dakikada aksiyon tablosuna çeviriyorum.",
      "POV: Toplantı bitti ve sorumlular tablosu çoktan ekipte.",
    ],
    outline: [
      "0-3 sn: Açılış — dağınık not defteri vs düzgün tablo",
      "3-12 sn: Kaydı yazıya dökme",
      "12-25 sn: Karar/sorumlu/tarih komutu",
      "25-32 sn: Tabloyu ekibe gönderme",
    ],
  },
  {
    topicKey: "excel_formulas",
    title: "DÜŞEYARA'yı ezberleme, yapay zekâya yazdır",
    hooks: [
      "DÜŞEYARA'yı hâlâ ezberlemeye mi çalışıyorsun?",
      "Excel formülünü düz Türkçe anlatıp hazır alıyorum.",
      "Excel'de uzman görünmenin en kısa yolu bu komut.",
      "Formül yazmayı bıraktım; sadece ne istediğimi söylüyorum.",
      "Raporun bir saat sonra teslim mi? Bu videoyu kaydet.",
    ],
    outline: [
      "0-3 sn: Açılış — hata veren formül hücresi",
      "3-12 sn: Sütun adlarını ve örnek satırları kopyalama",
      "12-24 sn: Komut + gelen formülün açıklaması",
      "24-32 sn: Küçük kopyada deneme, tüm tabloya uygulama",
      "32-36 sn: Çağrı — takıldığın formülü yaz",
    ],
  },
  {
    topicKey: "prompt_formula",
    title: "Rol-bağlam-görev-format: 4 parçalı prompt",
    hooks: [
      "ChatGPT'den vasat cevap alıyorsan sorun modelde değil.",
      "İyi bir prompt'un 4 parçası var; çoğu kişi ikisini atlıyor.",
      "Aynı soruyu iki şekilde sordum, farka bak.",
    ],
    outline: [
      "0-3 sn: Açılış — kötü ve iyi cevap yan yana",
      "3-15 sn: Dört parça tek tek ekranda",
      "15-25 sn: Formatı belirtince değişen çıktı",
      "25-30 sn: Çağrı — kendi prompt'unu yorumlara yaz",
    ],
  },
  {
    topicKey: "presentation",
    title: "Sunumu 40 dakikada çıkarmanın sırası",
    hooks: [
      "Sunum hazırlarken en çok zamanı tasarım değil hikâye yiyor.",
      "On slaytlık sunumu 40 dakikada böyle çıkarıyorum.",
      "POV: Yarın sunum var ve elinde tek slayt yok.",
    ],
    outline: [
      "0-3 sn: Açılış — boş slayt ekranı",
      "3-14 sn: Yapay zekâdan 10 slaytlık akış isteme",
      "14-26 sn: Her slayda tek cümlelik ana mesaj",
      "26-35 sn: Şablona dökme ve sayıları kontrol",
    ],
  },
  {
    topicKey: "automation",
    title: "Kod bilmeden ilk otomasyonun: form → tablo",
    hooks: [
      "Haftada beş saatini kopyala-yapıştıra mı veriyorsun?",
      "Kod bilmeden kurduğum ilk otomasyon bana her gün yarım saat kazandırıyor.",
      "Form yanıtlarını elle taşımayı bugün bırak.",
      "Bu otomasyonu kurmak 10 dakika sürüyor.",
    ],
    outline: [
      "0-3 sn: Açılış — elle kopyala-yapıştır hızlandırılmış",
      "3-12 sn: Tetikleyici seçimi",
      "12-24 sn: Yapay zekâ özet adımı",
      "24-34 sn: Tabloya düşen ilk satır",
      "34-38 sn: Çağrı — hangi işi otomatikleştirelim?",
    ],
  },
  {
    topicKey: "cv_job",
    title: "İlana özel CV: 7 saniye kuralı",
    hooks: [
      "İşe alımcı CV'ne 7 saniye bakıyor; o 7 saniyeyi böyle kazan.",
      "CV'ni yapay zekâya yazdırıyorsan bu hatayı yapma.",
      "Aynı CV ile yüz başvuru yapmayı bırak.",
    ],
    outline: [
      "0-3 sn: Açılış — kronometre 7 saniye",
      "3-14 sn: İlan + deneyim komutu",
      "14-24 sn: Sayılarla başarı cümleleri",
      "24-32 sn: Kendi sesinle son düzeltme",
    ],
  },
  {
    topicKey: "customer_support",
    title: "Küçük işletmeye hazır yapay zekâ yanıt şablonu",
    hooks: [
      "Aynı müşteri sorusuna günde on kez cevap veriyorsan bu şablon senin için.",
      "Kargo, iade, fiyat: üç soruyu yapay zekâya devrettim.",
      "Müşteri mesajlarına geç dönmek müşteri kaybettirir.",
    ],
    outline: [
      "0-3 sn: Açılış — bildirim yağmuru",
      "3-14 sn: En sık 10 soru belgesi",
      "14-26 sn: Belgeye göre yanıt taslağı komutu",
      "26-32 sn: Göndermeden önce kontrol",
    ],
  },
  {
    topicKey: "content_plan",
    title: "30 günlük içerik planı 15 dakikada",
    hooks: [
      "Ay başı geldi ve içerik takvimin boş mu?",
      "Otuz günlük içerik planını 15 dakikada çıkarıyorum.",
      "Ne paylaşacağını düşünmekten yorulduysan bu komutu kaydet.",
      "Bir komutla 30 video fikri ve açılış cümlesi.",
    ],
    outline: [
      "0-3 sn: Açılış — boş takvim",
      "3-12 sn: Hedef kitle + üç ana konu",
      "12-24 sn: Konu başına on fikir ve açılış cümlesi",
      "24-34 sn: Fikirleri haftalara bölme",
    ],
  },
  {
    topicKey: "notion_system",
    title: "3 sayfalık Notion iş sistemi",
    hooks: [
      "Notion'u karmaşık kurduysan bir haftada bırakırsın.",
      "Üç sayfalık Notion sistemim işimi tamamen değiştirdi.",
      "Kâğıt ajanda mı Notion mı? Bir ay sonunda kazanan belli.",
    ],
    outline: [
      "0-3 sn: Açılış — karmaşık Notion ekranı",
      "3-14 sn: Görev tablosu",
      "14-22 sn: Not sayfası ve haftalık gözden geçirme",
      "22-32 sn: Yapay zekâyla haftalık özet",
    ],
  },
  {
    topicKey: "daily_planning",
    title: "Sabah ilk 3 işi yapay zekâ seçsin",
    hooks: [
      "Yapılacaklar listen hiç bitmiyorsa sorun listede değil sırada.",
      "Her sabah ilk üç işimi yapay zekâya seçtiriyorum.",
      "Gün sonunda hiçbir şey bitirmemiş gibi hissediyorsan dene.",
    ],
    outline: [
      "0-3 sn: Açılış — uzayan liste",
      "3-14 sn: Etki ve süreye göre sıralama komutu",
      "14-24 sn: İlk üç iş bitmeden bildirim yok",
      "24-30 sn: Çağrı — yarın dene, sonucu yaz",
    ],
  },
  {
    topicKey: "ai_tools_compare",
    title: "ChatGPT mi Claude mu: aynı iş görevi testi",
    hooks: [
      "ChatGPT mi Claude mu? Aynı görevi ikisine de verdim.",
      "Aynı e-postayı iki yapay zekâya yazdırdım, sonuç şaşırtıcı.",
      "Hangi yapay zekâya para vermeye değer?",
      "Denediğim 20 aracın sadece 4'ü kaldı.",
    ],
    outline: [
      "0-3 sn: Açılış — bölünmüş ekran",
      "3-15 sn: Aynı görev, iki çıktı",
      "15-27 sn: Hız, doğruluk, ton karşılaştırması",
      "27-35 sn: Hangisi hangi iş için",
      "35-40 sn: Çağrı — senin favorin hangisi?",
    ],
  },
  {
    topicKey: "prompt_formula",
    title: "En sık yapılan 5 prompt hatası",
    hooks: [
      "Bu 5 hatayı yapıyorsan yapay zekâdan hiç iyi sonuç alamazsın.",
      "Ben de ilk altı ay bu prompt hatalarını yapıyordum.",
      "Prompt'un tek cümleyse sorun orada.",
    ],
    outline: [
      "0-3 sn: Açılış — kırmızı çarpılı prompt",
      "3-24 sn: Beş hata, her biri 4 sn",
      "24-32 sn: Düzeltilmiş prompt ve çıktı",
      "32-36 sn: Çağrı — kaydet",
    ],
  },
  {
    topicKey: "excel_formulas",
    title: "Excel raporunu yapay zekâyla yorumlatma",
    format: "carousel",
    hooks: [
      "Tabloyu yapıştır, raporun yorumunu yapay zekâ yazsın.",
      "Patronun 'bu sayılar ne diyor?' sorusuna 3 dakikada cevap.",
      "Excel raporunu okumak yerine özetini al.",
    ],
    outline: [
      "Slayt 1: Kapak — 'Sayılar ne diyor?'",
      "Slayt 2: Tabloyu hazırlama",
      "Slayt 3: Yorum komutu",
      "Slayt 4: Örnek çıktı",
      "Slayt 5: Kontrol listesi",
    ],
  },
  {
    topicKey: "daily_planning",
    title: "Günde 23 bölünme: odak bloğu kurmak",
    hooks: [
      "Ortalama bir çalışan günde 23 kez bölünüyor.",
      "Öğlen oldu ve hâlâ mail mi okuyorsun?",
      "Odak bloğu kurmak için tek bir kural yeter.",
    ],
    outline: [
      "0-3 sn: Açılış — bildirim sayacı",
      "3-12 sn: Bölünmenin maliyeti",
      "12-24 sn: 90 dakikalık odak bloğu kurulumu",
      "24-30 sn: Çağrı — yarın bir blok dene",
    ],
  },
];
