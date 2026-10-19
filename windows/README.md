# ClipBoardLine for Windows

[Main feature reference](../README.md) · [Türkçe](#türkçe) ·
[Source](https://github.com/orkunisitmak/clipboardline-desktop) ·
[Windows CI](https://github.com/orkunisitmak/clipboardline-desktop/actions)

This folder contains the separate Electron/Windows implementation. Its source,
packaged executable and installed application have separate native acceptance
checks. A passing model or renderer test on another operating system does not
certify native Windows paste, capture, global keys or installation. Check the
actual Windows CI result and release assets for the build you use.

## Start with collection off

Clipboard text, image and link capture all default to **off**. Open **Settings →
Sources** and choose each source you want. Text and link capture never opens the
shelves automatically. Link-title/thumbnail fetching is another explicit opt-in,
also off initially; enabling it applies to later captured/imported public links.
Local English/Turkish OCR indexing can be disabled independently.

History and managed images stay on this computer. Pins, folders and tags keep
records beyond ordinary expiry; other items have separate image/text/link time
limits and expire into recoverable Library Trash. Take-down hides saved records
from the shelf and trashes temporary ones. External original files remain in
place. There is no cloud sync, automatic macOS history import or encrypted vault.

## Keyboard workflow

Local bindings can be changed or disabled in **Settings → Keyboard shortcuts**.
Single-letter keys apply while browsing; text fields keep normal editing.

| Default | Action and scope |
| --- | --- |
| `Ctrl+Alt+Space` | Show/hide shelves from another application. |
| `Ctrl+Alt+S` | Show shelves with search focused. |
| `Ctrl+Alt+A` | Capture the current display, then open image crop/preview. |
| `L` | Open Library from shelves. |
| `Tab` / `Shift+Tab` | Cycle the active shelf. |
| `Left` / `Right` | Previous/next item. |
| `Up` / `Down` | Shelf search or shelf preview: previous/next visible nonempty row. Library: grid row or list item. Outside shelf search: previous/next item. |
| `Ctrl+Left` / `Ctrl+Right` | First/last result. |
| `Alt+Left` / `Alt+Right` | Previous/next page of nine shelf cards. |
| `1`–`9` | Choose the numbered card on the active shelf's current page. |
| `Shift+arrows` / `Ctrl+Click` / `Ctrl+A` | Range, individual and all-result selection. |
| `Space` | Open/close the focused item's preview. |
| `Enter` | Copy the selection/current preview, close the browsing window and return focus. This also closes Library-origin browsing in Windows; macOS Library differs. |
| `Ctrl+C` | Copy while keeping browsing open. |
| `Ctrl+Enter` | Explicitly paste into the previous editable Windows field. Secure or changed targets are rejected. In a text editor it first saves/finishes editing. |
| `P` / `Ctrl+P` | Toggle pin/favorite. |
| `F` / `Ctrl+Shift+F` | Toggle pinned-only results. |
| `Shift+P` | Pin to folder; type to filter, arrows to choose, Enter to confirm. `Ctrl+N` creates a folder in the picker. |
| `Alt+P` | Name and pin; with a batch, Enter saves then advances, Esc exits without changing the rest. |
| `Ctrl+Shift+T` | Add tags to the selected items. |
| `S` | Take down from shelves; preview advances to a surviving neighbor. |
| `Backspace` | Undo shelf take-down; in Library it opens the Trash confirmation. |
| `Delete` | Open the Trash confirmation. |
| `Ctrl+Shift+E` | Export selected copies through a folder chooser. |
| `Shift+S` | One text/OCR search across enabled shelves. Enter/Up/Down leaves the field for browsing; a subsequent Enter copies. |
| `Ctrl+F` | Focus Library search. |
| `Ctrl+0` / `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | Library filter: all/image/text/link. |
| `Ctrl+K` | Contextual Actions; arrows browse, Enter runs, Esc cancels. |
| `Shift+I` / `Shift+T` / `Shift+L` | Toggle image/text/link shelves. |
| `Ctrl+Shift+B` | Toggle all shelves versus the current shelf. |
| `Ctrl+O` | Open the selected link in the default browser. |
| `Ctrl+Shift+C` | Recognize and copy text from the selected image locally. |
| `E` | Edit a text preview. Enter adds a newline; Ctrl+Enter or Esc saves and finishes. |
| `M` / `C` | Enter image markup / crop. |
| `V`, `B`, `H`, `R`, `O`, `A`, `D`, `T` | Markup: select, pen, marker, rectangle, ellipse, arrow, line, text. |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo/redo in the current image editor session. |
| `Ctrl+S` | Save image edits without leaving markup. |
| `Enter` / `Esc` in crop | Apply / cancel the pending crop. |
| Wheel / drag | Zoom 100–400% of fitted view and pan; double-click resets. Hold Space to pan while marking up. |

The global actions currently supported are shelf toggle, shelf search and screen
capture. Separate global Library and copy-latest hotkeys are not implemented.
Native multi-image copying offers a FileDrop list and a first-image fallback;
the receiving app determines what it consumes. Images are not combined into a
single composite without your action.

## Current platform gaps

- Windows uses packaged Tesseract English/Turkish OCR, not Apple Vision or Core ML.
  Semantic image search is not implemented. Library search is literal text/OCR.
- Images keep immutable original files plus crop/annotation metadata and a rendered
  PNG. Undo/redo history is currently editor-session-only; the rendered result and
  editable annotations persist after closing.
- Quick Look, screen-recording preview and Trim are macOS-specific.
- The English interface has Turkish core labels; some detailed/status text remains
  English. This is not the full macOS translation set.
- The Windows update feed is separate from the Mac Sparkle feed. Public signed
  metadata and SHA-256 protect update integrity; the Windows installer currently
  has no Authenticode publisher certificate. Normal Windows first-run approval
  may be required. Do not disable system protections to install it.

## Development and validation

Use a supported Node.js version with npm on Windows x64. Dependencies are pinned
in `package-lock.json`. `npm start` uses a separate **ClipBoardLine Dev** data
folder; it cannot install official updates. It does not share the installed
application's user history.

```sh
npm ci
npm test
npm start
```

The unit suite covers persistence, exact-text deduplication, per-kind retention,
batches, Trash/undo, preference validation, network/update boundaries and renderer
keyboard state. It uses synthetic fixtures. Native acceptance must run on an
actual Windows desktop session:

```sh
npm run dist
npm run test:electron
```

The Windows workflow also exercises packaged/installed artifacts, a separate
native editable target, real text/image copy/paste, file-drop batches, capture,
local OCR and the renderer's actual keyboard events. Inspect its report rather
than interpreting the existence of this test as a passed result.

See [component licenses and notices](THIRD_PARTY_NOTICES.md), the project
[privacy guide](../PRIVACY.md), and [contribution guide](../CONTRIBUTING.md).

## Türkçe

Bu klasör, ayrı Electron/Windows uygulamasını içerir. Kaynak, paketlenmiş ve
kurulmuş uygulamanın yerel kabul testleri ayrıdır; başka sistemde geçen JavaScript
testi, Windows'ta gerçek yapıştırma veya kurulumun geçtiği anlamına gelmez.
Kullandığınız derlemenin Windows CI sonucuna ve sürüm dosyalarına bakın.

Pano görseli/metni/linki toplama ve link başlığı/thumbnail alma varsayılan olarak
**kapalıdır**. Ayarlar → Kaynaklar'dan istediklerinizi açın. Metin ve link
kopyaları askıyı otomatik açmaz. Yerel İngilizce/Türkçe OCR ayrı kapatılabilir.
Geçmiş yerel kalır; platformlar arası otomatik aktarım veya bulut senkronizasyonu
sunulmaz.

Windows'ta Command yerine **Control**, Option yerine **Alt** kullanılır. Genel
kısayollar `Ctrl+Alt+Space` (askı), `Ctrl+Alt+S` (arama) ve `Ctrl+Alt+A` (ekran
yakalama) olarak gelir; Ayarlar'dan değiştirilebilir. Yukarıdaki tablo Windows'a
özgü varsayılanların tamamını ve bağlamlarını gösterir. Enter Windows'ta
kütüphaneden de kopyalayıp pencereyi kapatır; macOS kütüphane davranışı farklıdır.

Görsel anlam araması, Quick Look ve kayıt Trim eşdeğeri yoktur. Tesseract OCR
cihazda çalışır; Apple modelleri Windows'ta paketlenmez. İşaretler ve kırpma kalıcı
tutulur; geri alma geçmişi mevcut görsel düzenleme oturumunundur. Bazı ayrıntı ve
durum metinleri İngilizcedir.

`npm start`, resmî uygulamadan ayrı ClipBoardLine Dev veri alanını kullanır ve
resmî güncelleme kuramaz. `npm test` sentetik testleri çalıştırır. Gerçek Windows
masaüstü oturumunda `npm run dist` ve `npm run test:electron` ile yerel kabulü
inceleyin. Windows kurulumunun şu anda Authenticode sertifikası yoktur; normal
sistem onayını kullanın, güvenlik korumalarını kapatmayın.
