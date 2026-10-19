# ClipBoardLine

**A place for everything you copy.**

Images, text and links, close at hand. Keep recent copies on three shelves, save what matters in a local Library, and move through it all with your keyboard.

[Türkçe README](README.tr.md) · [Download for Mac](https://github.com/orkunisitmak/clipboardline-app/releases/latest) · [Download for Windows x64](https://github.com/orkunisitmak/clipboardline-desktop/releases/download/windows-1.7.1-build63/ClipBoardLine-Setup-1.7.1-x64.exe) · [Explore source](https://github.com/orkunisitmak/clipboardline-desktop)

> The macOS edition uses Swift, AppKit, SwiftUI, Vision and Core ML on macOS 14 or later, for Apple silicon and Intel. The separate Electron edition is available for Windows x64; see the platform matrix for differences and native validation evidence.

## Your first five minutes

1. **Install and open.** Download the latest Mac release, move the app to Applications and open it. ClipBoardLine lives in the menu bar.
2. **Choose what to collect.** In Settings → Sources, enable image or text capture if wanted. Standalone-link capture defaults on and can be disabled. Choose screenshot handling separately.
3. **Browse without breaking your flow.** Press ⌃⌥T, use the arrow keys and press Space to preview. Enter copies and closes the shelves; focus returns to the previous app.
4. **Keep the useful things.** Press P to pin, ⇧P to choose a folder or ⌥P to add a useful name. Tagged or filed records remain after normal history expires.
5. **Make it your own.** Set retention for each content type, record shortcuts, choose colors and toggle automatic update checks in Settings.

## Full feature inventory

| Feature | What it does |
| --- | --- |
| **Three independent shelves** | Browse Images, Texts and Links as separate horizontal rows. Toggle each row, switch the active shelf, filter pinned items and scroll through older copies. Fresh openings return each visible row to its first item. |
| **Screenshot and clipboard capture** | Handle screenshots instantly, watch up to three additional image folders, and optionally collect copied images or text. Clipboard image and text collection are independent opt-ins. Text and link copies arrive silently without opening the shelves. |
| **A local Library** | A resizable native window with grid and list views, a folder/tag sidebar and an editable inspector. Create notes, edit titles and content, and organize images, text and links together. Full screen is optional. |
| **Pin, name, file and tag** | Pin and favorite are one action. Pins, folder membership or tags retain an item beyond ordinary history expiry. Use nested virtual folders and multiple tags; name-and-pin supports a sequential batch workflow. |
| **One shelf search** | The centered search field searches all currently visible shelves: text, link details, titles, notes, tags and recognized text in images. Hidden shelves are excluded. Browse results without opening Library. |
| **OCR and visual search** | Apple Vision OCR and MobileCLIP-S2 run on the Mac. Library offers text/OCR, visual, or combined search, plus type, date, domain, tag, folder and pinned filters. Visual descriptions work best in English. |
| **Link cards with context** | A standalone copied web URL goes to Links; a paragraph containing URLs stays text. Optional enrichment adds website or YouTube titles, authors and thumbnails. Open the selected link in your browser. |
| **Borderless previews** | Space opens images, editable text and link previews. Shelf previews can move across content types without closing the window. Image zoom runs from initial fit to 400%; pinch, wheel and drag-to-pan are supported. |
| **Editable markup and crop** | Pen, translucent marker, rectangle, ellipse, arrow, line and text tools share the top preview toolbar. Move/resize marks, change styles and undo. Crop non-destructively; original files and editable annotations remain available. |
| **Copy, paste, drag and export** | Copy selected batches in order, drag multiple items, export copies, or explicitly paste into the editable field previously focused in another app. Image copies include full-resolution crop/markup. Multiple-image paste depends on the destination app. |
| **History without repeated text cards** | Configure image, text and link retention separately: 1, 3, 7, 15 or 30 days, with 30 days as the default. Re-copying equivalent text refreshes one current entry instead of filling the shelf with duplicates; saved organization is preserved. |
| **Take down and recover** | S removes the selection and selects the next surviving item. Saved records remain in Library; temporary copies enter recoverable Trash. Backspace restores the latest shelf removal, including batches, during the current app session. External original files are preserved. |
| **Keyboard-driven Actions** | Search the contextual Actions bar for organization, navigation, image editing, Library views, settings and updates. Commands show current shortcut assignments and operate on the item or ordered batch captured when the bar opened. |
| **A Mac interface you can tune** | Small, medium and large cards; soft shelf colors or neutral glass; configurable reveal behavior, full-screen-app visibility, sounds and login launch. Choose the app language independently of macOS. Most browsing shortcuts can be remapped or disabled. |
| **Native signed updates** | Sparkle presents release notes, downloads and installation. Official public updates need no GitHub account or token. Automatic checks can be disabled; when enabled they run hourly while the app is running. Download and installation require your action. |

## macOS default keyboard shortcuts

This table lists macOS defaults. The complete [Windows keymap](#windows-default-keyboard-shortcuts) below has its own contexts; see also the [Windows guide](windows/README.md). Settings → Keyboard shortcuts can change or disable browsing bindings and global hotkeys. Single-letter keys belong to the app only while browsing; text fields keep normal typing. ⌘ Command · ⌥ Option/Alt · ⌃ Control · ⇧ Shift.

### Global access

| Default | Action | Where / details |
| --- | --- | --- |
| `⌃⌥T` | Show or hide shelves | Global; configurable in Settings. |
| `⌃⌥S` | Open shelves with search focused | Global; configurable or off. |
| `Off by default` | Open Library globally | Set your own shortcut; Settings offers ⌃⌥L. |
| `Off by default` | Copy latest image globally | Set your own shortcut; presets include ⌃⌥C and ⌃⇧C. |

### Browse and select

| Default | Action | Where / details |
| --- | --- | --- |
| `L` | Open Library | While shelves are focused. |
| `Tab / ⇧Tab` | Switch active shelf | Shelves; both cycle the active row. |
| `← / →` | Previous / next item | Shelves, Library and previews. |
| `↑ / ↓` | Navigate rows or results | Shelf search: previous/next visible nonempty row. Shelf preview: switch row. Library: previous/next grid row (list: item); Library preview: previous/next result. Outside shelf search: previous/next item. |
| `⌘← / ⌘→` | First / last shelf item | Shelves and shelf-origin previews. |
| `⌥← / ⌥→` | Previous / next shelf page | Moves between visible numbered pages; also in shelf previews. |
| `1–9` | Select numbered visible card | Active shelf; numbers follow the viewport and filters. |
| `⇧← / ⇧→ / ⇧↑ / ⇧↓` | Extend selection | Shelves and Library; native typing keeps editor shortcuts. |
| `⌘A` | Select all visible items | Active shelf or current Library result set. |
| `⌘Click` | Toggle individual selection | Add or remove cards from a batch. |

### Copy and organize

| Default | Action | Where / details |
| --- | --- | --- |
| `Enter` | Copy; shelves close and focus returns | Shelves: selected batch. Shelf preview: current item, closing preview and shelves. Library/Library previews: copy without this shelf-dismiss behavior. |
| `⌘C` | Copy and keep browsing | Selection or current preview; windows stay open. |
| `⌘Enter` | Paste into previous app | Needs Accessibility permission and the original editable target. While editing text, finishes editing first. |
| `P / ⌘P` | Toggle pin / favorite | One shared action for images, text and links. |
| `F / ⇧⌘F` | Toggle pinned-only results | Active shelf or Library scope; previews support the filter. |
| `⇧P` | Pin to folder | Batch-aware picker: type to search; ↑/↓ choose; Enter confirm; Esc cancel. ⌘N creates a folder in the picker. |
| `⌥P` | Name and pin | For a batch, Enter saves then advances; Esc leaves the remaining items unchanged. |
| `⇧⌘T` | Add tag | Search existing tags or create a new one; supports selected batches. |
| `S` | Take down from shelf | Shelves and shelf previews; chooses the next item without closing the preview. |
| `Backspace ⌫` | Undo latest shelf take-down | Shelves/shelf previews; up to 32 batches this app session. Library uses Backspace for Trash instead. |
| `Forward Delete ⌦` | Confirm Move to Trash | Shelves and Library; Library also accepts Backspace. |
| `⇧⌘E` | Export selected copies | Shelves or Library; originals stay in place. |

### Search, actions and shelf visibility

| Default | Action | Where / details |
| --- | --- | --- |
| `⇧S` | Search visible shelves | One query across enabled image OCR, text and link rows. Enter or ↑/↓ leaves the search editor for result browsing; press Enter again to copy. |
| `⌘K` | Open Actions | Shelves, Library, previews and Settings. ↑/↓ selects; Enter runs; Esc closes. |
| `⇧I / ⇧T / ⇧L` | Toggle Images / Texts / Links | While shelves are focused. Closing the final row closes the shelves. |
| `⇧⌘B` | Toggle all shelves / active shelf | While shelves are focused. |
| `⌘F` | Focus Library search | Library; preserves native text editing. |
| `⌘0 / ⌘1 / ⌘2 / ⌘3` | Filter all / images / text / links | Library only. |

### Preview and image editing

| Default | Action | Where / details |
| --- | --- | --- |
| `Space` | Open / close preview | Focused content; while typing, Space remains text. |
| `Esc` | Close preview, search or shelf | Editing modes finish/cancel their own operation first. |
| `E` | Edit text preview | Enter adds a newline while editing; ⌘Enter or Esc saves and finishes. |
| `⌘O` | Open link in browser | Selected link in Library or a link preview; ⌘Enter is reserved for paste. |
| `⇧⌘C` | Copy recognized text from image | Image selection or image preview; local OCR. |
| `M` | Enter / finish markup | Image preview. |
| `C` | Open crop | Image preview or markup. Drag/move/resize the area; Enter applies; Esc cancels. |
| `⌘Z / ⇧⌘Z` | Undo / redo image edits | Crop and markup; native text editors keep their own undo. |
| `⌘S` | Save markup | Saves without leaving markup. Esc or ⌘Enter saves and finishes markup. |
| `Pinch / wheel` | Zoom image | 100–400% of the initial fitted view; double-click resets. |
| `Drag / ⇧wheel` | Pan zoomed image | Drag above 100%; Shift-wheel pans. In markup, hold Space and drag. |

### Markup tools

| Default | Action | Where / details |
| --- | --- | --- |
| `V` | Select, move and resize annotation | Markup mode only. |
| `B / H` | Pen / translucent marker | Markup mode only. |
| `R / O` | Rectangle / ellipse | Hold Shift for a square / circle. |
| `A / D` | Arrow / line | Hold Shift to constrain angles to 45° steps. |
| `T` | Text annotation | Select then double-click existing text to edit again. |
| `Backspace / Forward Delete` | Delete selected annotation | In markup; does not remove the shelf item. |

## Windows default keyboard shortcuts

These are the Windows defaults, separate from the macOS table. Control replaces Command and Alt replaces Option, but the scopes below are authoritative. The three global keys and the 48 local action bindings can be changed or disabled in Settings → Keyboard shortcuts. Fixed Enter, Escape, selection aliases, dialog and editor control keys keep their contextual behavior; changing a local action does not remap those fixed handlers. Text fields keep normal typing before browsing shortcuts.

[Windows native guide](windows/README.md) · [Platform differences](#platform-support-and-current-gaps)

### Windows · Global access

| Default | Action | Where / details |
| --- | --- | --- |
| `Ctrl+Alt+Space` | Show / hide shelves | Works while another application is active. |
| `Ctrl+Alt+S` | Open shelf search | Shows shelves with the shared search field focused. |
| `Ctrl+Alt+A` | Capture a screen | Captures the display under the pointer; opens the new image in crop/preview. |

### Windows · Browse, select and find

| Default | Action | Where / details |
| --- | --- | --- |
| `L` | Open Library | From focused shelves or a shelf-origin preview. |
| `← / →` | Previous / next item | Shelves, Library and previews; the preview changes in place. |
| `↑ / ↓` | Move between rows or items | Shelf search / shelf preview: previous or next visible nonempty shelf. Library and its previews: grid row (list: item). Shelves outside search: previous / next item. |
| `Ctrl+← / Ctrl+→` | First / last result | Current shelf or Library result set, including previews. |
| `Alt+← / Alt+→` | Previous / next page | Moves by the active shelf’s visible page size, up to nine cards, based on window width and card size. Library still jumps nine results. Works in previews. |
| `Tab / Shift+Tab` | Cycle active shelf | Both cycle in the same direction. Shelves only; dialogs use normal focus traversal. |
| `1–9` | Choose numbered card | Choose an available numbered card on the active shelf’s visible page, up to nine; outside preview. |
| `Shift+← / Shift+→ / Shift+↑ / Shift+↓` | Extend selection | While browsing shelves or Library; text fields keep normal editing. |
| `Ctrl+A` | Select all current results | Active shelf or current Library result set. |
| `Ctrl+Click / Shift+Click` | Individual / range selection | Use modifiers or Select items mode to select without copying. A plain shelf click copies and keeps shelves open; Library clicks select, and double-click previews. |
| `Shift+S` | Search visible shelves | One literal query across enabled image OCR, text and link rows. Hidden shelves are excluded. |
| `Ctrl+F` | Focus Library search | Library browsing only. Native editing fields keep their shortcuts. |
| `Ctrl+0 / Ctrl+1 / Ctrl+2 / Ctrl+3` | All / images / text / links | Library type filters only. |
| `Ctrl+K` | Open Actions | Shelves, Library, previews and Settings; not during text-preview editing. Type to filter; ↑/↓ choose; Enter runs; Esc closes. |
| `Enter / ↑ / ↓ / Esc in search` | Leave or close search | Enter or arrows focus results; press Enter again to copy. Esc clears the query and closes shelf search. |

### Windows · Copy, organize and recover

| Default | Action | Where / details |
| --- | --- | --- |
| `Enter` | Copy selection / current preview | Shelves/shelf previews: copies and closes shelves/preview, returning focus. Library and Library-origin previews: copies and stays open. Editors and dialogs handle Enter first. |
| `Ctrl+C` | Copy and keep browsing | Selected batch, or the current item when a preview is open. |
| `Ctrl+Enter` | Paste into the previous app | Needs the original editable target; secure or changed targets are rejected. While editing text/image, saves and finishes editing first. |
| `P / Ctrl+P` | Toggle pin / favorite | One action for images, text and links; supports selected batches. Ctrl+P is a fixed alias. |
| `F / Ctrl+Shift+F` | Toggle pinned-only results | Active shelf, or Library saved/pinned scope; previews support it. Ctrl+Shift+F is a fixed alias. |
| `Shift+P` | Pin to folder | Batch picker: type to filter; ↑/↓ choose; Enter confirms; Esc exits. Ctrl+N creates a folder in the picker. |
| `Alt+P` | Name and pin | With multiple selections, Enter saves the current name and advances; Esc leaves remaining items unchanged. |
| `Ctrl+Shift+T` | Add tags | Applies to the selected batch; preserves each item’s existing tags. |
| `S` | Take down from shelf | Shelves/shelf previews only. The next surviving neighbor stays selected and an open preview stays open. Saved records remain in Library. |
| `Backspace` | Undo shelf take-down | Shelves/previews: latest removal, up to 32 batches this session. Library opens the Trash confirmation instead. |
| `Delete` | Move to Trash with confirmation | Browsing shelves or Library. In an image editor, deletes the selected annotation instead. |
| `Ctrl+Shift+E` | Export selected copies | Choose a destination folder; external originals stay in place. |

### Windows · Shelf visibility

| Default | Action | Where / details |
| --- | --- | --- |
| `Shift+I / Shift+T / Shift+L` | Toggle Images / Texts / Links | Shelves and shelf-origin previews. Closing the last row hides the shelves. |
| `Ctrl+Shift+B` | All shelves / active shelf | Shelves only; Library type filters are separate. |

### Windows · Preview, text and image editing

| Default | Action | Where / details |
| --- | --- | --- |
| `Space` | Open / close preview | While browsing. In text fields it types a space; in image editing it is held to pan. |
| `Esc` | Close current layer | Outside editing: closes preview, then search, then hides the app. Dialogs and editors use the rules below. |
| `Ctrl+O` | Open selected link in browser | Selected link in shelves, Library or preview; Ctrl+Enter remains paste. |
| `Ctrl+Shift+C` | Copy recognized image text | Selected image or image preview; local English/Turkish OCR. Keeps browsing open. |
| `E` | Edit text | Opens the selected text’s editable preview. Enter adds a newline; Ctrl+Enter or Esc saves and finishes. |
| `M` | Enter / finish image markup | Selected image or image preview. When an image editor is already open, saves and finishes it. |
| `C` | Open image crop | Selected image, image preview or markup; original pixels remain available. |
| `Enter / Esc in crop` | Apply / cancel crop | Enter saves and leaves the editor. Esc restores the pre-crop area and switches to the Select tool, keeping the editor open. |
| `Ctrl+Enter / Esc in markup` | Save and finish markup | Outside the Crop tool, either saves and finishes. Plain Enter does not copy while editing. Save failures keep the draft open. |
| `Ctrl+S` | Save without leaving markup | Image editor only; keeps editing open. |
| `Ctrl+Z / Ctrl+Shift+Z` | Undo / redo image edits | Current image-editor session. Native text fields keep their own undo. |
| `Backspace / Delete in markup` | Delete selected annotation | Does not remove the image item; crop selection is separate. |
| `Wheel / double-click` | Zoom / reset image | Wheel zooms from 100% to 400% of the initial fit; double-click outside editing resets. |
| `Drag / Shift+wheel / hold Space+drag` | Pan image | Drag when zoomed; Shift+wheel pans. In image editing, hold Space and drag. |

### Windows · Markup tools

| Default | Action | Where / details |
| --- | --- | --- |
| `V` | Select / move / resize annotation | Image editor only. Double-click an existing text annotation to edit its text. |
| `B / H` | Pen / translucent marker | Image editor only; color and width are in the top toolbar. |
| `R / O` | Rectangle / ellipse | Image editor; hold Shift while drawing for a square / circle. |
| `A / D` | Arrow / line | Image editor; hold Shift while drawing to constrain angles to 45° steps. |
| `T` | Text annotation | Image editor only; opens a dialog for the annotation’s text. |

### Windows · Dialogs and shortcut recording

| Default | Action | Where / details |
| --- | --- | --- |
| `↑ / ↓ / Enter / Esc` | Choose, confirm or cancel | Actions and folder pickers. In a multiline note, Enter is a newline; Ctrl+Enter confirms. |
| `Ctrl+N in folder picker` | Create a folder | Returns to the picker after creation. |
| `Tab / Shift+Tab in dialogs` | Move focus | Dialog focus is contained in its controls; these keys do not switch shelves there. |
| `Esc / Backspace / Delete while recording` | Cancel / disable a binding | Esc cancels recording. Backspace or Delete records Off; choose Save to apply. These recording keys are fixed. |

The supported global actions are shelves, search and screen capture. Separate global Library and copy-latest shortcuts are not implemented. See the Windows native guide for collection defaults, platform gaps, build commands and native acceptance evidence.

## Windows interface and updates — 1.7.1

### Hanging shelves over your desktop

Images, text and links hang from three curved ropes on a transparent desktop surface. Aspect-fit image frames preserve wide or portrait screenshots; row controls stay compact. A plain shelf click copies and keeps browsing open. Turn on Select items or hold Ctrl/Shift to select only; clicking an empty shelf area hides the shelves.

### A normal Library and Settings workspace

Library opens in a resizable window with minimize, maximize and close controls. Its unified toolbar offers search, view and filter controls plus sidebar/inspector toggles. Neutral grid/list cards show media, type and tags. Settings uses a branded sidebar and grouped controls; full screen is not forced.

### One centered search and Actions language

Shelf search floats in the center with visible-type chips and a result count. Enter or Up/Down leaves text entry for result navigation; the applied query remains as a compact summary. Actions uses the same visual language and centered shortcut badges.

### Preview without breaking your flow

Space previews the focused item. Arrow keys change content in place; the top row combines navigation with markup/crop tools while keeping navigation accessible. Enter closes shelf-origin browsing after copying; Library and Library-origin previews stay open.

### Pages sized to the visible shelf

Alt+Left/Right advances by the number of cards that fit, up to nine, based on window width and card size. Number keys select the cards actually offered on that page. Library uses its actual grid columns for Up/Down and nine-result Alt jumps.

### Check automatically, install deliberately

When enabled, update checks are scheduled after launch when due and hourly while running; failed checks retry after five minutes. New versions appear in the tray, shelf badge and Updates page; notifications open that page. Checks never install. Click Update and reopen to download, verify the signed manifest and installer hash/size, replace the app and reopen it. Existing Library/settings are retained, and no GitHub token is required.

[Windows implementation and validation guide](windows/README.md)

## Local collection. Explicit connections.

- **Stored on your Mac.** History, folders, tags, notes, thumbnails and search indexes live locally. ClipBoardLine does not provide cloud sync. Local storage is not a password vault; choose what you copy and retain.
- **Image and text capture are opt-in.** Turning a watcher on skips the previous clipboard contents. Concealed, transient and autogenerated clipboard markers are checked, Finder file copies are skipped, and the app suppresses its own copies.
- **OCR and visual search stay on-device.** Image recognition, visual embeddings and search queries run locally. Runtime OCR/visual search does not upload images or query text.
- **Link enrichment is optional network access.** Enabled enrichment contacts the linked website or YouTube for metadata and thumbnails. Local addresses and URLs with known secret parameters are excluded; disable enrichment in Sources if unwanted.
- **Updates use the network, not a client token.** The official Sparkle feed and archives are public and signed. Checks are configurable; downloads and installation need your action. This update channel does not require a GitHub login.
- **Paste has a separate permission.** ⌘Enter needs the app’s macOS Accessibility permission. It validates the original editable field and refuses secure or changed targets. Ordinary copying does not require that permission.
- **Recoverable removal, preserved originals.** Temporary records can be recovered from Library Trash. External source images are not deleted by taking them off the shelf. Expiry is separate for images, text and links.

## Build and test from source

The public source snapshot is separate from the official binary/update repository. Xcode with a macOS SDK and Python 3 are needed for the commands below. Optional model preparation downloads pinned MobileCLIP-S2 assets and compiles them locally; runtime search works offline. Use the repository’s development guide for packaging. Official release signing keys, credentials and user history are not included.

```sh
git clone https://github.com/orkunisitmak/clipboardline-desktop.git
cd clipboardline-desktop
swift package resolve
swift test
bash scripts/build-community.sh
# Optional offline semantic models (Vision OCR works without them):
CLIPBOARDLINE_BUNDLE_MODELS=1 bash scripts/build-community.sh
# Optional isolated UI harness:
bash scripts/build-ui-tests.sh
```

The UI harness uses synthetic fixtures and separate preferences. It does not install the app or enable clipboard collection. Official signed releases are built by the maintainer; cloning the source does not grant the official signing identity.

## Built on real shoulders.

ClipBoardLine is a modified fork of Tendedero by Alejandro Buján, based on upstream 1.5.0. Tendedero is the actual MIT-licensed source upstream; its copyright and contributor acknowledgements remain. ClipBoardLine uses its own name and artwork and is not endorsed by the original author.

Inspired by Tendedero, ClipBoardLine extends its clipboard workflow with a local Library, shared OCR search, pinning and naming, folders and tags, editable image markup and crop, keyboard navigation and public signed updates.

Sparkle provides the updater. Apple Vision and the original MobileCLIP-S2 models provide on-device search; their respective notices and model licenses must accompany distribution. Adapted Tendedero contributions include clipboard capture by Anubhav-Rai, language/copy feedback, the menu count and the image-search bridge.

- [Tendedero — Alejandro Buján](https://github.com/alejandrobujan/tendedero)
- [MIT License](LICENSE)
- [Sparkle](https://sparkle-project.org/)
- [Apple MobileCLIP](https://github.com/apple-aiml-research/ml-mobileclip)


## Platform support and current gaps

Windows [1.7.1 build 63](https://github.com/orkunisitmak/clipboardline-desktop/releases/tag/windows-1.7.1-build63) is released: [download the x64 installer](https://github.com/orkunisitmak/clipboardline-desktop/releases/download/windows-1.7.1-build63/ClipBoardLine-Setup-1.7.1-x64.exe).

For source revision [`e734c7e`](https://github.com/orkunisitmak/clipboardline-desktop/commit/e734c7e97c0f8b22ff27a4ead3f82382407854cd), [Windows CI run 39296605977](https://github.com/orkunisitmak/clipboardline-desktop/actions/runs/39296605977) passed **65 Node tests, 146 native acceptance checks** (48 source, 49 packaged, 49 installed) and **7 isolated upgrade checks**.

**One-time build 62 → 63 upgrade note:** if the installer finishes without reopening ClipBoardLine, open it manually once. The original 1.7.0 build 62 client predates the relaunch fix. The successful upgrade test uses the corrected client with a simulated old version; it does not retrofit the old installed client’s flags.

The release was checked in actual Windows source, packaged and installed sessions, including text/image paste, focus return, capture, OCR and keyboard workflows. Destination apps still decide which clipboard formats they accept. macOS and Windows data stores are separate; cross-device sync and automatic migration between them are not provided.

| Capability | macOS | Windows |
| --- | --- | --- |
| Content shelves and Library | Native AppKit/SwiftUI; image/text/link shelves, grid/list, folders, tags and pins. | Transparent curved hanging shelves; a normal resizable Library window with unified toolbar, grid/list, folders, tags, pins, notes and toggled sidebar/inspector. |
| Default global shortcuts | ⌃⌥T shelves; ⌃⌥S search. | Ctrl+Alt+Space shelves; Ctrl+Alt+S search; Ctrl+Alt+A screen capture. Separate global Library/copy-latest shortcuts are not currently implemented. |
| Local shortcut modifiers | Command (⌘) for app commands; Option (⌥) for naming/pages. | Control replaces Command; Alt replaces Option. Local and global bindings are configurable. |
| Clipboard collection | Image/text opt-in; standalone link capture configurable. | Image/text/link collection all default off. Enable each explicitly in Sources. Text and link capture stays silent. |
| Search and OCR | Apple Vision OCR; optional original MobileCLIP-S2 semantic image search. | Local Tesseract OCR with packaged English/Turkish data. Literal text/OCR search; no semantic image search. |
| Preview editing | Borderless image/text/link previews; persistent vectors/crop; richer native inspector. | Frameless image/text/link previews; shared top markup/navigation row and original-preserving crop. Undo history belongs to the current editor session. |
| Copy and paste | ⌘Enter targets the original editable field using app Accessibility permission. | Ctrl+Enter restores the prior editable Windows field through the native bridge. Secure/changed targets are rejected. |
| Image batches | Multiple image/file representations; destination app decides what to accept. | Native FileDrop list plus first-raster fallback. Destination support varies; items are not silently stitched together. |
| Retention and recovery | Per-kind 1/3/7/15/30-day choices; retained items survive; Library Trash. | Separate per-kind history including Keep forever; saved items survive; recoverable Trash and session take-down undo. |
| Link metadata | Optional public website/YouTube titles and thumbnails. | Explicit opt-in, default off. New captured/imported public links may fetch titles/thumbnails after enabling. |
| Recordings and Quick Look | macOS Quick Look and recording Trim integration. | No Quick Look, recording preview or Trim equivalent in this implementation. |
| Languages | Upstream languages retained; new Library text primarily English/Turkish. | English UI with Turkish core labels; some detailed/status strings remain English. OCR supports English/Turkish. |
| Updates and OS trust | Sparkle signed public feed and archives. Project-signed Mac build is not Apple-notarized. | Separate signed Windows channel; configurable launch/hourly checks and five-minute failure retry. Update and reopen requires a click. The installer has no Authenticode publisher certificate. |

Normal operating-system approval may be required on first open. The Mac build uses a persistent project certificate rather than Apple Developer ID/notarization; the Windows installer is not Authenticode-signed. Update signatures and hashes establish the project update channel, not Apple or Microsoft publisher certification. Use the documented release assets and normal OS approval; do not disable system protections.

Windows runtime notices: Electron is MIT; Chromium and its bundled components retain their BSD-style and other individual licenses in LICENSES.chromium.html. Tesseract.js/Core use Apache-2.0. English/Turkish traineddata retains the upstream language-data Apache-2.0 terms separately from the MIT package-wrapper metadata. Complete bundled texts and notices are listed in windows/THIRD_PARTY_NOTICES.md.

### Windows source development

```sh
cd windows
npm ci
npm test
npm start
# On the Windows x64 runner:
npm run dist
npm run test:electron
```

[Windows component notices](windows/THIRD_PARTY_NOTICES.md)
