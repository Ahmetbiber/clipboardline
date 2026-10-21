# Windows public releases

The single public source/distribution repository is
`orkunisitmak/clipboardline-desktop` (ID 1425566096). The original
`orkunisitmak/clipboardline` development history remains private. macOS and
Windows retain separate signed feed files in the SAME latest release.
Every Latest must carry both feeds and both current packages; the old Mac
`clipboardline-app` URLs remain compatibility redirects.

Commit and push the clean public source checkout. Run its **Windows application**
workflow on that exact revision and wait for success. Download and extract the
`clipboardline-windows-<source SHA>` artifact into an ignored local directory,
preserving its `dist/` and `validation/` paths. All three acceptance reports
(`source`, `packaged`, `installed`) must come from Windows x64 and contain at least
20 distinct passing checks, the exact source revision, `rendererErrors: []`, and
`passed: true`. For 1.7.1/build63, `validation/upgrade/windows-upgrade.json` is
also mandatory. It binds the exact installer hash/size and source revision to
seven passing native upgrade checks. The fixture first installs the actual
1.7.0/build62 package and seeds disposable text/image/organization/preferences;
the corrected client then installs and automatically reopens the candidate.
Only the isolated main-process test hook accepts a throwaway signing key and
simulated installed version. The public feed, production key and old binary
remain unchanged. This verifies the corrected updater with old installation
data; it does not add the new reopen flags to the already released build62.
That first transition may require opening ClipBoardLine once manually.

Windows 1.7.2/build64 is a metadata-only release for post-consolidation native
update acceptance. Its upgrade fixture uses the actual published 1.7.1/build63
installation and data. Historical reviewed profiles remain selectable:
`--version 1.7.1 --build 63` (previous62) and
`--version 1.7.2 --build 64` (previous63).
The CLI defaults to `release-version.json`, and
actual publication rejects a selected version differing from either checkout’s
shared version. Unknown versions and an older fixture baseline are rejected; every
existing CI, artifact, signature and native-acceptance gate still applies.

