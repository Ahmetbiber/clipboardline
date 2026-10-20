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

## Executable shelf contract

[`contracts/shelf-behavior.json`](../contracts/shelf-behavior.json) is the shared,
versioned behavioral specification. Its synthetic items use portable aliases and
are listed newest first. Every step contains an expected active row, focused
item, complete selection, visible rows and native search-editing state.

The current ten scenarios cover one selected image on opening, reopening,
hidden/empty/filtered image fallback, column-preserving vertical navigation and
clamping, hidden/empty row skipping, horizontal navigation, adding and hiding
rows, search caret keys and empty shelves. A future user-visible change must add
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
