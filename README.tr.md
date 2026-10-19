# ClipBoardLine

**Kopyaladıkların için düzenli bir yer.**

Görseller, metinler ve linkler elinin altında. Son kopyalarını üç askıda tut, önemli olanları yerel kütüphaneye kaydet ve tümünde klavyeyle hızla gezin.

[English README](README.md) · [Mac için indir](https://github.com/orkunisitmak/clipboardline-app/releases/latest) · [Kaynak kodu incele](https://github.com/orkunisitmak/clipboardline-desktop)

> Mevcut uygulama Swift, AppKit, SwiftUI, Vision ve Core ML kullanır. Apple silicon ve Intel’de macOS 14 veya üstünü destekler. Windows sürümü planlanıyor; burada yayımlanmış Windows sürümü veya özellik eşitliği iddiası yoktur.

## İlk beş dakikan

1. **Kur ve aç.** Son Mac sürümünü indir, uygulamayı Applications klasörüne taşı ve aç. ClipBoardLine menü çubuğunda yaşar.
2. **Ne toplamak istediğini seç.** Ayarlar → Kaynaklar’dan istersen görsel veya metin yakalamayı aç. Tek URL yakalama varsayılan açık gelir ve kapatılabilir. Ekran görüntüsü yönetimini ayrıca seç.
3. **Akışını bozmadan gezin.** ⌃⌥T’ye bas, oklarla gezin, Space ile önizle. Enter kopyalar ve askıları kapatır; odak önceki uygulamaya döner.
4. **İşe yarayanları sakla.** P ile sabitle, ⇧P ile klasör seç veya ⌥P ile anlamlı bir ad ver. Etiketlenen ya da klasöre eklenen kayıtlar normal geçmiş süresi sonunda kalır.
5. **Kendine göre ayarla.** Her içerik türünün geçmiş süresini, kısayolları, renkleri ve otomatik güncelleme kontrolünü Ayarlar’dan düzenle.

## Tüm özellikler

| Özellik | Ne yapar? |
| --- | --- |
| **Üç bağımsız askı** | Görselleri, Metinleri ve Linkleri ayrı yatay satırlarda görüntüle. Her askıyı açıp kapat, etkin askıyı değiştir, sabitlenenleri filtrele ve eski kopyalara kaydır. Her yeni açılışta görünür askılar ilk öğelerinden başlar. |
| **Ekran görüntüsü ve pano yakalama** | Ekran görüntülerini anında yakala, en fazla üç ek görsel klasörünü izle ve istersen kopyalanan görsel ya da metinleri topla. Pano görseli ve metni ayrı ayrı etkinleştirilir. Metin ve link kopyaları askıyı açmadan sessizce eklenir. |
| **Yerel kütüphane** | Izgara ve liste görünümleri, klasör/etiket kenar çubuğu ve düzenlenebilir ayrıntılar paneli içeren, boyutlandırılabilir yerel pencere. Not oluştur; başlıkları ve içeriği düzenle; görsel, metin ve linkleri birlikte düzenle. Tam ekran isteğe bağlıdır. |
| **Sabitle, adlandır, klasörle ve etiketle** | Sabitleme ve favorileme aynı işlemdir. Sabitlenen, klasöre eklenen veya etiketlenen öğeler normal geçmiş süresinden sonra da korunur. Sanal alt klasörler ve birden çok etiket kullan; seçili öğeleri sırayla adlandırıp sabitle. |
| **Askılar için tek arama** | Ortadaki tek arama alanı görünür tüm askılarda arar: metin, link ayrıntıları, başlık, not, etiket ve görsellerden tanınan yazı. Kapalı askılar sonuçlara katılmaz. Kütüphaneyi açmadan sonuçlarda gez. |
| **OCR ve görsel anlam araması** | Apple Vision OCR ve MobileCLIP-S2 Mac üzerinde çalışır. Kütüphanede metin/OCR, görsel veya birleşik arama; tür, tarih, alan adı, etiket, klasör ve sabitleme filtreleri bulunur. Görsel betimlemeler en iyi sonucu İngilizce verir. |
| **İçeriği gösteren link kartları** | Tek başına kopyalanan web adresi Linkler askısına gider; URL içeren paragraf metin olarak kalır. İsteğe bağlı zenginleştirme site veya YouTube başlığı, yazar ve küçük görsel ekler. Seçili linki tarayıcıda aç. |
| **Çerçevesiz önizlemeler** | Space; görsel, düzenlenebilir metin ve link önizlemesini açar. Askı önizlemesi pencereyi kapatmadan farklı içerik türlerine geçebilir. Görsel yakınlaştırma ilk sığdırma boyutundan %400’e kadardır; kıstırma, tekerlek ve sürükleyerek gezinme desteklenir. |
| **Düzenlenebilir işaretleme ve kırpma** | Kalem, saydam işaretleyici, dikdörtgen, elips, ok, çizgi ve metin araçları önizlemenin üst çubuğunu paylaşır. İşaretleri taşı, boyutlandır, biçimlerini değiştir ve geri al. Kırpma özgün dosyayı bozmaz; orijinal ve düzenlenebilir işaretler korunur. |
| **Kopyala, yapıştır, sürükle ve dışa aktar** | Seçili grubu sırasıyla kopyala, çoklu öğe sürükle, kopyaları dışa aktar veya açıkça komut vererek önceki uygulamanın seçili yazı alanına yapıştır. Görsel kopyaları tam çözünürlüklü kırpma/işaretleme içerir. Çoklu görsel yapıştırma hedef uygulamanın desteğine bağlıdır. |
| **Tekrarlanan metin kartları olmadan geçmiş** | Görsel, metin ve link geçmişini ayrı ayrı 1, 3, 7, 15 veya 30 gün tut; varsayılan süre 30 gündür. Aynı metni yeniden kopyalamak askıyı tekrarlarla doldurmak yerine mevcut tek kaydı yeniler; kayıtlı düzen korunur. |
| **Askıdan kaldır ve geri getir** | S seçili öğeleri kaldırır ve sıradaki uygun öğeyi seçer. Kaydedilmiş kayıtlar kütüphanede kalır; geçici kopyalar kurtarılabilir Çöp Kutusu’na gider. Backspace aynı oturumdaki son askı kaldırmasını, gruplar dahil, geri getirir. Harici özgün dosyalar korunur. |
| **Klavye odaklı Eylemler** | Bağlama uygun Eylemler çubuğunda düzenleme, gezinme, görsel araçları, kütüphane görünümleri, ayarlar ve güncellemeleri ara. Komutlar güncel kısayolları gösterir ve çubuk açılırken seçili olan öğe ya da sıralı grup üzerinde çalışır. |
| **Kişiselleştirilebilir Mac arayüzü** | Küçük, orta ve büyük kartlar; yumuşak askı renkleri veya nötr cam; açılma davranışı, tam ekran uygulama üstünde görünme, ses ve girişte başlatma ayarları. Uygulama dilini macOS’tan bağımsız seç. Gezinme kısayollarının çoğu değiştirilebilir veya kapatılabilir. |
| **Yerel ve imzalı güncellemeler** | Sparkle sürüm notlarını, indirmeyi ve kurulumu yönetir. Resmî herkese açık güncellemeler GitHub hesabı veya token istemez. Otomatik kontrol kapatılabilir; açıkken uygulama çalıştığı sürece saatte bir yapılır. İndirme ve kurulum senin işlemini gerektirir. |

## Varsayılan klavye kısayolları

Bunlar varsayılanlardır. Ayarlar → Klavye kısayolları bölümünden gezinme tuşları ve genel kısayollar değiştirilebilir veya kapatılabilir. Tek harfli tuşlar yalnızca gezinirken uygulama komutu olur; metin alanlarında normal yazım korunur. ⌘ Command · ⌥ Option/Alt · ⌃ Control · ⇧ Shift.

### Her uygulamadan erişim

| Varsayılan | İşlem | Nerede / ayrıntı |
| --- | --- | --- |
| `⌃⌥T` | Askıları göster/gizle | Genel; Ayarlar’dan değiştirilebilir. |
| `⌃⌥S` | Askıları arama odakta aç | Genel; değiştirilebilir veya kapatılabilir. |
| `Varsayılan kapalı` | Kütüphaneyi genel kısayolla aç | Kendi kısayolunu ata; Ayarlar’da ⌃⌥L önerilir. |
| `Varsayılan kapalı` | Son görseli genel kısayolla kopyala | Kendi kısayolunu ata; ⌃⌥C ve ⌃⇧C hazır seçenekleri bulunur. |

### Gezinme ve seçim

| Varsayılan | İşlem | Nerede / ayrıntı |
| --- | --- | --- |
| `L` | Kütüphaneyi aç | Askılar odaktayken. |
| `Tab / ⇧Tab` | Etkin askıyı değiştir | Askılarda; ikisi de etkin satırı döndürür. |
| `← / →` | Önceki / sonraki öğe | Askılar, kütüphane ve önizlemeler. |
| `↑ / ↓` | Satırlar veya sonuçlar arasında gezin | Askı aramasında önceki/sonraki görünür dolu satır. Askı önizlemesinde satır değiştirir. Kütüphanede ızgara satırı (listede öğe) değiştirir. Askıda arama dışında önceki/sonraki öğe. |
| `⌘← / ⌘→` | Askıdaki ilk / son öğe | Askılar ve askıdan açılan önizlemeler. |
| `⌥← / ⌥→` | Önceki / sonraki askı sayfası | Numaralı görünür sayfalar arasında geçer; askı önizlemesinde de çalışır. |
| `1–9` | Numaralı görünür kartı seç | Etkin askı; numaralar görünür alanı ve filtreleri izler. |
| `⇧← / ⇧→ / ⇧↑ / ⇧↓` | Seçimi genişlet | Askılar ve kütüphane; metin yazarken düzenleyicinin kısayolları korunur. |
| `⌘A` | Görünür öğelerin tümünü seç | Etkin askı veya geçerli kütüphane sonuçları. |
| `⌘Click` | Tekil seçimi aç/kapat | Kartları çoklu seçime ekle veya seçimden çıkar. |

### Kopyalama ve düzenleme

| Varsayılan | İşlem | Nerede / ayrıntı |
| --- | --- | --- |
| `Enter` | Kopyala; askılar kapanır, odak geri döner | Askıda seçili grup. Askı önizlemesinde görünen öğe; önizleme ve askılar kapanır. Kütüphane/kütüphane önizlemesinde bu askı kapatma davranışı olmadan kopyalar. |
| `⌘C` | Kopyala ve gezinmeye devam et | Seçim veya geçerli önizleme; pencereler açık kalır. |
| `⌘Enter` | Önceki uygulamaya yapıştır | Erişilebilirlik izni ve önceki düzenlenebilir hedef gerekir. Metin düzenlerken önce düzenlemeyi bitirir. |
| `P / ⌘P` | Sabitle / favori durumunu değiştir | Görsel, metin ve linkler için tek ortak işlem. |
| `F / ⇧⌘F` | Yalnız sabitlenenleri aç/kapat | Etkin askı veya kütüphane kapsamı; önizlemede de desteklenir. |
| `⇧P` | Klasöre ekleyerek sabitle | Çoklu seçim destekli: yazarak ara; ↑/↓ seç; Enter onayla; Esc iptal. Seçicide ⌘N klasör oluşturur. |
| `⌥P` | Adlandır ve sabitle | Çoklu seçimde Enter kaydeder ve sıradakine geçer; Esc kalan öğeleri değiştirmeden çıkar. |
| `⇧⌘T` | Etiket ekle | Mevcut etiketleri ara veya yenisini oluştur; çoklu seçimi destekler. |
| `S` | Askıdan kaldır | Askılar ve askı önizlemeleri; önizlemeyi kapatmadan sıradaki öğeyi seçer. |
| `Backspace ⌫` | Son askı kaldırmasını geri al | Askı/askı önizlemesi; bu oturumda en fazla 32 grup. Kütüphanede Backspace, Çöp Kutusu işlemini açar. |
| `Forward Delete ⌦` | Çöp Kutusu’na taşımayı onayla | Askılar ve kütüphane; kütüphanede Backspace de kullanılabilir. |
| `⇧⌘E` | Seçili kopyaları dışa aktar | Askılar veya kütüphane; orijinaller yerinde kalır. |

### Arama, eylemler ve askı görünürlüğü

| Varsayılan | İşlem | Nerede / ayrıntı |
| --- | --- | --- |
| `⇧S` | Görünür askılarda ara | Açık görsel OCR, metin ve link askılarında tek sorgu. Enter veya ↑/↓ arama yazımından sonuçlara geçer; kopyalamak için yeniden Enter. |
| `⌘K` | Eylemler’i aç | Askılar, kütüphane, önizlemeler ve Ayarlar. ↑/↓ seçer; Enter çalıştırır; Esc kapatır. |
| `⇧I / ⇧T / ⇧L` | Görseller / Metinler / Linkler askısını aç/kapat | Askılar odaktayken. Son satırı kapatmak askıları kapatır. |
| `⇧⌘B` | Tüm askılar / etkin askı arasında geç | Askılar odaktayken. |
| `⌘F` | Kütüphane aramasını odakla | Kütüphanede; yerel metin düzenleme korunur. |
| `⌘0 / ⌘1 / ⌘2 / ⌘3` | Tümü / görsel / metin / link filtresi | Yalnızca kütüphanede. |

### Önizleme ve görsel düzenleme

| Varsayılan | İşlem | Nerede / ayrıntı |
| --- | --- | --- |
| `Space` | Önizlemeyi aç/kapat | Odaklı içerik; yazı yazarken Space normal boşluk ekler. |
| `Esc` | Önizleme, arama veya askıyı kapat | Düzenleme modları önce kendi işlemini bitirir/iptal eder. |
| `E` | Metin önizlemesini düzenle | Düzenlerken Enter satır ekler; ⌘Enter veya Esc kaydeder ve bitirir. |
| `⌘O` | Linki tarayıcıda aç | Kütüphanedeki seçili link veya link önizlemesi; ⌘Enter yapıştırma içindir. |
| `⇧⌘C` | Görselde tanınan yazıyı kopyala | Görsel seçimi veya görsel önizlemesi; yerel OCR. |
| `M` | İşaretlemeyi aç / bitir | Görsel önizlemesinde. |
| `C` | Kırpmayı aç | Görsel önizlemesi veya işaretleme. Alanı çiz/taşı/boyutlandır; Enter uygular; Esc iptal eder. |
| `⌘Z / ⇧⌘Z` | Görsel düzenlemesini geri al / yinele | Kırpma ve işaretleme; metin düzenleyicilerin kendi geri alma işlemleri korunur. |
| `⌘S` | İşaretlemeyi kaydet | İşaretlemeden çıkmadan kaydeder. Esc veya ⌘Enter kaydedip bitirir. |
| `Pinch / wheel` | Görseli yakınlaştır | İlk sığdırma görünümünün %100–400’ü; çift tıklama sıfırlar. |
| `Drag / ⇧wheel` | Yakınlaştırılmış görselde gezin | %100 üstünde sürükle; Shift-tekerlek kaydırır. İşaretlemede Space basılı tutup sürükle. |

### İşaretleme araçları

| Varsayılan | İşlem | Nerede / ayrıntı |
| --- | --- | --- |
| `V` | İşareti seç, taşı ve boyutlandır | Yalnızca işaretleme modunda. |
| `B / H` | Kalem / saydam işaretleyici | Yalnızca işaretleme modunda. |
| `R / O` | Dikdörtgen / elips | Kare / daire için Shift basılı tut. |
| `A / D` | Ok / çizgi | Açıları 45° adımlara sınırlamak için Shift basılı tut. |
| `T` | Metin işareti | Var olan metni seçip çift tıklayarak yeniden düzenle. |
| `Backspace / Forward Delete` | Seçili işareti sil | İşaretleme modunda; askıdaki öğeyi kaldırmaz. |

## Yerel arşiv. Açıkça seçilen bağlantılar.

- **Mac’inde saklanır.** Geçmiş, klasör, etiket, not, küçük görsel ve arama indeksleri yerelde tutulur. ClipBoardLine bulut senkronizasyonu sunmaz. Yerel geçmiş bir parola kasası değildir; kopyaladığın ve sakladığın içerikleri sen seçersin.
- **Görsel ve metin yakalama isteğe bağlıdır.** İzlemeyi açmak panodaki eski içeriği içeri aktarmaz. Gizli, geçici ve otomatik üretilmiş pano işaretleri denetlenir; Finder dosya kopyaları atlanır ve uygulamanın kendi kopyaları yeniden eklenmez.
- **OCR ve görsel arama cihazda kalır.** Yazı tanıma, görsel vektörleri ve arama sorguları yerel çalışır. Çalışma anında OCR/görsel arama, görselleri veya sorgu metnini yüklemez.
- **Link zenginleştirme isteğe bağlı ağ erişimidir.** Açıkken başlık ve küçük görsel için linkin sitesine veya YouTube’a bağlanır. Yerel adresler ve bilinen gizli parametreleri taşıyan URL’ler dışlanır; istemiyorsan Kaynaklar’dan kapat.
- **Güncellemeler ağı kullanır, cihaz token’ı istemez.** Resmî Sparkle akışı ve arşivleri herkese açık ve imzalıdır. Kontrol ayarlanabilir; indirme ve kurulum senin işlemini gerektirir. Bu kanal GitHub hesabına giriş istemez.
- **Yapıştırmanın ayrı izni vardır.** ⌘Enter için uygulamanın macOS Erişilebilirlik izni gerekir. Önceki düzenlenebilir hedef doğrulanır; güvenli veya değişmiş hedefler reddedilir. Normal kopyalama bu izni istemez.
- **Geri getirilebilir kaldırma, korunan orijinaller.** Geçici kayıtlar kütüphanenin Çöp Kutusu’ndan kurtarılabilir. Harici özgün görseller, askıdan kaldırılınca silinmez. Süre sonu görsel, metin ve link için ayrıdır.

## Kaynak kodundan derleme ve test

Herkese açık kaynak kopyası, resmî dağıtım/güncelleme deposundan ayrıdır. Aşağıdaki komutlar için macOS SDK’sı bulunan Xcode ve Python 3 gerekir. Model hazırlama, sabitlenmiş MobileCLIP-S2 dosyalarını indirip yerelde derler; uygulamadaki arama çevrimdışı çalışır. Paketleme için deponun geliştirme rehberini izle. Resmî imzalama anahtarları, kimlik bilgileri ve kullanıcı geçmişi kaynak kopyasında bulunmaz.

```sh
git clone https://github.com/orkunisitmak/clipboardline-desktop.git
cd clipboardline-desktop
swift package resolve
swift test
bash scripts/build-community.sh
# İsteğe bağlı çevrimdışı anlamsal modeller (Vision OCR modelsiz de çalışır):
CLIPBOARDLINE_BUNDLE_MODELS=1 bash scripts/build-community.sh
# İsteğe bağlı izole arayüz test uygulaması:
bash scripts/build-ui-tests.sh
```

UI test uygulaması sentetik içerik ve ayrı tercihler kullanır. Asıl uygulamayı kurmaz veya pano toplamayı açmaz. Resmî imzalı sürümleri geliştirici hazırlar; kaynak kodunu klonlamak resmî imza kimliğini vermez.

## Katkıların hakkını vererek.

ClipBoardLine, Alejandro Buján’ın Tendedero uygulamasının upstream 1.5.0 tabanlı değiştirilmiş bir fork’udur. Gerçek MIT lisanslı kaynak atası Tendedero’dur; telif ve katkı bildirimleri korunur. ClipBoardLine ayrı isim ve görseller kullanır; özgün yazarın onayı veya desteği iddia edilmez.

Tangerine kullanım akışı açısından ilham kaynağıdır; kendi Nashi projemiz daha kolay yerel güncelleme deneyimine yön vermiştir. Bu bir ilham atfıdır; Tangerine’in kaynak atası olduğu veya ClipBoardLine’ı onayladığı iddiası değildir.

Güncellemeleri Sparkle sağlar. Cihazda arama Apple Vision ve özgün MobileCLIP-S2 modellerini kullanır; ilgili bildirimler ve model lisansları dağıtımda korunmalıdır. Uyarlanan Tendedero katkıları arasında Anubhav-Rai’ın pano yakalama katkısı, dil/kopyalama bildirimi, menü sayacı ve görsel arama köprüsü bulunur.

- [Tendedero — Alejandro Buján](https://github.com/alejandrobujan/tendedero)
- [MIT License](LICENSE)
- [Tangerine](https://tangerineformac.com/)
- [Sparkle](https://sparkle-project.org/)
- [Apple MobileCLIP](https://github.com/apple-aiml-research/ml-mobileclip)