Windows 1.7.2/build65 aligns fresh-opening selection and row navigation with
macOS. Its fixture installs the real published 1.7.2/build64 first, then verifies
the candidate installation, preserved content/settings and automatic reopen.
The latest reviewed `--version 1.7.2` profile is now build65/previous64; historical
build64 can only be selected explicitly with `--build 64`. Unknown builds fail.
Both exact-source native-host parity workflows are mandatory from build65.
The carried Mac package must contain the intended Mac production code, verified
against its signed provenance; stale counterpart code blocks Latest promotion.
See [the shared release policy](releasing.md#cross-platform-behavior-is-a-release-requirement).

Windows 1.7.3/build66 closes the Library, keyboard, preview, image editing and
offline visual-search gaps documented in the public `docs/parity-1.7.3.md`.
Its upgrade fixture uses the actual published 1.7.2/build65 installer. Native
source, packaged and installed acceptance must exercise the real bundled WASM
model, external WinForms/Edge/Chrome text and PNG destinations, returned keyboard
focus and secure-field rejection. A renderer success response alone is not
proof that an external editor received a paste. Models are pinned build assets;
there is no runtime download or client credential. Both exact-source native CI
workflows and the shared 62-observation contract remain mandatory.

Windows 1.7.4/build67 is the coordinated three-shelf performance candidate with
Mac 1.7.4/build73. Its upgrade gate installs the genuine published
1.7.3/build66 package from the immutable `windows-1.7.3-build66` release URL:
545,768,617 bytes, SHA256
`191731aa02077ac975dee65566640c62a23430b49fed54915a2e75f99e84d100`,
published source `8bb1543507ba79854f654c63dfb074c38a40fb9d`.
`windows/tests/upgrade-profile.cjs` fixes this exact byte limit and identity;
the older profiles retain their original hashes and 200 MiB download limit.
The larger model-bearing baseline must not be rejected by the historical size
cap or replaced with a smaller old package. The fixture uses the old client's
ordinary Pin command after creating its retained test note, matching build66's
shipped new-note behavior. The old executable, feed and production key are not
modified. The isolated candidate-updater gate still uses its existing throwaway
key and simulated installed version; it is distinct from a post-publication
test of an unchanged old client's public update channel.

Windows 1.7.5/build68 aligns with Mac 1.7.5/build74 and reduces three-shelf
opening/dismissal work. Its native source, packaged and installed suites each
exercise four actual hide/show cycles with the external focus helper intact.
They require no full library projection or unchanged bounds calls during those
cycles, connected cards/decoded images, native window focus and one selected
first image. A committed hidden edit must force a fresh complete snapshot before
subsequent lightweight packets reuse it. Publication additionally authenticates
each mode's `shelf-performance.json` against the successful CI artifact and
validates those observations, navigation and image/thumbnail freshness. The
full Node suite and both exact-source native platform workflows remain required.

The build68 upgrade fixture installs the genuine published 1.7.4/build67:
545,769,370 bytes, SHA256
`d6b9b2b066f4172c55ccf75bf38118430ab22a761306ef40ba0890e4ea18223f`,
source `ee7878362a8f740b36bb9a17114bc2aad3cfd0f3`, from immutable tag
`windows-1.7.4-build67`. Both fixture and publisher pin this exact identity;
all older reviewed profile hashes, download caps and acceptance rules remain
unchanged. Candidate-updater tests keep their isolated throwaway key and do not
modify the old client or public feed.

From the private development checkout, prepare without publishing:

```sh
python3 scripts/publish-windows-release.py \
  --version 1.7.5 \
  --build 68 \
  --artifact-dir local/windows-artifacts/<run-id> \
  --run-id <run-id>
```

The default public source checkout is
`local/public-source/clipboardline-desktop`; override it with `--source-dir` if
needed. The script verifies the checkout's origin, cleanliness and pushed HEAD,
the exact successful workflow, GitHub's artifact archive digest, and every local
installer/report against that archive. It checks the PE signature bytes,
installer hash/size, selected fixed version/build, native acceptance and component
licenses. The build68 profile prepares immutable assets in
`releases/windows-1.7.5-build68/`. Historical build67 remains selectable with
`--version 1.7.4 --build 67`; shared-version publication guards still apply.

Review the prepared installer, `windows-update.json`, `SHA256SUMS` and
`LICENSES.txt`, then repeat the command with `--publish`. It revalidates all gates,
creates or resumes the exact public draft, uploads only matching or missing
assets, and publishes a seven-asset unified release. The verified Mac feed/ZIP
and platform-specific licenses are carried forward by
`scripts/unified_release_assets.py`; combined checksums cover all six files.
Both publishers hold the same local nonblocking publication lock and revalidate
the counterpart before marking Latest. Existing assets and published releases are never
overwritten. The Windows tag targets the actual public source commit.

If GitHub REST retains a queued/in-progress state after completion, the publisher
requires an authenticated GraphQL check-suite completion for the exact public
repository, Commit OID, GitHub Actions app, workflow run ID and URL. Only
`COMPLETED` plus `SUCCESS` is accepted. A completed REST failure remains a
failure; missing, duplicated or mismatched GraphQL evidence stops publication.
This is a second GitHub status proof, never an inference from local reports.
All report, installer and artifact digest checks remain mandatory.

Signing runs locally using the existing Ed25519 key and Swift signing helper.
The private key and GitHub credentials are never exported to CI, artifacts or
source. The client downloads the public `windows-update.json` asset from the
latest release, verifies its pinned signature, then verifies installer size and
SHA256 before installation.

This Ed25519 update signature is separate from Windows Authenticode. No Windows
Authenticode certificate is configured for this release, so SmartScreen may
display an unknown-publisher warning. Do not describe it as an Authenticode-signed
installer. CI records the actual Authenticode status.

Run local publisher checks with:

```sh
python3 scripts/test-windows-release.py
```

Tests use temporary synthetic binaries/reports, a temporary test signing key,
and a mocked GitHub API. They do not upload, install or launch an application.

Future coordinated version bumps use the staged-then-matched workflow in
[releasing.md](releasing.md#one-product-version-for-both-platforms). A normal
Latest may never carry different Mac and Windows marketing versions.


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
