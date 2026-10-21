#!/usr/bin/env python3
"""Windows publication gates and real Ed25519 checks; no uploads, installs or CI writes."""
from pathlib import Path
import copy
import hashlib
import importlib.util
import io
import json
import subprocess
import tempfile
import unittest
from unittest import mock
import zipfile

SPEC = importlib.util.spec_from_file_location('windows_publisher_tests', Path(__file__).with_name('publish-windows-release.py'))
publisher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publisher)


def shelf_toggle_report(revision):
    return {'sourceRevision': revision, 'items': 3000,
            'checks': ['native performance check ' + str(index) for index in range(6)],
            'toggles': {'iterations': 4, 'projections': 0, 'boundsChanges': 0, 'visible': True,
                        'focused': True, 'hiddenEditDelivered': True,
                        'packets': [{'action': 'show' if index % 2 else 'hide', 'surfaceOnly': True,
                                     'hasItems': False, 'visible': bool(index % 2)} for index in range(8)]},
            'navigation': {'iterations': 50, 'removedCards': 48, 'addedCards': 48},
            'sameClockImageEdit': {'timestampUnchanged': True, 'originalURLUnchanged': True,
                                   'versionedURLChanged': True},
            'thumbnailEnrichment': {'sameCanonicalURL': True, 'versionedURLChanged': True,
                                    'sameTitleAndTimestamp': True, 'mediaRevisionChanged': True,
                                    'recopySameRecord': True}}


def shelf_slide_report(revision):
    report = shelf_toggle_report(revision)
    report['checks'] += ['native presented shelf slide positions',
                         'native rapid reversals and reduced motion']
    report['motion'] = {
        'opening': {'samples': [
            {'at': 10, 'phase': 'opening', 'y': -700, 'height': 780, 'pointer': 'none'},
            {'at': 410, 'phase': 'opening', 'y': -1, 'height': 780, 'pointer': 'none'}],
            'finished': True, 'duration': 420, 'pointerEnabled': True, 'visible': True, 'focused': True},
        'closing': {'samples': [
            {'at': 500, 'phase': 'closing', 'y': 0, 'height': 780, 'pointer': 'none'},
            {'at': 710, 'phase': 'closing', 'y': -700, 'height': 780, 'pointer': 'none'}],
            'finishedAt': 720, 'duration': 220, 'hiddenOnlyAfterEnd': True},
        'rapidReopen': {'visible': True, 'focused': True, 'staleHides': 0,
                        'staleRestores': 0, 'selectedFirstImage': True},
        'rapidClose': {'hidden': True, 'burstHidden': True},
        'reducedMotion': {'animationCount': 0, 'shown': True, 'hidden': True},
        'boundsChanges': 0, 'projections': 0, 'allNodesConnected': True}
    return report


class GitHubArtifactTransportTests(unittest.TestCase):
    def test_actions_zip_negotiates_github_json_but_returns_raw_bytes(self):
        client = object.__new__(publisher.legacy.GitHub)
        client.token = 'synthetic-' + 'credential'
        captured = []
        body = b'PK\x03\x04synthetic ZIP bytes; not JSON'

        class Response(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *_args): self.close()

        class Opener:
            def open(self, request, **_kwargs):
                captured.append(request)
                return Response(body)

        with mock.patch.object(publisher.legacy.urllib.request, 'build_opener', return_value=Opener()):
            result = client.request('GET', '/repos/orkunisitmak/clipboardline-desktop/actions/artifacts/55/zip', binary=True)
        self.assertEqual(result, body)
        self.assertEqual(captured[0].get_header('Accept'), 'application/vnd.github+json')
        self.assertEqual(captured[0].get_header('Authorization'), 'Bearer ' + client.token)

    def test_release_asset_still_negotiates_octet_stream_and_cross_host_redirect_drops_authorization(self):
        client = object.__new__(publisher.legacy.GitHub)
        client.token = 'synthetic-' + 'credential'
        captured = []

        class Opener:
            def open(self, request, **_kwargs):
                captured.append(request)
                return io.BytesIO(b'synthetic binary asset')

        with mock.patch.object(publisher.legacy.urllib.request, 'build_opener', return_value=Opener()):
            result = client.request('GET', '/repos/orkunisitmak/clipboardline-desktop/releases/assets/55', binary=True)
        self.assertEqual(result, b'synthetic binary asset')
        self.assertEqual(captured[0].get_header('Accept'), 'application/octet-stream')
        redirect = publisher.legacy.SafeRedirect().redirect_request(
            captured[0], None, 302, 'Found', {}, 'https://objects.githubusercontent.com/synthetic-asset')
        self.assertIsNotNone(redirect)
        self.assertIsNone(redirect.get_header('Authorization'))
        self.assertEqual(captured[0].get_header('Authorization'), 'Bearer ' + client.token)


class ReleaseProfileTests(unittest.TestCase):
    def tearDown(self):
        publisher.configure_release('1.7.1')

    def test_reviewed_build64_profile_is_fixed_and_uses_real_build63_baseline(self):
        publisher.configure_release('1.7.2', 64)
        self.assertEqual((publisher.VERSION, publisher.BUILD, publisher.PREVIOUS_VERSION,
                          publisher.PREVIOUS_BUILD), ('1.7.2', 64, '1.7.1', 63))
        self.assertEqual(publisher.INSTALLER, 'ClipBoardLine-Setup-1.7.2-x64.exe')
        self.assertEqual(publisher.TAG, 'windows-1.7.2-build64')

    def test_latest_build65_uses_actual_shipped_build64_without_changing_product_version(self):
        publisher.configure_release('1.7.2')
        self.assertEqual((publisher.VERSION, publisher.BUILD, publisher.PREVIOUS_VERSION,
                          publisher.PREVIOUS_BUILD), ('1.7.2', 65, '1.7.2', 64))
        self.assertEqual(publisher.TAG, 'windows-1.7.2-build65')
        with self.assertRaisesRegex(publisher.ReleaseError, 'reviewed profile'):
            publisher.configure_release('1.7.2', 66)
        with self.assertRaisesRegex(publisher.ReleaseError, 'reviewed profile'):
            publisher.configure_release('1.7.2', True)

    def test_parity_release_173_uses_real_build65_as_its_upgrade_baseline(self):
        publisher.configure_release('1.7.3')
        self.assertEqual((publisher.VERSION, publisher.BUILD, publisher.PREVIOUS_VERSION,
                          publisher.PREVIOUS_BUILD), ('1.7.3', 66, '1.7.2', 65))
        self.assertEqual(publisher.TAG, 'windows-1.7.3-build66')
        with self.assertRaisesRegex(publisher.ReleaseError, 'reviewed profile'):
            publisher.configure_release('1.7.3', 67)

    def test_performance_release_174_uses_real_published_build66(self):
        publisher.configure_release('1.7.4')
        self.assertEqual((publisher.VERSION, publisher.BUILD, publisher.PREVIOUS_VERSION,
                          publisher.PREVIOUS_BUILD), ('1.7.4', 67, '1.7.3', 66))
        self.assertEqual(publisher.INSTALLER, 'ClipBoardLine-Setup-1.7.4-x64.exe')
        self.assertEqual(publisher.TAG, 'windows-1.7.4-build67')
        with self.assertRaisesRegex(publisher.ReleaseError, 'reviewed profile'):
            publisher.configure_release('1.7.4', 66)
        with self.assertRaisesRegex(publisher.ReleaseError, 'reviewed profile'):
            publisher.configure_release('1.7.4', True)

    def test_default_profile_remains_build63_and_unknown_versions_cannot_change_it(self):
        publisher.configure_release('1.7.1')
        with self.assertRaisesRegex(publisher.ReleaseError, 'reviewed profile'):
            publisher.configure_release('9.9.9')
        self.assertEqual((publisher.VERSION, publisher.BUILD, publisher.PREVIOUS_VERSION,
                          publisher.PREVIOUS_BUILD), ('1.7.1', 63, '1.7.0', 62))

    def test_toggle_release_175_requires_real_published_build67_and_never_reuses_an_old_profile(self):
        publisher.configure_release('1.7.5')
        self.assertEqual((publisher.VERSION, publisher.BUILD, publisher.PREVIOUS_VERSION,
                          publisher.PREVIOUS_BUILD), ('1.7.5', 68, '1.7.4', 67))
        self.assertEqual(publisher.INSTALLER, 'ClipBoardLine-Setup-1.7.5-x64.exe')
        self.assertEqual(publisher.TAG, 'windows-1.7.5-build68')
        for build in [67, 69, True, '68']:
            with self.assertRaisesRegex(publisher.ReleaseError, 'reviewed profile'):
                publisher.configure_release('1.7.5', build)

    def test_slide_release_176_pins_published_build68(self):
        publisher.configure_release('1.7.6')
        self.assertEqual((publisher.VERSION, publisher.BUILD, publisher.PREVIOUS_VERSION,
                          publisher.PREVIOUS_BUILD), ('1.7.6', 69, '1.7.5', 68))
        self.assertEqual(publisher.TAG, 'windows-1.7.6-build69')
        for build in [68, 70, True, '69']:
            with self.assertRaisesRegex(publisher.ReleaseError, 'reviewed profile'):
                publisher.configure_release('1.7.6', build)


