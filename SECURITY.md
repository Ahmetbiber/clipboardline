# Security / Güvenlik

## English

Report security problems through the public repository's **Security → Report a vulnerability** feature when available. If private reporting is unavailable, open an issue requesting a private reporting channel; do not publish an exploit involving someone else's data, a credential, a clipboard sample or a private screenshot. Include the platform, published version, a synthetic reproduction and the expected result. Remove account names, paths, URLs with credentials, tokens and session cookies from evidence.

We evaluate reports against the latest published build for each platform. The macOS and Windows implementations have different operating-system integrations; a fix on one platform does not establish that the other was tested.

### Trust boundaries

- The source code is public. Official macOS release downloads and their update feed are signed. The official updater pins its release verification key; a source commit alone is not an application update.
- Self-built **ClipBoardLine Dev** is a separate application with a different bundle identifier and storage folder. Its updater is disabled. It cannot impersonate an official signed release or reuse the official application's frozen credential helper.
- Neither source builds nor official public updates need a GitHub token. Release-signing keys, signing profiles, Keychain material, user data and rollback backups must never be committed or included in an issue or pull request.
- Clipboard history can contain confidential material. File permissions are a local access restriction, not encryption, a password vault or protection from processes running as the same user.
- Optional link enrichment makes network requests. Current hostname checks are a best-effort filter and do not guarantee that every DNS resolution or redirect remains outside a private network. The community Dev builder defaults this feature to off; enable it explicitly only if you want these requests. Turn off link previews in sensitive environments.
- Opening a link, exporting a file, and pasting into another application cross application boundaries. The receiving application determines which formats it accepts.

Do not disable Gatekeeper, grant broad system permissions, change Keychain trust, or share signing credentials to work around an installation problem. Development builds may need their own macOS permission decisions; their ad-hoc identity does not provide persistent authorization across rebuilds. Official releases preserve their signing identity separately.

## Türkçe

Güvenlik sorunlarını, varsa public reponun **Security → Report a vulnerability** bölümünden özel olarak bildirin. Bu seçenek yoksa özel iletişim kanalı istemek için issue açın; başkasının verisini, anahtarını, pano içeriğini veya özel ekran görüntüsünü yayımlamayın. Platformu, yayımlanmış sürümü, yapay verilerle tekrar adımlarını ve beklenen sonucu ekleyin. Kanıtlardan kullanıcı adlarını, özel yolları, kimlik bilgili URL'leri, tokenları ve oturum çerezlerini çıkarın.

Raporlar her platformun en son yayımlanan sürümüne göre değerlendirilir. macOS ve Windows işletim sistemiyle farklı yöntemlerle çalışır; bir platformdaki düzeltme diğerinin test edildiği anlamına gelmez.

- Resmî macOS paketleri ve güncelleme akışı imzalıdır. Kaynak kod commit'i tek başına uygulama güncellemesi değildir.
- Kendiniz derlediğiniz **ClipBoardLine Dev**, farklı uygulama kimliği ve veri klasörü kullanır. Güncelleyicisi kapalıdır; resmî imzanın veya kimlik bilgisi yardımcısının yerini alamaz.
- Public güncellemeler ve kaynak koddan derleme GitHub tokenı istemez. İmza anahtarlarını, Keychain verilerini, kişisel geçmişi ve yedekleri Git'e veya hata raporlarına eklemeyin.
- Pano geçmişi hassas bilgi içerebilir. Yerel dosya izinleri şifreleme değildir; aynı kullanıcıyla çalışan diğer süreçlere karşı bir parola kasası sağlamaz.
- İsteğe bağlı link önizlemesi ağ isteği yapar. Mevcut alan adı kontrolü tüm DNS ve yönlendirme yollarında özel ağa erişimi engelleme garantisi vermez. Community Dev derlemesinde bu özellik varsayılan olarak kapalıdır; bu istekleri istiyorsanız kendiniz açın. Hassas ortamlarda link önizlemesini kapatın.

Kurulum sorununu aşmak için Gatekeeper'ı kapatmayın, Keychain güvenini değiştirmeyin ve imza anahtarı paylaşmayın. Geliştirme uygulamasının macOS izinleri ayrıdır; yeniden derlemeler, resmî sürümün sabit imzasıyla aynı izin devamlılığını sağlamaz.
