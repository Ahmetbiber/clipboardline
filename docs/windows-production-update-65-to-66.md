# Post-publication Windows production update proof

This **validation-only branch** prepares a disposable native Windows job. It is
not a product change, release, or replacement for the exact-source native gates
on `main`. Do not merge this branch's dispatch-only workflow into `main`.

The existing `windows.yml` workflow can be dispatched with the branch ref after
publication. Its two required inputs are the exact source SHA authenticated in
the released 1.7.3/build66 Windows envelope and the reviewed numeric ID of the
canonical coordinated Latest release. The test fails before installing anything
if Latest differs from `windows-1.7.3-build66`, its exact seven-asset set
(including `ClipboardLine-1.7.3-build72.zip`, `appcast.xml` and both licenses)
differs or has duplicate names/IDs, or the signed feed's source/version/build
differ. The attached installer URL must exactly equal the authenticated URL;
same-name/same-size assets in another release are rejected. No publication IDs are guessed or filled by this
branch. Keep the branch unpushed until explicitly authorized.

The old published 1.7.2/build65 installer is pinned to SHA-256
`62cebf204958ca8729c8fd569d7c5a6f83c73aeced6d1f63760500a6b2cf5a8f`
(source `998c1ac203e11a7a97aee2039b4c5bd6d8df9a09`). It is installed into a unique
per-user directory on a fresh `windows-2025` GitHub runner and launched with its
normal production user-data path. Its original executable and `app.asar` hashes
are recorded and checked again immediately before installation.

The shipped old app creates only synthetic notes, PNG, folder/tag membership,
pins and preferences through its ordinary production IPC and real clipboard
monitor. Its actual Settings **Check for updates** and **Update and reopen**
buttons fetch and verify the public feed and package using its existing key and
network code. The test never uses `--test-mode`, redirects app data, installs a
replacement updater, supplies a fetcher/key, changes version comparison, or
modifies either shipped binary. The separate test process checks the public
signature/source/release binding independently; it does not inject its result
into the application or pre-cache the new installer.

The exact-parent native observer starts before the click and allows up to five
minutes for the real download to finish, then observes actual NSIS exit. The job
requires automatic build66 reopening with `--updated`, the same install path,
and actual Win32 foreground ownership before any manual relaunch. The
NSIS-launched app has no automation endpoint: the test records this native proof,
closes only that owned installation, and launches the unchanged new app normally
for UI inspection. That later launch is explicitly distinct from the automatic
reopen proof.

The normal new app must retain text/image hashes, names, pins, folder/tag IDs,
update opt-out, source/retention/appearance and custom shortcut preferences.
Actual Settings controls and the production **Check** button must show the
preserved choices and current version. Finally, real Control+Enter from Library
text and image preview must paste into a separate native editor, close the
source UI, and allow clickless continued typing in the target.

Only the metadata receipt and screenshots of this owned synthetic app state are
uploaded. User-data directories, clipboard dumps, installers, keys and tokens
are excluded. The script refuses to run outside a disposable x64 Windows GitHub
runner. The job has read-only repository permissions, no publishing action and a
25-minute bound. The usual main CI's isolated candidate/throwaway-key updater
fixture remains useful separately and is not described as this production proof.

Prepared locally: profile unit tests and JavaScript syntax only. Native execution
and the production update are **pending post-publication dispatch**. A passing
receipt, run ID and exact validation revision are required before claiming this
65→66 production-channel transition works.
