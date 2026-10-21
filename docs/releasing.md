# Signed GitHub updates

## Unified public distribution

`orkunisitmak/clipboardline-desktop` (repository ID 1425566096) is the single
public repository for audited source, macOS packages and Windows installers.
The original development history remains private in `orkunisitmak/clipboardline`.
Never mirror or merge that private history into the public checkout at
`local/public-source/clipboardline-desktop`. Public tags target audited public
commits, never a private source revision. Preserve all existing signing keys,
macOS identifiers, data paths and the frozen credential helper.

Both shipped platforms use repository-wide `releases/latest/download` URLs.
Therefore EVERY release designated Latest must contain both `appcast.xml` and
`windows-update.json`, plus both current packages. A platform-only Latest would
break the other platform. `scripts/unified_release_assets.py` authenticates both
channels with the existing public key, verifies their bound package bytes, and
composes exactly seven assets: Mac ZIP, Windows EXE, both feeds,
`LICENSES-macOS.txt`, `LICENSES-Windows.txt` and combined `SHA256SUMS`.
The original four platform assets remain immutable in their preparation folders.
The counterpart is frozen from the current canonical release and revalidated
immediately before publication. A shared nonblocking owner-only local lock
serializes both publishers and migration on the private signing host; GitHub has
no atomic compare-and-swap for Latest, so do not publish from another host at
the same time. Installation still requires a user's click.

The old `clipboardline-app` name is reserved for the verified compatibility
redirect. Never recreate a repository there. Its original repository is retained
as a private archived rollback copy. Existing Mac installations use their old
signed URL; new builds pin the canonical desktop URL. The exact old repository
and feed pair remains accepted for compatibility; mixed pairs and altered keys
are rejected. See [the migration record](repository-consolidation-2026-10-19.md).

For a Mac release, commit/push private build inputs and the corresponding clean,
audited public source export. Build using the persistent signing profile, prepare
the legacy-compatible package with `scripts/publish-review-release.py`, then
publish using `python3 scripts/publish-public-release.py --publish`.
The public publisher verifies the separate public checkout/origin/pushed HEAD,
its complete source/secret audit and absence of private ancestry. Repository
creation is disabled. It signs the archive/appcast with the existing key and
carries forward the verified Windows channel. No client token is required.

For Windows, retain the exact-source native CI and upgrade gates in
[windows-releasing.md](windows-releasing.md), then use
`python3 scripts/publish-windows-release.py --publish` with the required artifact,
run and clean source arguments. This carries forward the verified Mac channel.
Neither publisher silently mutates published platform-only releases: choose a
new release/build rather than repairing old assets. Each draft is reread and
all seven remote assets matched before being marked Latest.

Checks: `python3 scripts/test-unified-release-assets.py`,
`python3 scripts/test-public-release.py`, `python3 scripts/test-windows-release.py`,
`python3 scripts/test-release-update.py`. Migration safety checks:
`python3 scripts/test-consolidate-public-repositories.py`.

## One product version for both platforms

`release-version.json` is the shared user-visible version. Mac `forkVersion` and
Windows package/lock versions must match it. The 1.7.5 candidates use Mac build74
and Windows build68. Build counters stay independent. They are monotonically
increasing installer identities, not different product versions. Never relabel an
old binary.

Before building, run `python3 scripts/check-release-version.py`; public
checkout validation also uses `--require-windows`. Both publishers validate the chosen
version against this file in both private and public checkouts. Windows defaults
to the shared version, not an old fixed profile. Its reviewed version/build and
actual previous-version/native-upgrade gates still apply.

A normal Latest publication additionally compares the **authenticated** Mac and
Windows feed versions. Different versions stop publication before a draft is
created and are checked again before promotion. All signature, archive hash,
exact-source CI and rollback-protection gates remain mandatory.

For a future version bump, prepare and test both platform candidates first:

1. Update the shared version and all package/state versions together. Review the
   next Windows profile and the genuine previous-version fixture; increment each
   platform's own build counter. Commit/push the clean public and private inputs.
2. Publish the first platform with its normal publisher plus `--publish --stage`.
   This explicit staging step uses `make_latest=false`; existing clients keep
   receiving the previous matched pair. It may carry the old counterpart only
   in that staged release. Do not use its feeds as the normal update channel.
3. Publish the second platform with `--publish --counterpart-tag <first-tag>`.
   The exact staged counterpart is authenticated and frozen. Both versions must
   now match. The final release contains both packages/feeds before becoming
   Latest, so clients discover the same product version together.
4. Verify both anonymous latest feeds and the resulting installed versions.

Tagged counterpart selection cannot silently substitute a changed or older
counterpart. Staged and final composition receipts are distinct and immutable;
retries cannot turn a mismatched staging snapshot into a Latest release.