class ShelfToggleEvidenceTests(unittest.TestCase):
    def test_native_toggle_evidence_accepts_only_current_complete_executed_behavior(self):
        revision = 'a' * 40
        report = shelf_toggle_report(revision)
        publisher.validate_shelf_toggle_evidence(report, revision)
        mutations = [
            lambda value: value.update(sourceRevision='b' * 40),
            lambda value: value.update(error='Native assertion failed'),
            lambda value: value.update(items=30),
            lambda value: value.update(checks=value['checks'][:5]),
            lambda value: value['toggles'].update(iterations=3),
            lambda value: value['toggles'].update(projections=1),
            lambda value: value['toggles'].update(boundsChanges=1),
            lambda value: value['toggles'].update(focused=False),
            lambda value: value['toggles'].update(hiddenEditDelivered=False),
            lambda value: value['toggles']['packets'][1].update(hasItems=True),
            lambda value: value['toggles']['packets'][2].update(action='show'),
            lambda value: value['navigation'].update(removedCards=1350, addedCards=1350),
            lambda value: value['thumbnailEnrichment'].update(versionedURLChanged=False),
        ]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                candidate = copy.deepcopy(report)
                mutate(candidate)
                with self.assertRaises(publisher.ReleaseError):
                    publisher.validate_shelf_toggle_evidence(candidate, revision)

    def test_native_slide_evidence_requires_movement_timing_reversal_and_reduced_motion_proof(self):
        report = shelf_slide_report('a' * 40)
        publisher.validate_shelf_toggle_evidence(report, 'a' * 40)
        publisher.validate_shelf_motion_evidence(report)
        mutations = [
            lambda value: value.pop('motion'),
            lambda value: value.update(motion=None),
            lambda value: value.update(checks=value['checks'][:7]),
            lambda value: value['motion']['opening'].update(duration=419),
            lambda value: value['motion']['opening'].update(duration=420.0),
            lambda value: value['motion']['closing'].update(duration=221),
            lambda value: value['motion']['closing'].update(duration=True),
            lambda value: value['motion']['opening'].update(samples=value['motion']['opening']['samples'][:1]),
            lambda value: value['motion']['opening']['samples'][-1].update(y=-710),
            lambda value: value['motion']['closing']['samples'][-1].update(y=100),
            lambda value: value['motion']['opening']['samples'][-1].update(y=-690),
            lambda value: value['motion']['closing']['samples'][-1].update(at=500),
            lambda value: value['motion']['opening']['samples'][0].update(y=float('nan')),
            lambda value: value['motion']['closing']['samples'][0].update(at=float('inf')),
            lambda value: value['motion']['opening']['samples'][0].update(at=True),
            lambda value: value['motion']['opening']['samples'][0].update(height=False),
            lambda value: value['motion']['closing']['samples'][0].update(height=0),
            lambda value: value['motion']['opening']['samples'][0].update(pointer='auto'),
        ]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                candidate = copy.deepcopy(report)
                mutate(candidate)
                with self.assertRaises(publisher.ReleaseError):
                    publisher.validate_shelf_motion_evidence(candidate)
        endpoint_flags = {
            'opening': ['finished', 'pointerEnabled', 'visible', 'focused'],
            'closing': ['hiddenOnlyAfterEnd'],
            'rapidReopen': ['visible', 'focused', 'selectedFirstImage'],
            'rapidClose': ['hidden', 'burstHidden'],
            'reducedMotion': ['shown', 'hidden']}
        for group, flags in endpoint_flags.items():
            for flag in flags:
                for invalid in [False, 1, None]:
                    with self.subTest(group=group, flag=flag, value=invalid):
                        candidate = copy.deepcopy(report)
                        candidate['motion'][group][flag] = invalid
                        with self.assertRaises(publisher.ReleaseError):
                            publisher.validate_shelf_motion_evidence(candidate)
        for path in [('boundsChanges',), ('projections',), ('rapidReopen', 'staleHides'),
                     ('rapidReopen', 'staleRestores'), ('reducedMotion', 'animationCount')]:
            for invalid in [1, False, 0.0]:
                with self.subTest(counter=path, value=invalid):
                    candidate = copy.deepcopy(report)
                    owner = candidate['motion']
                    for key in path[:-1]:
                        owner = owner[key]
                    owner[path[-1]] = invalid
                    with self.assertRaises(publisher.ReleaseError):
                        publisher.validate_shelf_motion_evidence(candidate)
        for invalid in [False, 1, None]:
            with self.subTest(allNodesConnected=invalid):
                candidate = copy.deepcopy(report)
                candidate['motion']['allNodesConnected'] = invalid
                with self.assertRaises(publisher.ReleaseError):
                    publisher.validate_shelf_motion_evidence(candidate)


class WindowsReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.signing = tempfile.TemporaryDirectory(prefix='windows-release-test-key-')
        cls.key = Path(cls.signing.name) / 'seed'
        cls.public = subprocess.check_output([str(publisher.legacy.helper()), 'generate', str(cls.key)], text=True).strip()
        cls.original = cls.key.read_bytes()
        cls.key_patch = mock.patch.object(publisher.legacy, 'KEY', cls.key)
        cls.key_patch.start()

    @classmethod
    def tearDownClass(cls):
        assert cls.key.read_bytes() == cls.original
        cls.key_patch.stop()
        cls.signing.cleanup()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='windows-release-policy-')
        self.root = Path(self.temporary.name)
        self.source, self.artifacts, self.releases = [self.root / name for name in ['source', 'artifacts', 'releases']]
        (self.source / 'windows/lib').mkdir(parents=True)
        (self.source / 'windows/assets/licenses').mkdir(parents=True)
        (self.source / 'windows/package.json').write_text(json.dumps({'version': '1.7.1', 'clipboardLineBuild': 63}))
        (self.source / 'windows/lib/updates.cjs').write_text("const PUBLIC_KEY = '" + self.public + "';\n")
        for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'windows/THIRD_PARTY_NOTICES.md',
                     'windows/assets/licenses/LICENSE-Electron.txt', 'windows/assets/licenses/LICENSE-Tesseract.txt',
                     'windows/assets/licenses/LICENSE-Tessdata.txt']:
            (self.source / name).write_text('Synthetic complete license fixture for ' + name)
        self.git('init', '-q')
        self.git('add', '.')
        self.git('-c', 'user.name=Release Tests', '-c', 'user.email=release-tests@example.invalid', 'commit', '-qm', 'Synthetic public source')
        self.git('remote', 'add', 'origin', 'https://github.com/' + publisher.PUBLIC_REPOSITORY + '.git')
        self.revision = self.git('rev-parse', 'HEAD')
        (self.artifacts / 'dist').mkdir(parents=True)
        binary = b'MZ' + bytes(range(250)) * 8
        (self.artifacts / 'dist' / publisher.INSTALLER).write_bytes(binary)
        self.package = {'platform': 'win32', 'architecture': 'x64', 'version': '1.7.1', 'build': 63,
                        'installer': publisher.INSTALLER, 'size': len(binary), 'sha256': hashlib.sha256(binary).hexdigest(),
                        'sourceRevision': self.revision, 'authenticodeStatus': 'NotSigned'}
        (self.artifacts / 'validation').mkdir()
        self.write_package()
        for mode in ['source', 'packaged', 'installed']:
            path = self.artifacts / 'validation' / mode
            path.mkdir()
            (path / 'windows-runtime.json').write_text(json.dumps({
                'passed': True, 'platform': 'win32', 'arch': 'x64', 'packaged': mode != 'source', 'sourceRevision': self.revision,
                'rendererErrors': [],
                'checks': [{'name': 'native acceptance ' + str(i), 'passed': True} for i in range(20)]}))
        self.upgrade = {
            'passed': True, 'platform': 'win32', 'arch': 'x64', 'version': publisher.VERSION, 'build': publisher.BUILD,
            'sourceRevision': self.revision, 'previousVersion': '1.7.0', 'previousBuild': 62,
            'oldClientCodeModified': False, 'publicFeedChanged': False, 'productionKeyChanged': False,
            'checks': [{'name': 'upgrade acceptance ' + str(i), 'passed': True} for i in range(7)],
            'fixture': {'actualClientVersion': publisher.VERSION, 'actualClientBuild': publisher.BUILD,
                        'simulatedInstalledVersion': '1.7.0', 'simulatedInstalledBuild': 62,
                        'testKeyInjectedOnlyIntoIsolatedMain': True,
                        'installerSHA256': self.package['sha256'], 'installerBytes': len(binary)}}
        (self.artifacts / 'validation/upgrade').mkdir()
        self.write_upgrade()
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as zipped:
            for file in self.artifacts.rglob('*'):
                if file.is_file():
                    zipped.writestr(file.relative_to(self.artifacts).as_posix(), file.read_bytes())
        self.archive = archive.getvalue()
        self.artifact = {'id': 55, 'name': 'clipboardline-windows-' + self.revision, 'expired': False,
                         'size_in_bytes': len(self.archive), 'digest': 'sha256:' + hashlib.sha256(self.archive).hexdigest()}
        self.run = {'id': 123, 'head_sha': self.revision, 'status': 'completed', 'conclusion': 'success',
                    'name': 'Windows application', 'path': '.github/workflows/windows.yml@main', 'head_branch': 'main', 'event': 'push',
                    'repository': {'full_name': publisher.PUBLIC_REPOSITORY}, 'head_repository': {'full_name': publisher.PUBLIC_REPOSITORY}}
        self.repository = {'id': publisher.PUBLIC_REPOSITORY_ID, 'full_name': publisher.PUBLIC_REPOSITORY, 'private': False}
        self.pushed = True
        self.graphql = None
        self.reference = self.release = None
        self.calls = []
        self.settings = {'repository': publisher.PRIVATE_REPOSITORY, 'publicKey': self.public}
        self.config_patch = mock.patch.object(publisher.legacy, 'config', return_value=self.settings)
        self.config_patch.start()
        parent = self

        class FakeGitHub:
            def request(self, method, suffix, data=None, **kwargs):
                parent.calls.append((method, suffix, data))
                base = '/repos/' + publisher.PUBLIC_REPOSITORY
                if method == 'POST' and suffix == '/graphql':
                    return copy.deepcopy(parent.graphql)
                if method == 'GET' and suffix == base:
                    return parent.repository
                if method == 'GET' and suffix.startswith(base + '/commits/'):
                    return {'sha': parent.revision if parent.pushed and suffix.endswith('/' + parent.revision) else 'a' * 40}
                if method == 'GET' and suffix == base + '/actions/runs/123':
                    return parent.run
                if method == 'GET' and suffix == base + '/actions/runs/123/artifacts?per_page=100':
                    return {'total_count': 1, 'artifacts': [parent.artifact]}
                if method == 'GET' and suffix == base + '/actions/artifacts/55/zip':
                    return parent.archive
                if method == 'GET' and suffix == base + '/git/ref/tags/' + publisher.TAG:
                    return parent.reference
                if method == 'GET' and suffix == base + '/releases/tags/' + publisher.TAG:
                    return parent.release if parent.release and not parent.release['draft'] else None
                if method == 'GET' and suffix == base + '/releases?per_page=100&page=1':
                    return [parent.release] if parent.release else []
                if method == 'GET' and suffix == base + '/releases/77':
                    return parent.release
                if method == 'POST' and suffix == base + '/releases':
                    parent.release = {**data, 'id': 77, 'html_url': 'https://github.com/' + publisher.PUBLIC_REPOSITORY + '/releases/tag/' + publisher.TAG, 'assets': []}
                    return parent.release
                if method == 'PATCH' and suffix == base + '/releases/77':
                    parent.release.update(data)
                    parent.reference = {'object': {'type': 'commit', 'sha': parent.revision}}
                    return parent.release
                raise AssertionError((method, suffix))

            def upload(self, release_id, asset):
                parent.calls.append(('UPLOAD', asset.name, release_id))
                remote = {'name': asset.name, 'size': asset.stat().st_size, 'state': 'uploaded', 'digest': 'sha256:' + publisher.legacy.digest(asset)}
                parent.release['assets'].append(remote)
                return remote

            def asset_matches(self, remote, local):
                return remote.get('size') == local.stat().st_size and remote.get('state') == 'uploaded' and remote.get('digest') == 'sha256:' + publisher.legacy.digest(local)

        self.api = FakeGitHub()
        self.publication_assets = []
        self.compose_patch = mock.patch.object(publisher.unified, 'compose', side_effect=self.compose)
        self.compose_mock = self.compose_patch.start()
        self.revalidate_patch = mock.patch.object(publisher.unified, 'revalidate')
        self.revalidate_mock = self.revalidate_patch.start()

    def tearDown(self):
        self.revalidate_patch.stop()
        self.compose_patch.stop()
        self.config_patch.stop()
        self.temporary.cleanup()

    def git(self, *arguments):
        return subprocess.check_output(['git', '-C', str(self.source), *arguments], text=True, stderr=subprocess.DEVNULL).strip()

    def test_build64_native_artifact_profile_rejects_old62_baseline(self):
        old_installer = self.artifacts / 'dist' / publisher.INSTALLER
        try:
            publisher.configure_release('1.7.2', 64)
            old_installer.rename(self.artifacts / 'dist' / publisher.INSTALLER)
            self.package.update(version=publisher.VERSION, build=publisher.BUILD,
                                installer=publisher.INSTALLER)
            self.write_package()
            self.upgrade.update(version=publisher.VERSION, build=publisher.BUILD,
                                previousVersion=publisher.PREVIOUS_VERSION,
                                previousBuild=publisher.PREVIOUS_BUILD)
            self.upgrade['fixture'].update(actualClientVersion=publisher.VERSION,
                actualClientBuild=publisher.BUILD,
                simulatedInstalledVersion=publisher.PREVIOUS_VERSION,
                simulatedInstalledBuild=publisher.PREVIOUS_BUILD)
            self.write_upgrade()
            paths, package = publisher.validate_artifacts(self.artifacts, self.revision)
            self.assertEqual(package['build'], 64)
            self.assertIn('dist/ClipBoardLine-Setup-1.7.2-x64.exe', paths)
            self.upgrade.update(previousVersion='1.7.0', previousBuild=62)
            self.write_upgrade()
            with self.assertRaisesRegex(publisher.ReleaseError, 'upgrade acceptance'):
                publisher.validate_artifacts(self.artifacts, self.revision)
        finally:
            publisher.configure_release('1.7.1')

    def test_build65_native_artifacts_require_actual_build64_upgrade_baseline(self):
        old_installer = self.artifacts / 'dist' / publisher.INSTALLER
        try:
            publisher.configure_release('1.7.2', 65)
            old_installer.rename(self.artifacts / 'dist' / publisher.INSTALLER)
            self.package.update(version=publisher.VERSION, build=publisher.BUILD,
                                installer=publisher.INSTALLER)
            self.write_package()
            self.upgrade.update(version=publisher.VERSION, build=publisher.BUILD,
                                previousVersion='1.7.2', previousBuild=64)
            self.upgrade['fixture'].update(actualClientVersion=publisher.VERSION,
                actualClientBuild=publisher.BUILD, simulatedInstalledVersion='1.7.2', simulatedInstalledBuild=64)
            self.write_upgrade()
            _, package = publisher.validate_artifacts(self.artifacts, self.revision)
            self.assertEqual(package['build'], 65)
            self.upgrade.update(previousVersion='1.7.1', previousBuild=63)
            self.write_upgrade()
            with self.assertRaisesRegex(publisher.ReleaseError, 'upgrade acceptance'):
                publisher.validate_artifacts(self.artifacts, self.revision)
        finally:
            publisher.configure_release('1.7.1')

    def test_build67_native_artifacts_require_actual_published_build66_baseline(self):
        old_installer = self.artifacts / 'dist' / publisher.INSTALLER
        try:
            publisher.configure_release('1.7.4', 67)
            old_installer.rename(self.artifacts / 'dist' / publisher.INSTALLER)
            self.package.update(version=publisher.VERSION, build=publisher.BUILD,
                                installer=publisher.INSTALLER)
            self.write_package()
            self.upgrade.update(version=publisher.VERSION, build=publisher.BUILD,
                                previousVersion='1.7.3', previousBuild=66)
            self.upgrade['fixture'].update(actualClientVersion=publisher.VERSION,
                actualClientBuild=publisher.BUILD, simulatedInstalledVersion='1.7.3', simulatedInstalledBuild=66)
            self.write_upgrade()
            _, package = publisher.validate_artifacts(self.artifacts, self.revision)
            self.assertEqual(package['build'], 67)
            self.upgrade.update(previousVersion='1.7.2', previousBuild=65)
            self.write_upgrade()
            with self.assertRaisesRegex(publisher.ReleaseError, 'upgrade acceptance'):
                publisher.validate_artifacts(self.artifacts, self.revision)
        finally:
            publisher.configure_release('1.7.1')

    def test_build68_requires_toggle_evidence_in_all_native_modes_and_the_exact_real_build67(self):
        old_installer = self.artifacts / 'dist' / publisher.INSTALLER
        try:
            publisher.configure_release('1.7.5', 68)
            old_installer.rename(self.artifacts / 'dist' / publisher.INSTALLER)
            self.package.update(version=publisher.VERSION, build=publisher.BUILD, installer=publisher.INSTALLER)
            self.write_package()
            self.upgrade.update(version=publisher.VERSION, build=publisher.BUILD,
                                previousVersion='1.7.4', previousBuild=67,
                                previousInstaller={'version': '1.7.4', 'build': 67, 'size': 545769370,
                                    'sha256': 'd6b9b2b066f4172c55ccf75bf38118430ab22a761306ef40ba0890e4ea18223f',
                                    'sourceRevision': 'ee7878362a8f740b36bb9a17114bc2aad3cfd0f3'})
            self.upgrade['fixture'].update(actualClientVersion=publisher.VERSION, actualClientBuild=publisher.BUILD,
                simulatedInstalledVersion='1.7.4', simulatedInstalledBuild=67)
            self.upgrade['candidateProcess'] = {'pid': 123, 'executable': 'owned-candidate.exe'}
            self.upgrade['nativeQuit'] = {'pid': 123, 'executable': 'owned-candidate.exe',
                'naturalWillQuitObserved': True, 'inspectorReleasedAfterWillQuit': True, 'ownedProcessGone': True}
            self.write_upgrade()
            for mode in ['source', 'packaged', 'installed']:
                (self.artifacts / 'validation' / mode / 'shelf-performance.json').write_text(
                    json.dumps(shelf_toggle_report(self.revision)))
            paths, package = publisher.validate_artifacts(self.artifacts, self.revision)
            self.assertEqual(package['build'], 68)
            for mode in ['source', 'packaged', 'installed']:
                name = f'validation/{mode}/shelf-performance.json'
                self.assertIn(name, paths)
                file = self.artifacts / name
                file.unlink()
                with self.assertRaisesRegex(publisher.ReleaseError, 'artifact is missing'):
                    publisher.validate_artifacts(self.artifacts, self.revision)
                file.write_text(json.dumps(shelf_toggle_report(self.revision)))
            for key in ['naturalWillQuitObserved', 'inspectorReleasedAfterWillQuit', 'ownedProcessGone']:
                self.upgrade['nativeQuit'][key] = False
                self.write_upgrade()
                with self.assertRaisesRegex(publisher.ReleaseError, 'owned process exit'):
                    publisher.validate_artifacts(self.artifacts, self.revision)
                self.upgrade['nativeQuit'][key] = True
            self.write_upgrade()
            self.upgrade['previousInstaller']['sha256'] = '0' * 64
            self.write_upgrade()
            with self.assertRaisesRegex(publisher.ReleaseError, 'installer identity'):
                publisher.validate_artifacts(self.artifacts, self.revision)
        finally:
            publisher.configure_release('1.7.1')

    def test_build69_requires_exact_published_build68_and_unchanged_natural_exit_proof(self):
        old_installer = self.artifacts / 'dist' / publisher.INSTALLER
        try:
            publisher.configure_release('1.7.6', 69)
            old_installer.rename(self.artifacts / 'dist' / publisher.INSTALLER)
            self.package.update(version=publisher.VERSION, build=publisher.BUILD, installer=publisher.INSTALLER)
            self.write_package()
            self.upgrade.update(version=publisher.VERSION, build=publisher.BUILD,
                previousVersion='1.7.5', previousBuild=68,
                previousInstaller={'version': '1.7.5', 'build': 68, 'size': 545769250,
                    'sha256': 'd37f86b5e355a58e3303899aa6917efb495a7f1d2a02732fd7e843cc1ef442e7',
                    'sourceRevision': '0d71154257aef8042a53ee6ff169079eddbb42bd'},
                candidateProcess={'pid': 123, 'executable': 'owned-candidate.exe'},
                nativeQuit={'pid': 123, 'executable': 'owned-candidate.exe',
                    'naturalWillQuitObserved': True, 'inspectorReleasedAfterWillQuit': True,
                    'ownedProcessGone': True})
            self.upgrade['fixture'].update(actualClientVersion=publisher.VERSION,
                actualClientBuild=publisher.BUILD, simulatedInstalledVersion='1.7.5', simulatedInstalledBuild=68)
            self.write_upgrade()
            for mode in ['source', 'packaged', 'installed']:
                (self.artifacts / 'validation' / mode / 'shelf-performance.json').write_text(
                    json.dumps(shelf_slide_report(self.revision)))
            paths, package = publisher.validate_artifacts(self.artifacts, self.revision)
            self.assertEqual((package['version'], package['build']), ('1.7.6', 69))
            self.assertIn('dist/ClipBoardLine-Setup-1.7.6-x64.exe', paths)
            self.assertIn('validation/upgrade/windows-upgrade.json', paths)
            original = copy.deepcopy(self.upgrade)
            for patch in [{'version': '1.7.4'}, {'build': 67}, {'size': 545769251},
                          {'sha256': '0' * 64}, {'sourceRevision': 'b' * 40}]:
                with self.subTest(previousInstaller=patch):
                    self.upgrade = {**copy.deepcopy(original), 'previousInstaller': {
                        **original['previousInstaller'], **patch}}
                    self.write_upgrade()
                    with self.assertRaisesRegex(publisher.ReleaseError, 'genuine published previous installer identity'):
                        publisher.validate_artifacts(self.artifacts, self.revision)
            for key in ['naturalWillQuitObserved', 'inspectorReleasedAfterWillQuit', 'ownedProcessGone']:
                for invalid in [False, None, 1]:
                    with self.subTest(nativeQuit=key, value=invalid):
                        self.upgrade = copy.deepcopy(original)
                        self.upgrade['nativeQuit'][key] = invalid
                        self.write_upgrade()
                        with self.assertRaisesRegex(publisher.ReleaseError, 'owned process exit'):
                            publisher.validate_artifacts(self.artifacts, self.revision)
            for patch in [{'pid': 124}, {'executable': 'another-process.exe'}]:
                with self.subTest(exitIdentity=patch):
                    self.upgrade = copy.deepcopy(original)
                    self.upgrade['nativeQuit'].update(patch)
                    self.write_upgrade()
                    with self.assertRaisesRegex(publisher.ReleaseError, 'owned process exit'):
                        publisher.validate_artifacts(self.artifacts, self.revision)
            self.upgrade = {**copy.deepcopy(original), 'checks': original['checks'][:6]}
            self.write_upgrade()
            with self.assertRaisesRegex(publisher.ReleaseError, 'seven distinct passing checks'):
                publisher.validate_artifacts(self.artifacts, self.revision)
            self.upgrade = copy.deepcopy(original)
            self.upgrade['fixture']['installerSHA256'] = 'f' * 64
            self.write_upgrade()
            with self.assertRaisesRegex(publisher.ReleaseError, 'installer differs from the actual candidate'):
                publisher.validate_artifacts(self.artifacts, self.revision)
            self.assertFalse(self.mutations())
        finally:
            publisher.configure_release('1.7.1')

    def write_package(self):
        (self.artifacts / 'validation/windows-package.json').write_text(json.dumps(self.package))

    def test_new_windows_build_requires_both_native_platforms_before_signing_or_publication(self):
        try:
            publisher.configure_release('1.7.2', 65)
            with mock.patch.object(publisher, 'source_revision', return_value=(self.source, self.revision)), \
                 mock.patch.object(publisher, 'validate_artifacts', return_value=({}, self.package)), \
                 mock.patch.object(publisher, 'verify_ci', return_value=55), \
                 mock.patch.object(publisher.parity, 'verify', side_effect=publisher.parity.ReleaseError('Missing Mac evidence')) as gate:
                with self.assertRaisesRegex(publisher.parity.ReleaseError, 'Missing Mac evidence'):
                    self.prepare()
                gate.assert_called_once_with(self.api, self.source, self.revision, windows_run_id=123)
            self.assertEqual(self.mutations(), [])
            self.assertFalse(self.releases.exists())
        finally:
            publisher.configure_release('1.7.1')

    def write_upgrade(self):
        (self.artifacts / 'validation/upgrade/windows-upgrade.json').write_text(json.dumps(self.upgrade))

    def prepare(self):
        return publisher.prepare(self.artifacts, 123, self.source, api=self.api, releases_dir=self.releases)

    def mutations(self):
        return [call for call in self.calls if call[0] in {'POST', 'PATCH', 'PUT', 'UPLOAD', 'DELETE'} and call[:2] != ('POST', '/graphql')]

    def compose(self, platform, own_assets, api, directory, **policy):
        self.assertEqual(platform, 'windows')
        directory = Path(directory)
        directory.mkdir(exist_ok=True)
        own = {path.name: path for path in own_assets}
        names = [publisher.INSTALLER, 'windows-update.json', 'ClipboardLine-1.7.0-build62.zip',
                 'appcast.xml', 'LICENSES-macOS.txt', 'LICENSES-Windows.txt', 'SHA256SUMS']
        for name in names:
            destination = directory / name
            origin = own.get('LICENSES.txt' if name == 'LICENSES-Windows.txt' else name)
            data = origin.read_bytes() if origin else ('Synthetic peer metadata ' + name).encode()
            if destination.exists():
                self.assertEqual(destination.read_bytes(), data)
            else:
                destination.write_bytes(data)
        self.publication_assets = [directory / name for name in names]
        return self.publication_assets

    def existing(self, prepared, draft=False):
        self.release = {'id': 77, 'tag_name': publisher.TAG, 'draft': draft, 'target_commitish': self.revision,
                        'html_url': 'https://github.com/' + publisher.PUBLIC_REPOSITORY + '/release',
                        'assets': [{'name': asset.name, 'size': asset.stat().st_size, 'state': 'uploaded',
                                    'digest': 'sha256:' + publisher.legacy.digest(asset)} for asset in self.compose('windows', prepared['assets'], self.api, self.releases / (publisher.TAG + '-unified'))]}
        self.reference = {'object': {'type': 'commit', 'sha': self.revision}}

    def test_prepare_real_signature_and_existing_identity_without_external_writes(self):
        prepared = self.prepare()
        manifest = prepared['assets'][1]
        self.assertEqual(publisher.legacy.decode_envelope(manifest, self.public), prepared['payload'])
        self.assertEqual(prepared['payload']['repository'], publisher.PUBLIC_REPOSITORY)
        self.assertEqual(prepared['payload']['sourceRevision'], self.revision)
        self.assertIn('/' + publisher.TAG + '/' + publisher.INSTALLER, prepared['payload']['url'])
        self.assertEqual({path.name for path in prepared['assets']}, {publisher.INSTALLER, 'windows-update.json', 'SHA256SUMS', 'LICENSES.txt'})
        self.assertEqual(self.key.read_bytes(), self.original)
        self.assertFalse(self.mutations())

    def test_repeat_preparation_preserves_exact_existing_assets(self):
        prepared = self.prepare()
        before = {path.name: (path.read_bytes(), path.stat().st_mtime_ns) for path in prepared['assets']}
        self.prepare()
        self.assertEqual(before, {path.name: (path.read_bytes(), path.stat().st_mtime_ns) for path in prepared['assets']})

    def test_dirty_source_wrong_origin_or_parent_checkout_are_rejected(self):
        dirty = self.source / 'untracked-private-data'
        dirty.write_text('synthetic')
        with self.assertRaises(publisher.ReleaseError): self.prepare()
        dirty.unlink()
        self.git('remote', 'set-url', 'origin', 'https://github.com/' + publisher.PRIVATE_REPOSITORY)
        with self.assertRaises(publisher.ReleaseError): self.prepare()
        with self.assertRaises(publisher.ReleaseError): publisher.source_revision(self.source / 'windows')
        self.assertFalse(self.mutations())

    def test_wrong_public_visibility_or_unpushed_source_blocks_release(self):
        self.repository['private'] = True
        with self.assertRaises(publisher.ReleaseError): self.prepare()
        self.repository['private'] = False
        self.pushed = False
        with self.assertRaises(publisher.ReleaseError): self.prepare()
        self.assertFalse(self.mutations())

    def test_workflow_must_be_successful_exact_source_and_not_a_fork_pr(self):
        original = copy.deepcopy(self.run)
        for patch in [{'head_sha': 'a' * 40}, {'conclusion': 'failure'}, {'status': 'in_progress'},
                      {'path': '.github/workflows/other.yml'}, {'name': 'Other job'}, {'event': 'pull_request'},
                      {'head_repository': {'full_name': 'someone/clipboardline-desktop'}}]:
            with self.subTest(patch=patch):
                self.run = {**original, **patch}
                with self.assertRaises(publisher.ReleaseError): self.prepare()
        self.assertFalse(self.mutations())

    def graphql_completion(self):
        return {'data': {'repository': {
            'nameWithOwner': publisher.PUBLIC_REPOSITORY, 'isPrivate': False,
            'object': {'__typename': 'Commit', 'oid': self.revision, 'checkSuites': {'nodes': [{
                'status': 'COMPLETED', 'conclusion': 'SUCCESS', 'app': {'slug': 'github-actions'},
                'workflowRun': {'databaseId': 123,
                                'url': 'https://github.com/' + publisher.PUBLIC_REPOSITORY + '/actions/runs/123'}}]}}}}}

    def test_stale_rest_status_requires_exact_successful_graphql_completion(self):
        self.graphql = self.graphql_completion()
        for status in ['queued', 'in_progress']:
            with self.subTest(status=status):
                self.run['status'] = status
                self.run['conclusion'] = None
                prepared = self.prepare()
                self.assertEqual(prepared['payload']['sourceRevision'], self.revision)
        reads = [call for call in self.calls if call[:2] == ('POST', '/graphql')]
        self.assertEqual(len(reads), 2)
        self.assertEqual(reads[0][2]['variables'], {
            'owner': 'orkunisitmak', 'name': 'clipboardline-desktop', 'revision': self.revision})
        self.assertTrue(reads[0][2]['query'].lstrip().startswith('query '))
        self.assertIn('workflowRun{databaseId url}', reads[0][2]['query'])
        self.assertTrue(any('/actions/artifacts/55/zip' in call[1] for call in self.calls))
        self.assertFalse(self.mutations())

    def test_rest_success_never_needs_graphql_and_completed_failure_never_falls_back(self):
        self.prepare()
        self.assertFalse(any(call[:2] == ('POST', '/graphql') for call in self.calls))
        self.calls.clear()
        self.run['conclusion'] = 'failure'
        self.graphql = self.graphql_completion()
        with self.assertRaises(publisher.ReleaseError): self.prepare()
        self.assertFalse(any(call[:2] == ('POST', '/graphql') for call in self.calls))
        self.assertFalse(self.mutations())

    def test_graphql_fallback_rejects_wrong_identity_status_app_errors_and_missing_runs(self):
        valid = self.graphql_completion()
        candidates = [None, {}, {'errors': [{'message': 'Synthetic unavailable query'}], **valid}]
        for key, value in [('nameWithOwner', 'other/clipboardline-desktop'), ('nameWithOwner', None), ('isPrivate', True)]:
            changed = copy.deepcopy(valid)
            changed['data']['repository'][key] = value
            candidates.append(changed)
        for key, value in [('__typename', 'Blob'), ('oid', 'a' * 40)]:
            changed = copy.deepcopy(valid)
            changed['data']['repository']['object'][key] = value
            candidates.append(changed)
        for patch in [{'status': 'IN_PROGRESS'}, {'conclusion': 'FAILURE'}, {'conclusion': None},
                      {'app': {'slug': 'other-ci'}}, {'app': None},
                      {'workflowRun': {'databaseId': 124, 'url': 'https://github.com/' + publisher.PUBLIC_REPOSITORY + '/actions/runs/124'}},
                      {'workflowRun': {'databaseId': 123, 'url': 'https://github.com/other/repo/actions/runs/123'}},
                      {'workflowRun': {'databaseId': '123', 'url': 'https://github.com/' + publisher.PUBLIC_REPOSITORY + '/actions/runs/123'}}]:
            changed = copy.deepcopy(valid)
            changed['data']['repository']['object']['checkSuites']['nodes'][0].update(patch)
            candidates.append(changed)
        for nodes in [[], None, [copy.deepcopy(valid['data']['repository']['object']['checkSuites']['nodes'][0])] * 2]:
            changed = copy.deepcopy(valid)
            changed['data']['repository']['object']['checkSuites']['nodes'] = nodes
            candidates.append(changed)
        self.run.update(status='queued', conclusion=None)
        for index, response in enumerate(candidates):
            with self.subTest(index=index):
                self.graphql = response
                self.calls.clear()
                with self.assertRaises(publisher.ReleaseError): self.prepare()
                self.assertFalse(any('/actions/artifacts/' in call[1] for call in self.calls))
                self.assertFalse(self.mutations())

    def test_graphql_success_cannot_repair_wrong_rest_metadata_or_replace_artifact_proof(self):
        self.graphql = self.graphql_completion()
        original = copy.deepcopy(self.run)
        for patch in [{'head_sha': 'a' * 40}, {'path': '.github/workflows/other.yml'}, {'name': 'Other job'},
                      {'event': 'pull_request'}, {'repository': {'full_name': 'other/repo'}},
                      {'head_repository': {'full_name': 'other/repo'}}]:
            with self.subTest(patch=patch):
                self.run = {**original, 'status': 'queued', 'conclusion': None, **patch}
                self.calls.clear()
                with self.assertRaises(publisher.ReleaseError): self.prepare()
                self.assertFalse(any(call[:2] == ('POST', '/graphql') for call in self.calls))
        self.run = {**original, 'status': 'queued', 'conclusion': None}
        self.archive += b'changed after GitHub digest'
        with self.assertRaisesRegex(publisher.ReleaseError, 'archive digest differs'): self.prepare()
        self.assertFalse(self.mutations())

    def test_every_native_report_needs_twenty_unique_passing_real_windows_checks(self):
        path = self.artifacts / 'validation/installed/windows-runtime.json'
        original = json.loads(path.read_text())
        for patch in [{'passed': False}, {'platform': 'darwin'}, {'arch': 'arm64'}, {'packaged': False},
                      {'sourceRevision': 'a' * 40}, {'checks': original['checks'][:19]},
                      {'checks': [original['checks'][0]] * 20}, {'checks': [*original['checks'][:-1], {'name': 'failed', 'passed': False}]}]:
            with self.subTest(patch=patch):
                path.write_text(json.dumps({**original, **patch}))
                with self.assertRaises(publisher.ReleaseError): self.prepare()
        self.assertFalse(self.mutations())

    def test_every_runtime_report_requires_explicit_empty_renderer_errors(self):
        for mode in ['source', 'packaged', 'installed']:
            path = self.artifacts / 'validation' / mode / 'windows-runtime.json'
            original = json.loads(path.read_text())
            for value in [None, ['Uncaught renderer error'], False, '']:
                with self.subTest(mode=mode, rendererErrors=value):
                    path.write_text(json.dumps({**original, 'rendererErrors': value}))
                    with self.assertRaisesRegex(publisher.ReleaseError, 'no renderer errors'):
                        publisher.validate_artifacts(self.artifacts, self.revision)
            missing = {key: value for key, value in original.items() if key != 'rendererErrors'}
            path.write_text(json.dumps(missing))
            with self.assertRaisesRegex(publisher.ReleaseError, 'no renderer errors'):
                publisher.validate_artifacts(self.artifacts, self.revision)
            path.write_text(json.dumps(original))
        self.assertFalse(self.mutations())

    def test_upgrade_acceptance_is_mandatory_before_signing_or_public_mutation(self):
        (self.artifacts / 'validation/upgrade/windows-upgrade.json').unlink()
        with mock.patch.object(publisher.legacy, 'run') as signer:
            with self.assertRaises(publisher.ReleaseError): self.prepare()
            signer.assert_not_called()
        self.assertEqual(self.calls, [])
        self.assertFalse(self.mutations())

    def test_upgrade_report_requires_exact_passing_windows_release_and_source(self):
        original = copy.deepcopy(self.upgrade)
        for patch in [{'passed': False}, {'passed': 1}, {'platform': 'darwin'}, {'arch': 'arm64'},
                      {'sourceRevision': 'a' * 40}, {'version': '1.7.0'}, {'build': 64}, {'build': True},
                      {'previousVersion': '1.6.0'}, {'previousBuild': 61}, {'previousBuild': True}]:
            with self.subTest(patch=patch):
                self.upgrade = {**original, **patch}; self.write_upgrade()
                with self.assertRaisesRegex(publisher.ReleaseError, 'upgrade acceptance failed'):
                    publisher.validate_artifacts(self.artifacts, self.revision)
        self.assertFalse(self.mutations())

    def test_upgrade_safety_flags_must_be_present_and_explicitly_false(self):
        original = copy.deepcopy(self.upgrade)
        for flag in ['oldClientCodeModified', 'publicFeedChanged', 'productionKeyChanged']:
            for value in [True, None, 0, 'false']:
                with self.subTest(flag=flag, value=value):
                    self.upgrade = {**original, flag: value}; self.write_upgrade()
                    with self.assertRaisesRegex(publisher.ReleaseError, 'preserve the old client'):
                        publisher.validate_artifacts(self.artifacts, self.revision)
            self.upgrade = {key: value for key, value in original.items() if key != flag}; self.write_upgrade()
            with self.assertRaisesRegex(publisher.ReleaseError, 'preserve the old client'):
                publisher.validate_artifacts(self.artifacts, self.revision)
        self.assertFalse(self.mutations())

    def test_upgrade_needs_seven_distinct_passing_checks(self):
        original = copy.deepcopy(self.upgrade)
        checks = original['checks']
        variants = [None, checks[:6], [checks[0]] * 7,
                    [*checks[:6], {'name': 'failed replacement', 'passed': False}],
                    [*checks[:6], {'name': 'numeric boolean', 'passed': 1}],
                    [*checks[:6], {'name': '  ', 'passed': True}],
                    [*checks[:6], {'name': '  UPGRADE ACCEPTANCE 0  ', 'passed': True}]]
        for variant in variants:
            with self.subTest(checks=variant):
                self.upgrade = {**original, 'checks': variant}; self.write_upgrade()
                with self.assertRaisesRegex(publisher.ReleaseError, 'seven distinct passing checks'):
                    publisher.validate_artifacts(self.artifacts, self.revision)
        self.assertFalse(self.mutations())

    def test_upgrade_fixture_requires_exact_corrected_client_and_isolated_test_key(self):
        original = copy.deepcopy(self.upgrade)
        for patch in [{'actualClientVersion': '1.7.0'}, {'actualClientBuild': 62}, {'actualClientBuild': True},
                      {'simulatedInstalledVersion': '1.6.0'}, {'simulatedInstalledBuild': 61},
                      {'simulatedInstalledBuild': True}, {'testKeyInjectedOnlyIntoIsolatedMain': False},
                      {'testKeyInjectedOnlyIntoIsolatedMain': 1}, {'testKeyInjectedOnlyIntoIsolatedMain': None}]:
            with self.subTest(patch=patch):
                self.upgrade = {**original, 'fixture': {**original['fixture'], **patch}}; self.write_upgrade()
                with self.assertRaisesRegex(publisher.ReleaseError, 'exact corrected client'):
                    publisher.validate_artifacts(self.artifacts, self.revision)
        self.upgrade = {**original, 'fixture': None}; self.write_upgrade()
        with self.assertRaisesRegex(publisher.ReleaseError, 'exact corrected client'):
            publisher.validate_artifacts(self.artifacts, self.revision)
        self.assertFalse(self.mutations())

    def test_upgrade_fixture_must_bind_both_candidate_installer_hash_and_size(self):
        original = copy.deepcopy(self.upgrade)
        for patch in [{'installerSHA256': 'a' * 64}, {'installerSHA256': None},
                      {'installerBytes': self.package['size'] + 1}, {'installerBytes': str(self.package['size'])},
                      {'installerBytes': True}]:
            with self.subTest(patch=patch):
                self.upgrade = {**original, 'fixture': {**original['fixture'], **patch}}; self.write_upgrade()
                with self.assertRaisesRegex(publisher.ReleaseError, 'upgrade fixture installer differs'):
                    publisher.validate_artifacts(self.artifacts, self.revision)
        self.upgrade = original; self.write_upgrade()
        installer = self.artifacts / 'dist' / publisher.INSTALLER
        installer.write_bytes(b'MZ' + b'changed but valid candidate executable' * 80)
        self.package.update(size=installer.stat().st_size, sha256=publisher.legacy.digest(installer)); self.write_package()
        with self.assertRaisesRegex(publisher.ReleaseError, 'upgrade fixture installer differs'):
            publisher.validate_artifacts(self.artifacts, self.revision)
        self.assertFalse(self.mutations())

    def test_schema_valid_upgrade_report_is_bound_to_exact_successful_ci_archive(self):
        paths, _ = publisher.validate_artifacts(self.artifacts, self.revision)
        self.assertIn('validation/upgrade/windows-upgrade.json', paths)
        self.upgrade['checks'][0]['details'] = 'Local alteration still passes report schema'
        self.write_upgrade()
        publisher.validate_artifacts(self.artifacts, self.revision)
        with mock.patch.object(publisher.legacy, 'run') as signer:
            with self.assertRaises(publisher.ReleaseError): self.prepare()
            signer.assert_not_called()
        self.assertFalse(self.mutations())

    def test_installer_pe_size_hash_and_release_metadata_are_required(self):
        original = self.package.copy()
        for patch in [{'sha256': 'a' * 64}, {'size': 999}, {'version': '1.6.0'}, {'build': True}, {'architecture': 'arm64'}, {'authenticodeStatus': 'HashMismatch'}]:
            with self.subTest(patch=patch):
                self.package = {**original, **patch}; self.write_package()
                with self.assertRaises(publisher.ReleaseError): self.prepare()
        self.package = original; self.write_package()
        (self.artifacts / 'dist' / publisher.INSTALLER).write_bytes(b'NO' + b'x' * 2000)
        with self.assertRaises(publisher.ReleaseError): self.prepare()
        self.assertFalse(self.mutations())

    def test_forged_local_reports_cannot_replace_the_successful_ci_artifact(self):
        path = self.artifacts / 'dist' / publisher.INSTALLER
        path.write_bytes(b'MZ' + b'changed synthetic executable' * 80)
        self.package.update(size=path.stat().st_size, sha256=publisher.legacy.digest(path)); self.write_package()
        self.upgrade['fixture'].update(installerBytes=self.package['size'], installerSHA256=self.package['sha256'])
        self.write_upgrade()
        publisher.validate_artifacts(self.artifacts, self.revision)
        with self.assertRaises(publisher.ReleaseError): self.prepare()
        self.assertFalse(self.mutations())

    def test_expired_or_tampered_github_artifact_is_rejected(self):
        self.artifact['expired'] = True
        with self.assertRaises(publisher.ReleaseError): self.prepare()
        self.artifact['expired'] = False
        self.archive += b'tampered archive'
        with self.assertRaises(publisher.ReleaseError): self.prepare()
        self.assertFalse(self.mutations())

    def test_artifact_symlink_is_rejected(self):
        path = self.artifacts / 'dist' / publisher.INSTALLER
        external = self.root / 'external.exe'; path.rename(external); path.symlink_to(external)
        with self.assertRaises(publisher.ReleaseError): self.prepare()
        self.assertFalse(self.mutations())

    def test_prepared_installer_and_signed_envelope_are_immutable(self):
        prepared = self.prepare()
        manifest = prepared['assets'][1]
        original = manifest.read_bytes()
        envelope = json.loads(original); envelope['signature'] = 'A' * 88
        manifest.write_text(json.dumps(envelope))
        with self.assertRaises(subprocess.CalledProcessError): self.prepare()
        self.assertNotEqual(manifest.read_bytes(), original)
        manifest.write_bytes(original)
        prepared['assets'][0].write_bytes(b'tampered package')
        with self.assertRaises(publisher.ReleaseError): self.prepare()
        self.assertEqual(prepared['assets'][0].read_bytes(), b'tampered package')

    def test_publish_targets_only_public_source_commit_and_seven_verified_assets(self):
        prepared = self.prepare()
        result = publisher.publish(prepared, api=self.api)
        self.assertFalse(result['draft'])
        created = next(call[2] for call in self.calls if call[0] == 'POST')
        self.assertEqual(created['target_commitish'], self.revision)
        self.assertEqual(len([call for call in self.calls if call[0] == 'UPLOAD']), 7)
        self.revalidate_mock.assert_called_once()
        self.assertEqual(self.calls[-1][2]['make_latest'], 'true')
        self.assertFalse(any('/repos/' + publisher.PRIVATE_REPOSITORY + '/' in call[1] for call in self.calls))

    def test_staging_never_promotes_mismatched_counterpart_to_latest(self):
        result = publisher.publish(self.prepare(), api=self.api, stage=True)
        self.assertTrue(result['staged'])
        self.assertEqual(self.calls[-1][2]['make_latest'], 'false')
        self.assertTrue(self.compose_mock.call_args.kwargs['allow_version_mismatch'])
        self.assertTrue(self.revalidate_mock.call_args.kwargs['allow_version_mismatch'])

    def test_final_tagged_counterpart_requires_equal_versions(self):
        tag = 'clipboardline-1.7.1-build65'
        publisher.publish(self.prepare(), api=self.api, counterpart_tag=tag)
        self.assertEqual(self.calls[-1][2]['make_latest'], 'true')
        for operation in [self.compose_mock, self.revalidate_mock]:
            self.assertEqual(operation.call_args.kwargs,
                             {'counterpart_tag': tag, 'allow_version_mismatch': False})

    def test_nonboolean_stage_cannot_bypass_latest_policy(self):
        with self.assertRaises(publisher.ReleaseError):
            publisher.publish({}, api=self.api, stage='false')
        self.assertEqual(self.mutations(), [])

    def test_changed_tag_or_draft_target_blocks_all_public_mutation(self):
        prepared = self.prepare(); self.existing(prepared, draft=True)
        self.reference = {'object': {'type': 'commit', 'sha': 'a' * 40}}
        with self.assertRaises(publisher.ReleaseError): publisher.publish(prepared, api=self.api)
        self.reference = None; self.release['target_commitish'] = 'other-branch'
        with self.assertRaises(publisher.ReleaseError): publisher.publish(prepared, api=self.api)
        self.assertFalse(self.mutations())

    def test_existing_asset_with_different_bytes_is_never_overwritten(self):
        prepared = self.prepare(); self.existing(prepared, draft=True)
        self.release['assets'][0]['digest'] = 'sha256:' + '0' * 64
        with self.assertRaises(publisher.ReleaseError): publisher.publish(prepared, api=self.api)
        self.assertFalse(self.mutations())

    def test_changed_windows_public_key_pin_is_rejected_without_key_replacement(self):
        (self.source / 'windows/lib/updates.cjs').write_text("const PUBLIC_KEY = 'different-public-key';\n")
        self.git('add', '.'); self.git('-c', 'user.name=Release Tests', '-c', 'user.email=release-tests@example.invalid', 'commit', '-qm', 'Wrong pin fixture')
        with self.assertRaises(publisher.ReleaseError): self.prepare()
        self.assertEqual(self.key.read_bytes(), self.original)
        self.assertFalse(self.mutations())

    def test_published_matching_release_is_read_only_and_missing_assets_never_repaired(self):
        prepared = self.prepare(); self.existing(prepared)
        publisher.publish(prepared, api=self.api)
        self.assertFalse(self.mutations())
        self.release['assets'].pop()
        with self.assertRaises(publisher.ReleaseError): publisher.publish(prepared, api=self.api)
        self.assertFalse(self.mutations())

    def test_draft_retry_reuses_matching_assets_without_overwrite(self):
        prepared = self.prepare(); self.existing(prepared, draft=True)
        self.release['assets'] = self.release['assets'][:1]
        publisher.publish(prepared, api=self.api)
        self.assertEqual(len([call for call in self.calls if call[0] == 'UPLOAD']), 6)
        self.assertEqual(len([call for call in self.calls if call[0] == 'PATCH']), 1)

    def test_publish_rechecks_ci_and_local_preparation_before_any_mutation(self):
        prepared = self.prepare()
        self.run['conclusion'] = 'failure'
        with self.assertRaises(publisher.ReleaseError): publisher.publish(prepared, api=self.api)
        self.assertFalse(self.mutations())

    def test_publish_rechecks_upgrade_proof_before_any_public_mutation(self):
        prepared = self.prepare()
        self.upgrade['passed'] = False; self.write_upgrade()
        with self.assertRaisesRegex(publisher.ReleaseError, 'upgrade acceptance failed'):
            publisher.publish(prepared, api=self.api)
        self.assertFalse(self.mutations())

    def test_recreated_canonical_name_with_another_repository_id_is_rejected(self):
        for invalid in [publisher.PUBLIC_REPOSITORY_ID + 1, str(publisher.PUBLIC_REPOSITORY_ID), None]:
            with self.subTest(repository_id=invalid):
                self.repository['id'] = invalid
                with self.assertRaisesRegex(publisher.ReleaseError, 'exact public source repository'):
                    self.prepare()
                self.assertFalse(self.mutations())

    def test_missing_counterpart_feed_blocks_release_creation(self):
        prepared = self.prepare()
        self.compose_mock.side_effect = publisher.ReleaseError('Counterpart is unavailable')
        with self.assertRaises(publisher.ReleaseError): publisher.publish(prepared, api=self.api)
        self.assertFalse(self.mutations())

    def test_counterpart_change_after_upload_blocks_latest_promotion(self):
        prepared = self.prepare()
        self.revalidate_mock.side_effect = publisher.ReleaseError('Counterpart changed')
        with self.assertRaises(publisher.ReleaseError): publisher.publish(prepared, api=self.api)
        self.assertFalse([call for call in self.calls if call[0] == 'PATCH'])
        self.assertTrue(self.release['draft'])

    def test_missing_uploaded_channel_blocks_latest_promotion(self):
        prepared = self.prepare()
        original = self.api.upload
        def dropping(release_id, asset):
            remote = original(release_id, asset)
            if asset.name == 'appcast.xml': self.release['assets'].remove(remote)
            return remote
        self.api.upload = dropping
        with self.assertRaisesRegex(publisher.ReleaseError, 'seven assets'):
            publisher.publish(prepared, api=self.api)
        self.assertFalse([call for call in self.calls if call[0] == 'PATCH'])


