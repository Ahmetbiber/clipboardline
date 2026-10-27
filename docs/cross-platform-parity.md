# One product on macOS and Windows

ClipBoardLine is one product on two operating systems. A user-visible feature,
shortcut or behavior change applies to both platforms by default. Implement and
validate both sides in the same change. An operating-system API difference is an
implementation detail, not permission to omit the corresponding feature.

If a native limitation requires a different behavior, document the exact affected
platform, user impact and reason in the shared contract's `nativeExceptions` and
review it explicitly. Command/Option on macOS and Control/Alt on Windows are the
current documented modifier-name difference; the actions keep the same meaning.
Never silently remove one platform from `defaultPlatforms`.

## Global access

Fresh installations use Control+Option+T on Mac and Control+Alt+T on Windows
for the shelf toggle, and Control+Option/Alt+S for shared search. Existing saved
Windows Control+Alt+Space or other custom choices remain unchanged. Global
Library and copy-latest-image shortcuts are configurable and off by default on
both platforms. Windows also keeps its configurable screenshot shortcut.
Settings can record or switch off each global action. A rejected replacement
keeps any previously working registration; copy-latest preserves the external
application's focus and copies the rendered image without opening the shelves.

## Executable shelf contract

[`contracts/shelf-behavior.json`](../contracts/shelf-behavior.json) is the shared,
versioned behavioral specification. Its synthetic items use portable aliases and
are listed newest first. Every step contains an expected active row, focused
item, complete selection, visible rows and native search-editing state.

The current eleven scenarios (62 observations per platform) cover one selected image on opening, reopening,
hidden/empty/filtered image fallback, column-preserving vertical navigation and
clamping, hidden/empty row skipping, horizontal navigation, adding and hiding
rows, search caret keys, empty shelves, remapping, disabling and restoring defaults.
A future user-visible change must add
or amend the relevant scenarios and both adapters in the same change. Extend the
contract's scope as the product grows; passing the current shelf scenarios is not
a claim that every feature has cross-platform coverage.

The adapters execute application behavior:

- macOS: `CrossPlatformBehaviorContractTests` creates the actual `LibraryStore`,
  `Line` and `LineKeyboard` with isolated synthetic files and preferences. It
  emits observations while running XCTest. It does not display windows, read
  application fields, post keys or touch the system clipboard.
- Windows: `renderer-ui.test.cjs` executes the shipped `renderer.js` handlers in
  its DOM/IPC fixture and records the rendered selection and active row. CI runs
  this adapter on Windows. Running it on a Mac is useful development feedback,
  but is explicitly rejected as Windows acceptance by the release checker.

These tests compare executed states to a common contract. They do not grep
source code or maintain a duplicate navigation implementation as the oracle.
The separate native Windows source, packaged and installed acceptance suites
still validate keyboard input, real text/image paste, focus, Library, rendering
and updates. Native Mac paste and focus acceptance remains a separate check.
Neither synthetic adapter proves that a particular third-party editor accepts
an OS paste command.

## CI evidence and publication

The existing read-only workflows emit exact-source reports:

| Workflow | Artifact | Report inside artifact |
| --- | --- | --- |
| `macos.yml` (`macOS source`) | `clipboardline-macos-parity-<source SHA>` | `macos.json` |
| `windows.yml` (`Windows application`) | `clipboardline-windows-<source SHA>` | `validation/parity/windows.json` |

Windows CI also runs when Mac sources, shared tests, the contract or parity guard
changes. Both native-host workflows must succeed for the same public commit.
Reports bind the complete source revision, exact contract SHA-256, platform,
host and adapter mode to every observed step. Missing, duplicate, unknown or
failing observations, a changed contract, execution errors, a stale revision or
a Windows report generated on another OS stop verification.

Release tooling authenticates the successful workflow runs, repository,
revision, artifact digests and report paths, then invokes:

```sh
python3 scripts/check-cross-platform-parity.py \
  --source-revision <full-public-source-SHA> \
  --macos-report <downloaded-macos-report.json> \
  --windows-report <downloaded-windows-report.json> \
  --report <local-validation-summary.json>
```

JSON alone is not an authenticated CI result. This checker never substitutes for
trusted artifact provenance, both platform version checks, native acceptance,
package signatures or the verified counterpart feed/package required for a
unified Latest release. Mac and Windows use the shared product version while
keeping independent monotonically increasing build counters. Unchanged Mac
application source does not require a new Mac binary merely because Windows
implementation, tests, documentation or CI changed.

Local development commands:

```sh
python3 scripts/test-cross-platform-parity.py
CLIPBOARDLINE_PARITY_REPORT=local/validation/parity/macos.json \
  swift test --filter CrossPlatformBehaviorContractTests
cd windows
CLIPBOARDLINE_PARITY_REPORT=validation/parity/windows.json npm test
```

On Windows PowerShell, set `$env:CLIPBOARDLINE_PARITY_REPORT` before `npm test`.
Commit no generated evidence, real clipboard content, local preferences,
credentials or signing material.


## 1.7.6: restored shelf slide

Mac build75 and Windows build69 retain the prepared shelf contents and fixed
native window bounds while restoring the downward reveal/upward dismissal.
The retained layer tree moves for 420ms opening and 220ms closing, using matching
curves on both platforms. Rapid reversal continues from the current presentation
position; generation guards reject stale hide completions. Pointer input waits
for the moving content to settle; keyboard navigation remains available. Reduce
Motion uses immediate endpoints.

Native validation must observe real compositor movement and fixed window bounds,
not infer animation from the target transform. Keep the existing performance,
focus, selection, retained-card and hidden-edit acceptance checks. The genuine
Windows upgrade baseline is 1.7.5/build68: 545769250 bytes, SHA256
`d37f86b5e355a58e3303899aa6917efb495a7f1d2a02732fd7e843cc1ef442e7`,
source `0d71154257aef8042a53ee6ff169079eddbb42bd`.
Stage `clipboardline-1.7.6-build75`, then publish `windows-1.7.6-build69`
with that exact counterpart; both feeds must say 1.7.6 before Latest promotion.


## 1.7.7: BAMA-inspired quality improvements

Mac build76 and Windows build70 retain the 1.7.6 shelf compositor and add retained
image-editor bases, recoverable per-type unsaved-history cleanup, capture-admission
protection and owned-global shortcut recorder suspension. The additive shared
contracts are `clipboard-admission.json`, `history-cleanup.json` and
`shortcut-recording.json` under `contracts/`. Their actual platform tests cover
literal private markers, unchanged nonblank bytes, identity/version-bound cleanup,
later copies and saves, cancellation, owned-registration lifecycle and conflicts.
The screenshot global action remains a Windows-specific native integration;
Command/Control follow platform conventions. Neither implementation may steal a
shortcut another process acquires while the recorder has released it.

Native Windows source/package/installed acceptance additionally exercises real
clipboard generation queries/replacement, 4K/8K editing with persisted pixel-exact
output, localized History UI, saved/media preservation and OS shortcut capture.
The signed candidate-updater gate uses the genuine published 1.7.6/build69 baseline.
Both exact-source native workflows and the original shelf/upgrade/signature gates
remain required. See [the research and measured scope](bama-adaptation-2026-10-27.md).