For 1.7.4, the reviewed previous pair is the published 1.7.3 Mac build72 and
Windows build66, not a relabeled candidate. Prepare both new candidates and their
exact-source native CI evidence first. Stage `clipboardline-1.7.4-build73` with
the Mac publisher, then publish Windows build67 using
`--counterpart-tag clipboardline-1.7.4-build73`. Neither the version/profile
changes nor portable tests alone constitute native acceptance or publication.
The previous packages, signing identities and frozen credential helper remain
unchanged. See [the Windows baseline requirements](windows-releasing.md).

## Cross-platform behavior is a release requirement

Every user-facing change applies to macOS and Windows by default. Update both
implementations, shared `contracts/shelf-behavior.json` cases and actual platform
adapters. Explicit native limitations require a documented, reviewed exception.
The current contract covers opening selection, row navigation, search editing,
visibility changes and empty shelves; extend it as other features change.

From Windows build65 and Mac build70, both publishers call
`scripts/verify-cross-platform-release.py` before any external release mutation.
It authenticates both successful native-host workflows for the exact clean,
pushed public source revision, verifies GitHub artifact digests and checks every
observation against the committed contract. Local JSON or Windows renderer
observations executed on a Mac cannot replace this evidence. Historical immutable
build profiles retain their original evidence formats.

Before Latest promotion, the publishers also authenticate the carried package
and compare its committed production source to the intended public source.
Mac provenance comes from the signed ZIP's embedded private revision, compared
by content across the separate histories. Windows provenance comes from its
signed manifest and public source revision. Tests, docs and independent Windows
build counters do not force an unchanged counterpart rebuild. Changed product
code does: stage the first platform, then publish the matching second package.
Staging still requires both native CI results and never changes Latest.

Checks: `python3 scripts/test-cross-platform-release.py` and
`python3 scripts/test-cross-platform-parity.py`, plus the existing platform
publisher, native acceptance, upgrade and signature checks.

## Historical private updater and one-time setup

The sections below describe older private-auth clients and their recovery path.
They are not setup requirements for the current anonymous public channel.

## Client Mac: one-time setup

The older review.26 and earlier apps have no in-app updater. Download the first
updater-capable release (review.27 / build35) from the private repository and
replace the existing `ClipboardLine Review.app` once, retaining its name and
location. Quit the existing app before replacing it. User history and settings
are outside the bundle. Normal first-open macOS approval may still be needed;
do not disable Gatekeeper. The ad-hoc-to-stable signing transition may require
one final Accessibility authorization, separately from GitHub authorization.

On that Mac, open Settings → About → GitHub access. In GitHub's Settings →
Developer settings → Personal access tokens → Fine-grained tokens, create a
token with resource owner `orkunisitmak`, **Only select repositories →
clipboardline**, and **Repository permissions → Contents: Read-only**. Paste it
into the app's secure field and choose Save token. Keep it out of chat, screenshots
and Git. The token is stored in that Mac's Keychain; Disconnect GitHub removes it.
If it expires or is revoked, supply a replacement token once.

### Credential continuity across self-signed updates

The initial updater stored its token directly from the main app in the classic
login Keychain. On this Mac, review.27 and review.28 retained the same signing
certificate and designated requirement but still acquired different Keychain
partition hashes. This can cause an additional password prompt at each update;
the earlier stable-signing work alone does not prevent it. See the root cause
and primary Apple sources in [stable-signing.md](stable-signing.md).

The credential-broker migration moves these fixed token operations into
an embedded XPC service whose signed bundle remains byte-identical between
normal releases. The main app and broker mutually authenticate their exact
certificate/identifier; a nonsecret handshake precedes sending token data.
Ordinary checks must fail noninteractively when access is unavailable. Only an
explicit user authorization action may request the initial Keychain approval.
The token stays local and is never embedded in a build or release.

The initial approval belongs to each Mac's own Keychain. Approving the helper
on Mac Studio does not authorize another Mac. On a client with an existing
legacy token, use **Authorize saved token… → Always Allow** once for the frozen
v2 helper. A normal release must copy that exact helper so it keeps this grant.
On 2026-10-17 the user reported that this action resolved a review.31 client
error. That report confirms recovery, not a separately observed update on that
client; Studio's actual multi-release continuity is documented below.

Review.29's first broker had a separate security session and could not request
that initial approval. The corrected v2 service joins the caller's security
session (`JoinExistingSession = true`) and has a distinct service identifier,
`local.clipboardline.review.credentials.v2`. The fixed Keychain service/account
stay `local.clipboardline.review.github-updates` / `github-token`; there is no
main-app token-reading fallback or replacement credential namespace. The frozen
broker remains the sole reader, including explicit initial authorization.

Do not regenerate or silently rebuild the frozen broker during release
packaging. Preserve its private artifact/input receipt alongside the signing
material, and verify its committed public bundle pin and all architecture
hashes. A broker change requires a reviewed migration. The real review.30 →
review.31 update passed after the user's one-time authorization. The changed main
binary checked the private release without another password prompt, including
after the helper was terminated and a new process launched. Read-only metadata
confirms the frozen helper's Keychain partition persisted; the changed main-app
partitions were not added. See [the live validation record](credential-access-validation-2026-10-17.md).