class PublisherTransactionLockTests(unittest.TestCase):
    def test_publish_holds_shared_lock_before_preparation_until_transaction_finishes(self):
        events = []
        class Lock:
            def __enter__(self): events.append('locked')
            def __exit__(self, *_args): events.append('unlocked')
        def execute(args):
            self.assertTrue(args.publish)
            self.assertEqual(events, ['locked'])
            events.append('prepare-through-publish')
        with mock.patch.object(publisher.sys, 'argv', ['publisher', '--artifact-dir', '/synthetic/artifacts', '--run-id', '123', '--publish']), \
             mock.patch.object(publisher.unified, 'publishing_lock', return_value=Lock()) as lock, \
             mock.patch.object(publisher, 'execute', side_effect=execute):
            publisher.main()
        lock.assert_called_once_with()
        self.assertEqual(events, ['locked', 'prepare-through-publish', 'unlocked'])

    def test_prepare_only_does_not_take_publication_lock(self):
        with mock.patch.object(publisher.sys, 'argv', ['publisher', '--artifact-dir', '/synthetic/artifacts', '--run-id', '123']), \
             mock.patch.object(publisher.unified, 'publishing_lock') as lock, \
             mock.patch.object(publisher, 'execute') as execute:
            publisher.main()
        lock.assert_not_called()
        execute.assert_called_once()
        self.assertFalse(execute.call_args.args[0].publish)

    def test_busy_lock_prevents_any_preparation_or_external_work(self):
        with mock.patch.object(publisher.sys, 'argv', ['publisher', '--artifact-dir', '/synthetic/artifacts', '--run-id', '123', '--publish']), \
             mock.patch.object(publisher.unified, 'publishing_lock', side_effect=publisher.unified.ReleaseError('Already publishing')), \
             mock.patch.object(publisher, 'execute') as execute:
            with self.assertRaises(publisher.unified.ReleaseError): publisher.main()
        execute.assert_not_called()


if __name__ == '__main__':
    unittest.main()
