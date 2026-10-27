/**
 * Konu kataloğu (2/2): araçlar ve sistem — prompt, otomasyon, içerik planı, Notion, gün planı,
 * araç karşılaştırma.
 */
import type { Topic } from "@/lib/data/mock/catalog/topic-types";

export const TOOL_TOPICS: Topic[] = [
  {
    key: "prompt_formula",
    label: "prompt yazma formülü",
    hashtags: ["prompt", "chatgpt", "yapayzeka", "promptmuhendisligi"],
    hooks: [
      { type: "mistake_warning", text: "ChatGPT'ye böyle soru soruyorsan cevapların hep vasat kalacak.", evidence: "cevapların hep vasat kalacak" },
      { type: "list", text: "İyi bir prompt'un 4 parçası var ve çoğu kişi ikisini unutuyor.", evidence: "4 parçası var" },
      { type: "comparison", text: "Aynı soruyu iki farklı şekilde sordum, sonuçlar arasındaki farka bak.", evidence: "iki farklı şekilde sordum" },
      { type: "confession", text: "Açıkçası ben de ilk altı ay prompt'ları yanlış yazıyordum.", evidence: "Açıkçası ben de" },
    ],
    body: [
      "Çoğu kişi tek cümle yazıp mucize bekliyor.",
      "Rol, bağlam, görev ve format: bu dört parçayı her prompt'a ekle.",
      "Formatı belirtmezsen yapay zekâ uzun ve dağınık bir metin döndürür.",
    ],
    ctas: ["Formülü kaydet, bir sonraki sorunda dene.", "Yorumlara bir prompt yaz, birlikte düzeltelim."],
    topicEvidence: "tek cümle yazıp mucize bekliyor",
    tone: "iddialı",
  },
  {
    key: "automation",
    label: "kodsuz otomasyon",
    hashtags: ["otomasyon", "kodsuz", "verimlilik", "yapayzeka"],
    hooks: [
      { type: "confession", text: "İtiraf: haftada beş saat kopyala-yapıştır yapıyordum.", evidence: "İtiraf:" },
      { type: "list", text: "Kod bilmeden kurabileceğin 3 iş otomasyonu.", evidence: "3 iş otomasyonu" },
      { type: "question", text: "Aynı işi her gün elle yapmaktan sıkılmadın mı?", evidence: "sıkılmadın mı?" },
      { type: "comparison", text: "Zapier mı Make mi? İkisini de bir ay kullandım.", evidence: "Zapier mı Make mi?" },
    ],
    body: [
      "Form yanıtlarını tabloya taşımak, faturaları klasöre atmak gibi işler her gün yarım saatini yiyor.",
      "Tetikleyiciyi seç, eylemi seç ve arada yapay zekâya veriyi özetlet.",
      "İlk otomasyonu tek bir işle sınırla, çalıştığını görünce genişlet.",
    ],
    ctas: ["Takip et, kurulumun adım adım videosu geliyor.", "Hangi işi otomatikleştirmek istediğini yaz."],
    topicEvidence: "her gün yarım saatini yiyor",
    tone: "samimi",
  },
  {
    key: "content_plan",
    label: "yapay zekâyla içerik planı",
    hashtags: ["icerikplani", "sosyalmedya", "yapayzeka", "girisimci"],
    hooks: [
      { type: "pov", text: "POV: Ay başı geldi ve içerik takvimin bomboş.", evidence: "POV:" },
      { type: "shock_stat", text: "Otuz günlük içerik planını 15 dakikada çıkardım.", evidence: "15 dakikada" },
      { type: "question", text: "Ne paylaşacağını düşünmekten yoruldun mu?", evidence: "yoruldun mu?" },
    ],
    body: [
      "Her gün ne paylaşacağını o gün düşünmek en büyük zaman kaybı.",
      "Hedef kitleni ve üç ana konunu ver, yapay zekâdan her konu için on video fikri ve hook iste.",
      "Fikirleri haftalara böl ve her hafta tek bir konuya odaklan.",
    ],
    ctas: ["Takvimi kaydet, pazartesi başla.", "Nişini yaz, sana beş fikir çıkarayım."],
    topicEvidence: "en büyük zaman kaybı",
    tone: "motive edici",
  },
  {
    key: "notion_system",
    label: "Notion ile iş sistemi",
    hashtags: ["notion", "planlama", "verimlilik", "yapayzeka"],
    hooks: [
      { type: "comparison", text: "Kâğıt ajanda mı, Notion mı? Bir ay ikisini yan yana kullandım.", evidence: "Bir ay ikisini yan yana kullandım" },
      { type: "list", text: "Notion'da kurduğum 3 sayfa işimi tamamen değiştirdi.", evidence: "3 sayfa" },
      { type: "mistake_warning", text: "Notion'u karmaşık kuruyorsan bir hafta sonra bırakacaksın.", evidence: "bir hafta sonra bırakacaksın" },
    ],
    body: [
      "Çoğu sistem ilk hafta güzel görünüyor, sonra kimse güncellemiyor.",
      "Tek bir görev tablosu, tek bir not sayfası ve haftalık gözden geçirme sayfası yeter.",
      "Yapay zekâyı haftalık özet için kullan: tamamlananları ve gecikenleri o çıkarsın.",
    ],
    ctas: ["Şablonu isteyen yorumlara yazsın.", "Kaydet, hafta sonu kur."],
    topicEvidence: "kimse güncellemiyor",
    tone: "öğretici",
  },
  {
    key: "daily_planning",
    label: "gün planlama ve odak",
    hashtags: ["zamanyonetimi", "odak", "verimlilik", "planlama"],
    hooks: [
      { type: "confession", text: "Açık konuşayım, yapılacaklar listem hiç bitmiyordu.", evidence: "Açık konuşayım" },
      { type: "question", text: "Gün sonunda neden hiçbir şey bitirmemiş gibi hissediyorsun?", evidence: "neden hiçbir şey bitirmemiş gibi hissediyorsun?" },
      { type: "shock_stat", text: "Ortalama bir çalışan günde 23 kez bölünüyor.", evidence: "günde 23 kez" },
      { type: "pov", text: "POV: Sabah dokuzda başladın, öğlen oldu ve hâlâ mail okuyorsun.", evidence: "POV:" },
    ],
    body: [
      "Liste uzadıkça hangi işin önemli olduğunu seçemiyorsun.",
      "Sabah listeni yapay zekâya ver ve etki ile süreye göre ilk üç işi seçmesini iste.",
      "Bu üç iş bitmeden e-postaya ve mesajlara bakma.",
    ],
    ctas: ["Yarın sabah dene ve sonucu yaz.", "Kaydet, pazartesi sabahı hatırlatırım."],
    topicEvidence: "hangi işin önemli olduğunu seçemiyorsun",
    tone: "motive edici",
  },
  {
    key: "ai_tools_compare",
    label: "yapay zekâ araçları karşılaştırma",
    hashtags: ["yapayzeka", "chatgpt", "claude", "aiaraclari"],
    hooks: [
      { type: "comparison", text: "ChatGPT mi Claude mu? Aynı iş görevini ikisine de verdim.", evidence: "Aynı iş görevini ikisine de verdim" },
      { type: "list", text: "Ücretsiz sürümüyle bile işini hızlandıracak 5 yapay zekâ aracı.", evidence: "5 yapay zekâ aracı" },
      { type: "question", text: "Hangi yapay zekâ aracına para vermeye değer?", evidence: "para vermeye değer?" },
      { type: "shock_stat", text: "Denediğim 20 aracın sadece 4'ünü hâlâ kullanıyorum.", evidence: "sadece 4'ünü" },
    ],
    body: [
      "Her hafta yeni bir araç çıkıyor ve hepsini denemeye vakit yok.",
      "Aracı seçerken tek soruya bak: hangi işimi bugün yarı sürede bitiriyor?",
      "Bir ay kullanmadığın aracın aboneliğini iptal et.",
    ],
    ctas: ["Listeyi kaydet, aboneliklerini bu akşam gözden geçir.", "Senin favori aracın hangisi, yorumlara yaz."],
    topicEvidence: "hepsini denemeye vakit yok",
    tone: "karşılaştırmalı",
  },
];
