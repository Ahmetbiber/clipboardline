# ClipBoardLine public source

This repository contains the audited source and releases for one ClipBoardLine
product on macOS and Windows. Keep all user-visible features and behavior aligned
by default. A feature request applies to both platforms unless an explicit,
reviewed OS-native exception documents its user impact and reason. Native API
and modifier-name differences do not justify silently omitting a feature.

Read `docs/cross-platform-parity.md`. Extend `contracts/shelf-behavior.json` and
both actual application adapters for user-visible changes. Run the Mac XCTest
and Windows renderer/runtime acceptance suites, the parity checker tests,
`python3 scripts/check-release-version.py --require-windows`, publication audit
and secret scan. Publication requires successful exact-source Mac and Windows
CI evidence; a Windows renderer test executed on macOS is not native Windows
acceptance. No source-text or implementation-mirroring checks as behavioral proof.

Use the single existing repository for source and both platforms' releases.
Keep the shared product version aligned and platform build counters independent.
Preserve the Mac bundle/storage identity and compatibility paths. Both signed
update feeds and packages must remain available in every Latest release; do not
publish a platform-only Latest. Public/community builds contain no private
release identity, client credentials or signing keys. Never commit private
history, real clipboard content, preferences, validation artifacts or backups.
