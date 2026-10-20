# ClipBoardLine 1.7.3 platform parity

macOS and Windows share one product version and one behavior contract. Command
maps to Control, and Option maps to Alt, on Windows. Every future feature is a
two-platform change unless a native exception is recorded in the contract.

| Area | Shared behavior and corrections |
| --- | --- |
| Shelves | Opening selects the first available image only; empty/hidden rows are skipped. Up/Down cross rows, Left/Right move items, Command/Control-arrows reach endpoints and Option/Alt-arrows change pages. |
| Shortcuts | Remapping, disabling and restoring defaults affect actual dispatch and displayed hints. Custom bindings take precedence over new defaults. Quick slots, selection extension, image tools and context-dependent editing commands are configurable. |
| Actions | Search, navigation, Library views, folders/tags, settings destinations, crop and markup use real controllers. Batch actions retain captured order; preview follows the focused batch member. |
| Library | Notes and inspector edits save automatically before navigation. Saved status survives unpinning or removing folders/tags. Multiple tags filter with AND; title descending, last-copied and relevance sorting are available. |
| Layout | Compact 52-pixel list rows with Title/Type/Tags/Added columns; sortable headers, resizable columns, persistent side panels and widths. Grid and list share selection/actions. |
| Preview | Frameless, aspect-fitted images use full-resolution rendered content. Text editing saves before arrows change items. Library preview arrows advance items; shelf preview Up/Down crosses rows without closing the preview. |
| Image editing | One top toolbar, zoom/pan, eight crop handles, apply/cancel, independent crop reset and annotation clearing, undo/redo after editing. |
| Links | Explicit refresh respects metadata preferences; verified YouTube black letterboxing is removed while real 4:3 content remains intact. Open-in-browser commands preserve their context. |
| Search | Names, text, notes, tags, link metadata and OCR are searchable. Windows now bundles the original MobileCLIP-S2 model through verified ONNX/WASM export; visual search runs offline in a worker with private derived caches. Text/visual/all modes respect the current Library scope. |
| Paste | Capture the external editor before opening; preserve it across own-window transitions; refresh it when returning to an already open Library. Revalidate the exact process, window and editable field before clipboard writes and dispatch. Changed, secure or read-only fields are rejected. Successful paste dismisses browsing UI and returns keyboard focus. |
| Language | Windows translations are generated from all nine shared localization catalogs; CI rejects drift. Existing explicit source/privacy preferences are preserved. |
| Updates | Both signed feeds and both current packages must appear together in Latest. Build66 upgrades the actual published build65 and preserves existing content/settings. Large offline-model downloads use a bounded five-minute socket timeout without relaxing signatures, size or hash validation. |

## Verification requirements

The shared contract executes through the real Mac key router/model and Windows
renderer. It also covers remapping, disabling, restoring defaults and preserving
typing inside search. The release verifier authenticates both native-host CI
artifacts at the exact public source revision.

Windows acceptance runs on Windows x64 against source, packaged and per-user
installed applications. It covers Library auto-save and real geometry, keyboard
remapping, full-resolution preview, crop/undo, real WASM image search, native
target tracking and text/PNG paste into WinForms, Microsoft Edge and Google
Chrome. Native focus, inserted destination content and post-paste typing must
agree; an IPC success flag alone is insufficient. NSIS upgrade/reopen is tested
separately against the actual previous installer.

Mac acceptance uses XCTest, isolated native Library/preview fixtures and actual
external editors. Computer Use cannot automate its own host ChatGPT/Codex
application; website or synthetic tests must never be reported as native ChatGPT
desktop acceptance. No security permission is granted automatically.

## Native platform details

AppKit materials and Windows window chrome use their respective platform
renderers. Text/file dragging has an explicit native exception: Windows keeps
ordinary text insertion and offers Alt-drag for per-item `.txt`/`.url` copies;
Mac can advertise text and files in the same drag. See
[native transfer](windows-native-transfer.md). Neither distinction changes
Library organization, copy or paste commands.

Offline model provenance, licenses and reproducible export instructions are in
[Windows search models](windows-search-models.md). Models are build assets in
the existing public project repository; no client credential or runtime model
download is required.
