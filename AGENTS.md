# ClipBoardLine public source

This repository contains the audited source and releases for one ClipBoardLine
product on macOS and Windows. Keep all user-visible features and behavior aligned
by default. A feature request applies to both platforms unless an explicit,
reviewed OS-native exception documents its user impact and reason. Native API
and modifier-name differences do not justify silently omitting a feature.

The user authorizes direct delivery for this project's current and future work.
After completing requested changes and required checks, commit and push directly
to `main`. Integrate any implementation branch into `main` before pushing. Do
not open a pull request unless the user explicitly requests one. Keep all native
release gates and source/security audits; never import private development history.

Read `docs/cross-platform-parity.md`. Extend `contracts/shelf-behavior.json` and
both actual application adapters for user-visible changes. Run the Mac XCTest
and Windows renderer/runtime acceptance suites, the parity checker tests,
`python3 scripts/check-release-version.py --require-windows`, publication audit
and secret scan. Publication requires successful exact-source Mac and Windows
CI evidence; a Windows renderer test executed on macOS is not native Windows
acceptance. No source-text or implementation-mirroring checks as behavioral proof.

Use the single existing repository for source and both platforms' releases.
Its canonical name is `orkunisitmak/clipboardline`, repository ID 1425566096.
The old `clipboardline-desktop` and `clipboardline-app` names are reserved
compatibility redirects. Existing Mac feed URLs and Windows signed repository/URL
wire identities deliberately keep `clipboardline-desktop`; changing them would
break shipped Windows clients. The rename does not change internal package names,
bundle/storage identity or existing release assets. See
`docs/repository-rename-2026-10-27.md`.
Keep the shared product version aligned and platform build counters independent.
Preserve the Mac bundle/storage identity and compatibility paths. Both signed
update feeds and packages must remain available in every Latest release; do not
publish a platform-only Latest. Public/community builds contain no private
release identity, client credentials or signing keys. Never commit private
history, real clipboard content, preferences, validation artifacts or backups.
