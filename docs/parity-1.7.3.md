# ClipBoardLine 1.7.3 platform parity

**Candidate, not published.** Native platform acceptance and final publication
are pending. The table describes implemented source behavior, not a claim that
every native check has passed or all product features are identical.

macOS and Windows share one product version and one behavior contract. Command
maps to Control, and Option maps to Alt, on Windows. Every future feature is a
two-platform change unless a native exception is recorded in the contract.

| Area | Shared behavior and corrections |
| --- | --- |
| Shelves | Opening selects the first available image only; empty/hidden rows are skipped. Up/Down cross rows, Left/Right move items, Command/Control-arrows reach endpoints and Option/Alt-arrows change pages. |
| Text identity | Both stores match NFC Unicode and CRLF/CR line endings, ignoring only outer paragraph breaks. Newest literal clipboard bytes replace the body while names, pins, folders, tags and notes survive. Spaces, indentation, case, invisible characters and internal blank lines remain significant. The shared `contracts/text-identity.json` fixture exercises both actual stores. |
| Shortcuts | Remapping, disabling and restoring defaults affect actual dispatch and displayed hints. Custom bindings take precedence over new defaults. Quick slots, selection extension, image tools and context-dependent editing commands are configurable. |
| Actions | Search, navigation, Library views, folders/tags, settings destinations, crop and markup use real controllers. Batch actions retain captured order; preview follows the focused batch member. |
| Library | Notes and inspector edits save automatically before navigation. Saved status survives unpinning or removing folders/tags. Multiple tags filter with AND; title descending, last-copied and relevance sorting are available. |
| Layout | Compact 52-pixel list rows with Title/Type/Tags/Added columns; sortable headers, resizable columns, persistent side panels and widths. Grid and list share selection/actions. |
| Preview | Frameless, aspect-fitted images use full-resolution rendered content. Text editing saves before arrows change items. Library preview arrows advance items; shelf preview Up/Down crosses rows without closing the preview. |
| Recordings | Candidate Windows native MP4/MOV import/watch, playback, M/Actions Trim and video-file copy/drag/export; original preserved and trim output MP4. Mandatory native acceptance remains pending; codec, native controls and Mac source-replacement differences are detailed below. |
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

## Screen recordings — candidate, mandatory native acceptance pending

The Windows candidate implements `.mp4`/`.mov` file import and collection from
explicitly configured watched folders. Recordings remain in Images, with a
poster and duration, and can use the same Library pin/name/folder/tag workflows.
The preview plays the video. **M** or **Actions → Trim video** opens start/end
range controls; Enter saves and Esc cancels. Copy, drag and export transfer the
recording file, not its poster. This describes candidate code, not a successful
native video test or a published feature.

A separate, bounded native worker uses the installed Windows WinRT media stack
(`MediaClip`, `MediaComposition`, `BitmapDecoder` and `MediaTranscoder`). There is
no additional FFmpeg/GPL executable download. At most two decoder jobs run, with
64 queued jobs; explicit Trim takes priority over queued background inspection.
Cancellation and the ten-minute job bound stop work and clean owned temporary
files. Video import uses streamed hashing and a 2 GiB file limit.

The original managed video remains immutable. A successful trim atomically
switches the record to a new MP4 and regenerates its poster while preserving
names, pins, folders, tags and notes. MP4 export can re-encode; identical codecs
or lossless passthrough are not promised. Codec support depends on the installed
Windows media stack. H.264/AAC MP4 **and** MOV fixtures must pass actual native
acceptance; HEVC, ProRes and every possible MOV codec are not guaranteed.

Mac recognizes `.mov`/`.mp4`; its screenshot watcher accepts recordings in the
application Inbox. Quick Look and AVKit provide native playback/trimming windows.
The current Mac Trim exports the kept range to a temporary file and replaces the
source recording. Windows retains its original instead. Native controls and
source-retention behavior therefore still differ explicitly.

The release gate must verify real decoding, poster pixels, seeking, the selected
trim duration, retained decoded audio, cancellation, source hashes, Library
organization, and actual video-file transfer in source, packaged and installed
Windows runs. Until those checks succeed, recording parity remains **pending
verification** and must not be reported as passed merely because a command
returned success. The 1.7.3 candidate remains unpublished.

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