Run `python3 scripts/build-credential-broker.py` and
`python3 scripts/test-credential-broker-integration.py` with the existing private
artifact restored before publishing. The latter uses signed synthetic hosts
and a secret-free handshake; it never requests a token or alters its Keychain
item. V1's four native checks passed with changed universal hosts and rejected
untrusted client/broker identities; this established the IPC boundary, not
actual token continuity. V2's five native checks also passed, including that
the signed service joins the caller's security session. Ordinary release builds
must not invoke an initial-bootstrap or version-migration flag.

Then choose Check for updates from the app menu or Settings → About. A newer
signed release offers Install and reopen. There is no need to transfer a ZIP
from the Mac Studio or delete the app for subsequent releases. Installation
waits for edits to save and the app to quit normally, then atomically swaps the
application and reopens it. The retained previous app is inside a private hidden
`.ClipboardLine-update-<UUID>/` folder beside the installed application; its
location is also recorded in Application Support/ClipboardLine/Updates.
Installation failures roll back; this is not a promise to reverse a later data
migration by an already-running new app. Client data is never replaced by the
updater.

### Automatic checks and notifications

Settings → About → App updates includes **Automatically check for updates**.
It defaults on and persists on this Mac. The installed app checks after a
30-second launch delay, then every 12 hours while running. Waking the Mac
rechecks the due time; enabling the setting schedules a fresh check. Opening
About also refreshes the result when automatic checks are on and the last
attempt was at least 60 seconds ago. Reopening an already visible About window
uses the same throttle. The explicit Check for updates button always bypasses
that delay. About shows the date of the last **successful** check; failed or
cancelled requests do not advance it. Turning automatic checks off disables the
About refresh as well and cancels pending background checks without interrupting
a manual install.
The app does not run while quit and never wakes a sleeping Mac solely to check.

A new cryptographically verified build produces one announcement per build.
macOS may ask permission the first time a new-release notification is posted.
If notifications are denied, the available version still appears in the menu
bar and About. Notification **Install and reopen**, the menu's **Install update…**,
and About's existing install button all use the same signed updater. Clicking
the notification body opens About. A stale notification never silently installs
a different build.

Only the signed release envelope and bounded public release metadata are cached
to retain the available action across launches; they are verified again against
the installed public key and build before use. Background checks never request
Keychain consent, open an error dialog, download an archive or install anything.
Automatic installation is not enabled.

## Release workflow

1. Implement and validate changes. Increment `forkVersion` and `buildNumber` in
   `upstream-state.json`; every release needs a greater build number.
2. Commit all release inputs and push `clipboardline/main` to `origin`.
3. Run `bash scripts/build-review.sh`. It embeds the committed revision and
   update configuration and uses the existing persistent code-signing profile.
4. Run `python3 scripts/publish-review-release.py`. This prepares and validates
   the universal ZIP and signed manifest locally without uploading anything.
5. Run `python3 scripts/publish-review-release.py --publish` to upload the two
   validated assets to a draft release, then publish it. Review versions are
   prereleases, so update checks must enumerate releases rather than use
   GitHub's stable-only `/releases/latest` endpoint.

Artifacts are stored under `releases/<version>-build<number>/`. The receipt is
stored in ignored `local/validation/release-<version>-build<number>.json`.
The release tag is `clipboardline-<version>-build<number>` and targets the exact
source commit embedded in the bundle. The publisher refuses a dirty checkout,
a stale build revision, a missing remote commit, a different repository,
unexpected private-data paths, mismatched signatures or changed existing assets.

If a network failure interrupts uploading, rerun the same command with the same
local files. Existing matching assets are reused; an existing published release
is read-only. Existing tags and published assets are never overwritten. Inspect
an incomplete local package before changing it. If application contents or the
version change, make a new build instead of replacing a published build number.

Run `python3 scripts/test-release-update.py` for real Ed25519 verification,
private-key handling, credential redirect boundaries and simulated publishing
retry checks. This test neither uploads assets nor launches an app.

Native text/image paste acceptance for review.45/build55 is recorded in
[the completed live follow-up](direct-paste-live-followup-2026-10-18.md). Update
packaging tests alone do not grant Accessibility permission or prove that a
specific client Mac retains it; the Studio native checks are separate evidence.

## Coordinated 1.7.5 toggle performance update

The 1.7.5 pair uses Mac build74 and Windows build68. The genuine previous
packages are 1.7.4/build73 and 1.7.4/build67. Stage
`clipboardline-1.7.5-build74` only after both exact-source native workflows pass,
then publish Windows build68 with `--counterpart-tag clipboardline-1.7.5-build74`.
The shared shelf contract now includes repeated three-row opening/closing and
closing an active search; native suites separately exercise animation/focus and
large-history visibility costs. No target-capture timeout, permission or signing
identity change is part of this update.


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
