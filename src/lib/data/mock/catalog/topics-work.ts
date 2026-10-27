/**
 * Konu kataloğu (1/2): günlük iş akışı — e-posta, toplantı, Excel, sunum, CV, müşteri yanıtı.
 */
import type { Topic } from "@/lib/data/mock/catalog/topic-types";

export const WORK_TOPICS: Topic[] = [
  {
    key: "email",
    label: "yapay zekâ ile e-posta",
    hashtags: ["chatgpt", "eposta", "verimlilik", "yapayzeka"],
    hooks: [
      { type: "question", text: "Günde kaç saatini e-posta yazarak harcıyorsun?", evidence: "Günde kaç saatini e-posta yazarak harcıyorsun?" },
      { type: "list", text: "E-postalarını yarı sürede bitirmen için 3 ChatGPT komutu.", evidence: "3 ChatGPT komutu" },
      { type: "confession", text: "İtiraf edeyim, son bir aydır hiçbir e-postayı sıfırdan yazmadım.", evidence: "İtiraf edeyim" },
      { type: "shock_stat", text: "Beyaz yakalılar haftada ortalama 11 saati e-postaya harcıyor.", evidence: "haftada ortalama 11 saati" },
    ],
    body: [
      "Sorun şu: her e-postayı sıfırdan yazıyorsun ve tonu tutturmak için üç kez düzeltiyorsun.",
      "Önce ChatGPT'ye kendi yazdığın beş e-postayı ver ve üslubunu özetlemesini iste.",
      "Sonra her yeni e-postada sadece üç madde yaz, gerisini bu üslupla tamamlatsın.",
    ],
    ctas: ["Komutları kaydet, yarın sabah ilk e-postanda dene.", "Hangi e-postada zorlandığını yorumlara yaz."],
    topicEvidence: "her e-postayı sıfırdan yazıyorsun",
    tone: "öğretici",
  },
  {
    key: "meeting_notes",
    label: "toplantı notu özetleme",
    hashtags: ["toplanti", "yapayzeka", "verimlilik", "isdunyasi"],
    hooks: [
      { type: "pov", text: "POV: Toplantıdan çıktın ve kimse not almamış.", evidence: "POV:" },
      { type: "question", text: "Bir saatlik toplantıyı iki dakikada özetlemek ister misin?", evidence: "ister misin?" },
      { type: "mistake_warning", text: "Toplantı notlarını elle tutuyorsan en önemli kararları kaçırıyorsun.", evidence: "en önemli kararları kaçırıyorsun" },
      { type: "comparison", text: "Elle not almak mı, yapay zekâya özetletmek mi? İkisini de denedim.", evidence: "İkisini de denedim" },
    ],
    body: [
      "Toplantı bitince herkes farklı bir şey hatırlıyor ve aksiyonlar havada kalıyor.",
      "Kaydı yazıya döktür, metni yapay zekâya ver ve kararları, sorumluları ve tarihleri tablo olarak iste.",
      "Tabloyu toplantıdan sonraki beş dakika içinde ekibe gönder.",
    ],
    ctas: ["Bu komutu kaydet, bir sonraki toplantında kullan.", "Takip et, yarın komutun tamamını paylaşıyorum."],
    topicEvidence: "aksiyonlar havada kalıyor",
    tone: "samimi",
  },
  {
    key: "excel_formulas",
    label: "Excel formülü yazdırma",
    hashtags: ["excel", "yapayzeka", "ofis", "excelipuclari"],
    hooks: [
      { type: "shock_stat", text: "Excel kullananların yüzde 70'i DÜŞEYARA'yı yanlış kuruyor.", evidence: "yüzde 70'i" },
      { type: "list", text: "Excel'de sana saatler kazandıracak 3 yapay zekâ komutu.", evidence: "3 yapay zekâ komutu" },
      { type: "question", text: "Formül ezberlemeden Excel'de uzman olmak mümkün mü?", evidence: "mümkün mü?" },
      { type: "pov", text: "POV: Patronun raporu bir saat içinde istedi.", evidence: "POV:" },
    ],
    body: [
      "Formülü ezberlemeye çalışmak yerine ne istediğini düz Türkçe anlat.",
      "Sütun adlarını ve örnek iki satırı yapıştır, yapay zekâdan formülü ve açıklamasını iste.",
      "Formülü önce küçük bir kopyada dene, sonra tüm tabloya uygula.",
    ],
    ctas: ["Kaydet, bir dahaki raporda işine yarayacak.", "Hangi formülde takıldığını yaz, videosunu çekeyim."],
    topicEvidence: "ne istediğini düz Türkçe anlat",
    tone: "öğretici",
  },
  {
    key: "presentation",
    label: "yapay zekâyla sunum hazırlama",
    hashtags: ["sunum", "yapayzeka", "verimlilik", "kariyer"],
    hooks: [
      { type: "question", text: "Sunum hazırlamak neden hâlâ bütün gününü alıyor?", evidence: "neden hâlâ bütün gününü alıyor?" },
      { type: "pov", text: "POV: Yarın sabah sunum var ve elinde tek slayt yok.", evidence: "POV:" },
      { type: "shock_stat", text: "Ortalama bir sunum hazırlığı 6 saat sürüyor; bunu 40 dakikaya indirdim.", evidence: "6 saat sürüyor" },
    ],
    body: [
      "Asıl zaman kaybı slayt tasarımında değil, hikâyeyi kurmakta.",
      "Önce yapay zekâdan on slaytlık bir akış iste, her slayt için tek cümlelik ana mesaj yazsın.",
      "Akışı onayladıktan sonra tasarımı şablona dök ve sayıları kendin kontrol et.",
    ],
    ctas: ["Kaydet, bir sonraki sunumunda bu sırayı izle.", "Sunum şablonunu isteyenler yorumlara yazsın."],
    topicEvidence: "hikâyeyi kurmakta",
    tone: "öğretici",
  },
  {
    key: "cv_job",
    label: "yapay zekâyla CV ve iş başvurusu",
    hashtags: ["cv", "isbasvurusu", "kariyer", "chatgpt"],
    hooks: [
      { type: "mistake_warning", text: "CV'ni ChatGPT'ye yazdırıyorsan bu hatayı yapma.", evidence: "bu hatayı yapma" },
      { type: "shock_stat", text: "İşe alımcılar bir CV'ye ortalama 7 saniye bakıyor.", evidence: "ortalama 7 saniye" },
      { type: "pov", text: "POV: Yüz başvuru yaptın ve tek dönüş almadın.", evidence: "POV:" },
    ],
    body: [
      "Yapay zekânın yazdığı CV'ler birbirine benziyor ve işe alımcı bunu hemen fark ediyor.",
      "İlanı ve kendi deneyimini ver, yapay zekâdan yalnız eşleşen başarıları sayılarla öne çıkarmasını iste.",
      "Son metni kendi cümlelerinle düzelt ki senin sesin kalsın.",
    ],
    ctas: ["Kaydet, bir sonraki başvurunda kullan.", "CV'ne yorum isteyenler yazsın."],
    topicEvidence: "CV'ler birbirine benziyor",
    tone: "uyarıcı",
  },
  {
    key: "customer_support",
    label: "müşteri yanıtları",
    hashtags: ["kucukisletme", "musterihizmetleri", "yapayzeka", "eticaret"],
    hooks: [
      { type: "question", text: "Aynı müşteri sorusuna günde kaç kez cevap veriyorsun?", evidence: "günde kaç kez" },
      { type: "list", text: "Küçük işletmeler için 3 hazır yapay zekâ yanıt şablonu.", evidence: "3 hazır yapay zekâ yanıt şablonu" },
      { type: "confession", text: "Dürüst olayım, müşteri mesajlarına geç dönmekten müşteri kaybettim.", evidence: "Dürüst olayım" },
    ],
    body: [
      "Soruların yüzde sekseni aynı: kargo, iade, fiyat.",
      "En sık gelen on soruyu ve doğru cevapları bir belgeye yaz, yapay zekâya bu belgeye göre yanıt taslağı hazırlat.",
      "Taslağı göndermeden önce mutlaka oku; ton ve bilgi senin sorumluluğunda.",
    ],
    ctas: ["Şablonları kaydet, bu akşam kur.", "İşletmen ne satıyor, yorumlara yaz."],
    topicEvidence: "kargo, iade, fiyat",
    tone: "samimi",
  },
];
