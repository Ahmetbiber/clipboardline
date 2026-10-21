#!/usr/bin/env python3
"""Prepare a locally signed Windows release from verified CI; upload only with --publish."""
from __future__ import annotations

from pathlib import Path
from contextlib import nullcontext
import argparse
import datetime as dt
import hashlib
import importlib.util
import io
import json
import math
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.parse
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import unified_release_assets as unified
PARITY_SPEC = importlib.util.spec_from_file_location('windows_cross_platform_gate', Path(__file__).with_name('verify-cross-platform-release.py'))
parity = importlib.util.module_from_spec(PARITY_SPEC)
PARITY_SPEC.loader.exec_module(parity)
SPEC = importlib.util.spec_from_file_location('windows_legacy_publisher', Path(__file__).with_name('publish-review-release.py'))
legacy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(legacy)
ROOT = legacy.ROOT
PUBLIC_REPOSITORY = 'orkunisitmak/clipboardline-desktop'
PUBLIC_REPOSITORY_ID = 1425566096
PRIVATE_REPOSITORY = 'orkunisitmak/clipboardline'
SOURCE_DIR = ROOT / 'local/public-source/clipboardline-desktop'
# Explicit reviewed profiles keep every release/upgrade identity fixed. Adding a
# version never trusts arbitrary package metadata or weakens the CI gates.
RELEASE_PROFILES = {
    '1.7.1': {63: ('1.7.0', 62)},
    '1.7.2': {64: ('1.7.1', 63), 65: ('1.7.2', 64)},
    '1.7.3': {66: ('1.7.2', 65)},
    '1.7.4': {67: ('1.7.3', 66)},
    '1.7.5': {68: ('1.7.4', 67)},
    '1.7.6': {69: ('1.7.5', 68)},
}
VERSION, BUILD = '1.7.1', 63
PREVIOUS_VERSION, PREVIOUS_BUILD = '1.7.0', 62
WORKFLOW = '.github/workflows/windows.yml'
INSTALLER = f'ClipBoardLine-Setup-{VERSION}-x64.exe'
MANIFEST = 'windows-update.json'
TAG = f'windows-{VERSION}-build{BUILD}'
MAXIMUM = 1024 ** 3
require, ReleaseError = legacy.require, legacy.ReleaseError


def current_release_notes():
    if VERSION == '1.7.6' and BUILD == 69:
        return (f'ClipBoardLine {VERSION} for macOS and Windows. Both signed update feeds and current packages are included.\n\n'
                '- Shelves slide down on opening and back up on dismissal, while retaining the three-shelf performance improvements.\n'
                '- Compositor-only motion keeps window bounds and card layout fixed; rapid shortcut reversals continue from the current position.\n'
                '- Reduce Motion is respected. Keyboard selection and returned application focus retain their behavior.\n\n'
                'Both exact-source native platform acceptance suites and the shared shelf contract passed. Windows source, packaged and installed suites observed actual animated positions, retained cards and media, rapid reversals and reduced motion. The isolated signed candidate-updater gate upgraded the genuine published 1.7.5/build68 installation and preserved its data. This is separate from an unchanged old client’s live public-channel test.\n\n'
                'Türkçe: Askıların yukarıdan kayarak açılıp kapanma animasyonu geri geldi. Üç askı için yapılan performans iyileştirmeleri korundu; hızlı açıp kapatma ve Hareketi Azalt tercihi desteklenir. Geçmiş ve ayarlar korunur.\n\n'
                'The update manifest uses the pinned Ed25519 identity. No Windows Authenticode certificate is configured; SmartScreen may warn.')

    if VERSION == '1.7.5' and BUILD == 68:
        return (f'ClipBoardLine {VERSION} for macOS and Windows. Both signed update feeds and current packages are included.\n\n'
                '- Faster opening and dismissal with all three shelves enabled; repeated toggles retain their prepared content and avoid unnecessary layout work.\n'
                '- Opening still selects only the first image; row navigation, search, preview, edits, copy and returned application focus keep their behavior.\n'
                '- History, saved content, folders, tags and preferences stay on this computer.\n\n'
                'Both exact-source native platform acceptance suites and the shared shelf contract passed. Windows source, packaged and installed suites verified repeated native close/reopen, preserved cards and thumbnails, current hidden edits and focus. The isolated candidate-updater gate upgraded the genuine published 1.7.4/build67 installation and preserved its data. That gate is separate from an unchanged old client’s live public-channel test.\n\n'
                'Türkçe: Üç askı açıkken kısayolla açma/kapatma sırasında gereksiz yerleşim ve geçmiş kopyalama işlemleri azaltıldı. Açılış seçimi, kısayollar, önizleme, kopyalama ve önceki uygulamaya odak dönüşü korundu. Geçmiş ve ayarlar silinmez; güncelleme için GitHub hesabı veya kod gerekmez.\n\n'
                'The update manifest uses the pinned Ed25519 identity. No Windows Authenticode certificate is configured; SmartScreen may warn.')
    if VERSION == '1.7.4' and BUILD == 67:
        return (f'ClipBoardLine {VERSION} for macOS and Windows. Both signed update feeds and current packages are included.\n\n'
                '- Smoother browsing with Images, Texts and Links open together: bounded visible-card updates and cached row filtering reduce repeated work.\n'
                '- Keyboard selection, page navigation, search, preview and returned paste focus keep their existing behavior.\n'
                '- History, saved content, folders, tags and preferences stay on this computer.\n\n'
                f'Both platforms passed their exact-source native acceptance and the shared shelf behavior contract. Windows source, packaged and installed acceptance passed; its isolated signed candidate-updater gate preserved data and automatically reopened over the genuine published 1.7.3/build{PREVIOUS_BUILD} installation. This is separate from the unchanged old client’s live public-channel test after publication.\n\n'
                'Türkçe: Görsel, metin ve link askıları birlikte açıkken kaydırma sırasında yinelenen filtreleme ve görünüm güncellemeleri azaltıldı. Kısayollar, sayfa geçişi, arama, önizleme ve yapıştırma sonrası odak davranışı korundu. Geçmiş ve ayarlar silinmez; güncelleme için GitHub hesabı veya kod gerekmez.\n\n'
                'The update manifest uses the pinned Ed25519 identity. No Windows Authenticode certificate is configured; SmartScreen may warn.')
    if BUILD < 66:
        return None
    return (f'ClipBoardLine {VERSION} for macOS and Windows. Both signed update feeds and current packages are included.\n\n'
            '- Shared keyboard behavior and remapping, scoped pin filters, Library lists, folders, tags and saved notes.\n'
            '- Editable text previews with autosave and native undo; full-resolution image previews, crop and markup.\n'
            '- Offline MobileCLIP-S2 visual search, OCR and MP4/MOV playback and trimming on Windows.\n'
            '- Real text/PNG paste and keyboard focus checks in native editors, Edge and Chrome, with changed/secure/read-only target rejection.\n\n'
            f'Native Windows source, packaged and installed acceptance passed. The candidate updater also passed replacement, data preservation and automatic reopen over a real build{PREVIOUS_BUILD} installation. This gate uses an isolated signed test feed; it is separate from the unchanged old client’s live public-channel test after publication. Both platforms passed the same 62 shared shelf observations at this exact source revision.\n\n'
            'Türkçe: Kısayollar, Library kapsamları, klasör/etiket işlemleri, düzenlenebilir önizleme ve metin/görsel yapıştırma akışları eşitlendi. Windows’a çevrimdışı görsel arama ve kayıt oynatma/kırpma desteği eklendi. Güncelleme geçmişi ve ayarları korur; GitHub hesabı veya kod gerekmez.\n\n'
            '[Detailed comparison and native platform details](https://github.com/orkunisitmak/clipboardline-desktop/blob/main/docs/parity-1.7.3.md).\n\n'
            'The update manifest uses the pinned Ed25519 identity. No Windows Authenticode certificate is configured; SmartScreen may warn.')


def configure_release(version, build=None):
    """Select one reviewed fixed identity; the legacy default remains 1.7.1."""
    require(version in RELEASE_PROFILES, 'Windows release version has no reviewed profile')
    global VERSION, BUILD, PREVIOUS_VERSION, PREVIOUS_BUILD, INSTALLER, TAG
    profiles = RELEASE_PROFILES[version]
    build = max(profiles) if build is None else build
    require(type(build) is int and build in profiles, 'Windows release build has no reviewed profile')
    previous_version, previous_build = profiles[build]
    VERSION, BUILD = version, build
    PREVIOUS_VERSION, PREVIOUS_BUILD = previous_version, previous_build
    INSTALLER = f'ClipBoardLine-Setup-{VERSION}-x64.exe'
    TAG = f'windows-{VERSION}-build{BUILD}'


def git(source, *arguments):
    return subprocess.check_output(['git', '-C', str(source), *arguments], text=True).strip()


def source_revision(source):
    source = Path(source).resolve()
    require(Path(git(source, 'rev-parse', '--show-toplevel')).resolve() == source,
            'Source directory must be its own Git checkout, never the private parent repository')
    require(not git(source, 'status', '--porcelain'), 'Commit every public source change before preparing Windows releases')
    remote = git(source, 'remote', 'get-url', 'origin')
    require(remote in {f'https://github.com/{PUBLIC_REPOSITORY}', f'https://github.com/{PUBLIC_REPOSITORY}.git',
                       f'git@github.com:{PUBLIC_REPOSITORY}.git', f'ssh://git@github.com/{PUBLIC_REPOSITORY}.git'},
            'Source origin must be the exact separate public source repository')
    revision = git(source, 'rev-parse', 'HEAD')
    require(re.fullmatch(r'[0-9a-f]{40}', revision), 'Invalid public source revision')
    package = json.loads((source / 'windows/package.json').read_text())
    require(package.get('version') == VERSION, 'Windows package version differs from the fixed release version')
    require(type(package.get('clipboardLineBuild')) is int and package['clipboardLineBuild'] == BUILD,
            'Windows source build differs from the reviewed release build')
    return source, revision


def safe_file(directory, relative):
    directory = Path(directory)
    require(not directory.is_symlink(), 'Artifact directory must not be a symlink')
    directory = directory.resolve()
    relative = Path(relative)
    require(not relative.is_absolute() and '..' not in relative.parts, 'Unsafe artifact path')
    candidate = directory
    for part in relative.parts:
        candidate = candidate / part
        require(not candidate.is_symlink(), 'Artifact path contains a symlink')
    require(candidate.is_file() and candidate.resolve().is_relative_to(directory), 'Required artifact is missing or unsafe')
    return candidate


def read_json(path, maximum=1024 * 1024):
    require(path.stat().st_size <= maximum, 'Validation JSON is too large')
    value = json.loads(path.read_text(encoding='utf-8-sig'))
    require(isinstance(value, dict), 'Validation JSON must be an object')
    return value


def validate_shelf_toggle_evidence(report, revision):
    require(report.get('sourceRevision') == revision and report.get('items') == 3000 and
            'error' not in report, 'Windows shelf-toggle acceptance belongs to another source or failed')
    checks = report.get('checks')
    require(isinstance(checks, list) and len(checks) >= 6 and
            all(isinstance(value, str) and value.strip() for value in checks) and
            len(set(checks)) == len(checks), 'Windows shelf-toggle acceptance needs every native performance check')
    toggles = report.get('toggles')
    require(isinstance(toggles, dict) and type(toggles.get('iterations')) is int and toggles['iterations'] == 4 and
            type(toggles.get('projections')) is int and toggles['projections'] == 0 and
            type(toggles.get('boundsChanges')) is int and toggles['boundsChanges'] == 0 and
            all(toggles.get(key) is True for key in ['visible', 'focused', 'hiddenEditDelivered']),
            'Windows shelf-toggle acceptance must retain current data, skip history/layout work and return focus')
    packets = toggles.get('packets')
    require(isinstance(packets, list) and len(packets) == 8 and all(
            isinstance(packet, dict) and packet.get('action') == ('show' if index % 2 else 'hide') and
            packet.get('surfaceOnly') is True and packet.get('hasItems') is False and
            packet.get('visible') is bool(index % 2) for index, packet in enumerate(packets)),
            'Windows shelf-toggle acceptance must exercise four actual lightweight close/reopen cycles')
    navigation = report.get('navigation')
    require(isinstance(navigation, dict) and navigation.get('iterations') == 50 and
            type(navigation.get('removedCards')) is int and 0 <= navigation['removedCards'] <= 50 and
            navigation.get('addedCards') == navigation['removedCards'],
            'Windows shelf-toggle acceptance must preserve bounded native keyboard rendering')
    require(report.get('sameClockImageEdit') == {
                'timestampUnchanged': True, 'originalURLUnchanged': True, 'versionedURLChanged': True} and
            report.get('thumbnailEnrichment') == {
                'sameCanonicalURL': True, 'versionedURLChanged': True, 'sameTitleAndTimestamp': True,
                'mediaRevisionChanged': True, 'recopySameRecord': True},
            'Windows shelf-toggle acceptance must keep edited images and refreshed thumbnails current')


def validate_shelf_motion_evidence(report):
    """New release gates require executed compositor observations in all modes."""
    motion = report.get('motion')
    require(isinstance(motion, dict) and len(report.get('checks', [])) >= 8,
            'Windows native shelf slide evidence is missing')
    for phase, duration in [('opening', 420), ('closing', 220)]:
        value = motion.get(phase)
        require(isinstance(value, dict) and type(value.get('duration')) is int and value['duration'] == duration,
                'Windows native shelf slide duration is missing or differs')
        samples = value.get('samples')
        require(isinstance(samples, list) and len(samples) >= 2 and all(
            isinstance(sample, dict) and all(type(sample.get(key)) in {int, float} and math.isfinite(sample[key])
                for key in ['at', 'y', 'height']) and sample['height'] > 0 and
            sample.get('pointer') == 'none' for sample in samples),
                'Windows native shelf slide needs actual finite presentation samples with pointer suppression')
        travel = samples[-1]['y'] - samples[0]['y']
        require(samples[-1]['at'] > samples[0]['at'] and
                (travel if phase == 'opening' else -travel) > samples[0]['height'] * 0.2,
                'Windows native shelf slide movement or direction was not observed')
    required = {
        'opening': ['finished', 'pointerEnabled', 'visible', 'focused'],
        'closing': ['hiddenOnlyAfterEnd'],
        'rapidReopen': ['visible', 'focused', 'selectedFirstImage'],
        'rapidClose': ['hidden', 'burstHidden'],
        'reducedMotion': ['shown', 'hidden'],
    }
    require(all(isinstance(motion.get(group), dict) and all(motion[group].get(key) is True for key in keys)
                for group, keys in required.items()) and motion.get('allNodesConnected') is True,
            'Windows native shelf slide endpoints, reversals, focus or retained nodes failed')
    require(all(type(motion.get(key)) is int and motion[key] == 0 for key in ['boundsChanges', 'projections']) and
            all(type(motion['rapidReopen'].get(key)) is int and motion['rapidReopen'][key] == 0
                for key in ['staleHides', 'staleRestores']) and
            type(motion['reducedMotion'].get('animationCount')) is int and motion['reducedMotion']['animationCount'] == 0,
            'Windows native shelf slide must retain layout, cancel stale completions and respect Reduce Motion')


def validate_artifacts(directory, revision):
    paths = {'dist/' + INSTALLER: safe_file(directory, 'dist/' + INSTALLER),
             'validation/windows-package.json': safe_file(directory, 'validation/windows-package.json')}
    installer = paths['dist/' + INSTALLER]
    size = installer.stat().st_size
    require(1000 <= size <= MAXIMUM, 'Installer size is outside the Windows updater limit')
    with installer.open('rb') as stream:
        require(stream.read(2) == b'MZ', 'Installer is not a Windows PE executable')
    package = read_json(paths['validation/windows-package.json'])
    fixed = {'platform': 'win32', 'architecture': 'x64', 'version': VERSION, 'build': BUILD,
             'installer': INSTALLER, 'size': size, 'sourceRevision': revision}
    require(all(package.get(key) == value and type(package.get(key)) is type(value) for key, value in fixed.items()),
            'Windows package validation belongs to another platform, source or release')
    require(package.get('sha256') == legacy.digest(installer), 'Installer differs from its CI SHA256')
    require(package.get('authenticodeStatus') in {'NotSigned', 'Valid'}, 'Unexpected Windows Authenticode validation state')
    for mode in ['source', 'packaged', 'installed']:
        name = f'validation/{mode}/windows-runtime.json'
        paths[name] = safe_file(directory, name)
        report = read_json(paths[name])
        require(report.get('passed') is True and report.get('platform') == 'win32' and report.get('arch') == 'x64' and
                report.get('sourceRevision') == revision and report.get('packaged') is (mode != 'source'),
                'Windows native acceptance failed or belongs to another source/platform')
        require(report.get('rendererErrors') == [],
                'Windows native acceptance must explicitly report no renderer errors')
        checks = report.get('checks')
        require(isinstance(checks, list) and len(checks) >= 20 and
                all(isinstance(check, dict) and check.get('passed') is True and
                    isinstance(check.get('name'), str) and bool(check['name'].strip()) for check in checks) and
                len({check['name'] for check in checks}) == len(checks),
                'Each Windows native acceptance report needs at least 20 distinct passing checks')
        if BUILD >= 68:
            name = f'validation/{mode}/shelf-performance.json'
            paths[name] = safe_file(directory, name)
            toggle_report = read_json(paths[name])
            validate_shelf_toggle_evidence(toggle_report, revision)
            if BUILD >= 69: validate_shelf_motion_evidence(toggle_report)
    name = 'validation/upgrade/windows-upgrade.json'
    paths[name] = safe_file(directory, name)
    upgrade = read_json(paths[name])
    upgrade_identity = {'platform': 'win32', 'arch': 'x64', 'version': VERSION, 'build': BUILD,
                        'sourceRevision': revision, 'previousVersion': PREVIOUS_VERSION,
                        'previousBuild': PREVIOUS_BUILD}
    require(upgrade.get('passed') is True and all(
                upgrade.get(key) == value and type(upgrade.get(key)) is type(value)
                for key, value in upgrade_identity.items()),
            'Windows upgrade acceptance failed or belongs to another platform, source or release')
    require(all(upgrade.get(flag) is False for flag in
                ['oldClientCodeModified', 'publicFeedChanged', 'productionKeyChanged']),
            'Windows upgrade acceptance must preserve the old client, public feed and production key')
    checks = upgrade.get('checks')
    require(isinstance(checks, list) and len(checks) >= 7 and
            all(isinstance(check, dict) and check.get('passed') is True and
                isinstance(check.get('name'), str) and bool(check['name'].strip()) for check in checks) and
            len({check['name'].strip().casefold() for check in checks}) == len(checks),
            'Windows upgrade acceptance needs at least seven distinct passing checks')
    fixture = upgrade.get('fixture')
    fixture_identity = {'actualClientVersion': VERSION, 'actualClientBuild': BUILD,
                        'simulatedInstalledVersion': PREVIOUS_VERSION, 'simulatedInstalledBuild': PREVIOUS_BUILD,
                        'testKeyInjectedOnlyIntoIsolatedMain': True}
    require(isinstance(fixture, dict) and all(
                fixture.get(key) == value and type(fixture.get(key)) is type(value)
                for key, value in fixture_identity.items()),
            'Windows upgrade fixture must use the exact corrected client and an isolated test key')
    require(fixture.get('installerSHA256') == package['sha256'] and
            type(fixture.get('installerBytes')) is int and fixture['installerBytes'] == size,
            'Windows upgrade fixture installer differs from the actual candidate installer')
    if BUILD >= 68:
        previous_installer = ({
                    'version': '1.7.4', 'build': 67, 'size': 545769370,
                    'sha256': 'd6b9b2b066f4172c55ccf75bf38118430ab22a761306ef40ba0890e4ea18223f',
                    'sourceRevision': 'ee7878362a8f740b36bb9a17114bc2aad3cfd0f3'} if BUILD == 68 else {
                    'version': '1.7.5', 'build': 68, 'size': 545769250,
                    'sha256': 'd37f86b5e355a58e3303899aa6917efb495a7f1d2a02732fd7e843cc1ef442e7',
                    'sourceRevision': '0d71154257aef8042a53ee6ff169079eddbb42bd'})
        require(upgrade.get('previousInstaller') == previous_installer,
                'Windows upgrade acceptance must prove the genuine published previous installer identity')
        native_quit, candidate = upgrade.get('nativeQuit'), upgrade.get('candidateProcess')
        require(isinstance(native_quit, dict) and isinstance(candidate, dict) and
                type(candidate.get('pid')) is int and candidate['pid'] > 0 and
                isinstance(candidate.get('executable'), str) and bool(candidate['executable']) and
                native_quit.get('pid') == candidate['pid'] and
                native_quit.get('executable') == candidate['executable'] and
                all(native_quit.get(key) is True for key in
                    ['naturalWillQuitObserved', 'inspectorReleasedAfterWillQuit', 'ownedProcessGone']),
                'Windows upgrade acceptance must prove natural will-quit and exact owned process exit after debugger release')
    return paths, package



def verify_graphql_completion(api, run_id, revision):
    # REST can retain an earlier queued state after a job finishes. This is a
    # second authenticated GitHub read, never an inference from local reports.
    # A missing/older suite fails closed rather than accepting another run.
    query = """query WindowsReleaseChecks($owner:String!,$name:String!,$revision:String!){
      repository(owner:$owner,name:$name){nameWithOwner isPrivate
        object(expression:$revision){__typename ... on Commit{oid
          checkSuites(last:100){nodes{status conclusion app{slug} workflowRun{databaseId url}}}
        }}
      }
    }"""
    owner, name = PUBLIC_REPOSITORY.split('/')
    response = api.request('POST', '/graphql', {'query': query, 'variables': {
        'owner': owner, 'name': name, 'revision': revision}})
    require(isinstance(response, dict) and not response.get('errors'),
            'GitHub GraphQL workflow completion could not be verified')
    repository = response.get('data', {}).get('repository') if isinstance(response.get('data'), dict) else None
    require(isinstance(repository, dict) and isinstance(repository.get('nameWithOwner'), str) and
            repository['nameWithOwner'].lower() == PUBLIC_REPOSITORY and repository.get('isPrivate') is False,
            'GraphQL workflow must belong to the exact public repository')
    commit = repository.get('object')
    require(isinstance(commit, dict) and commit.get('__typename') == 'Commit' and commit.get('oid') == revision,
            'GraphQL workflow must belong to the exact public source commit')
    suites = commit.get('checkSuites')
    nodes = suites.get('nodes') if isinstance(suites, dict) else None
    require(isinstance(nodes, list) and len(nodes) <= 100,
            'GitHub GraphQL check suites are missing or invalid')
    matching = [suite for suite in nodes if isinstance(suite, dict) and
                isinstance(suite.get('workflowRun'), dict) and
                type(suite['workflowRun'].get('databaseId')) is int and suite['workflowRun']['databaseId'] == run_id]
    require(len(matching) == 1, 'Require one exact GitHub Actions workflow completion for this run')
    suite = matching[0]
    require(suite.get('status') == 'COMPLETED' and suite.get('conclusion') == 'SUCCESS' and
            isinstance(suite.get('app'), dict) and suite['app'].get('slug') == 'github-actions' and
            suite['workflowRun'].get('url') == f'https://github.com/{PUBLIC_REPOSITORY}/actions/runs/{run_id}',
            'Require the exact successful GitHub Actions workflow completion')

def verify_ci(api, run_id, revision, paths):
    require(type(run_id) is int and run_id > 0, 'A positive Windows workflow run ID is required')
    base = '/repos/' + PUBLIC_REPOSITORY
    repository = api.request('GET', base)
    require(type(repository.get('id')) is int and repository['id'] == PUBLIC_REPOSITORY_ID and
            repository.get('full_name', '').lower() == PUBLIC_REPOSITORY and repository.get('private') is False,
            'Windows release target must be the exact public source repository')
    require(api.request('GET', base + '/commits/' + revision).get('sha') == revision,
            'Public source HEAD has not been pushed to the public source repository')
    run = api.request('GET', base + '/actions/runs/' + str(run_id))
    workflow_paths = {WORKFLOW}
    if isinstance(run.get('head_branch'), str) and run['head_branch']:
        workflow_paths.add(WORKFLOW + '@' + run['head_branch'])
    require(run.get('id') == run_id and run.get('head_sha') == revision and
            run.get('path') in workflow_paths and run.get('name') == 'Windows application' and
            run.get('event') in {'push', 'workflow_dispatch'} and
            run.get('repository', {}).get('full_name', '').lower() == PUBLIC_REPOSITORY and
            run.get('head_repository', {}).get('full_name', '').lower() == PUBLIC_REPOSITORY,
            'Require the exact Windows application workflow for public source HEAD')
    if run.get('status') == 'completed':
        require(run.get('conclusion') == 'success',
                'Require the exact successful Windows application workflow for public source HEAD')
    else:
        require(run.get('status') in {'queued', 'in_progress', 'waiting', 'requested', 'pending'},
                'GitHub REST workflow status is missing or invalid')
        verify_graphql_completion(api, run_id, revision)
    listing = api.request('GET', base + f'/actions/runs/{run_id}/artifacts?per_page=100')
    entries = listing.get('artifacts')
    require(isinstance(entries, list) and listing.get('total_count') == len(entries) and len(entries) <= 100,
            'Workflow artifact listing is incomplete')
    matching = [entry for entry in entries if entry.get('name') == 'clipboardline-windows-' + revision]
    require(len(matching) == 1, 'Require one exact Windows workflow artifact')
    artifact = matching[0]
    require(type(artifact.get('id')) is int and artifact['id'] > 0 and artifact.get('expired') is False and
            type(artifact.get('size_in_bytes')) is int and 0 < artifact['size_in_bytes'] <= MAXIMUM and
            re.fullmatch(r'sha256:[0-9a-f]{64}', artifact.get('digest', '')),
            'Windows artifact is expired, too large or has no GitHub SHA256 digest')
    raw = api.request('GET', base + f'/actions/artifacts/{artifact["id"]}/zip', binary=True)
    require(isinstance(raw, bytes) and len(raw) <= MAXIMUM and
            'sha256:' + hashlib.sha256(raw).hexdigest() == artifact['digest'], 'GitHub artifact archive digest differs')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)) and all(not name.startswith('/') and '..' not in Path(name).parts and '\\' not in name
                                                    for name in names) and
                all(not stat.S_ISLNK(info.external_attr >> 16) and not (info.flag_bits & 1) for info in archive.infolist()),
                'Unsafe workflow artifact ZIP')
        for name, path in paths.items():
            require(name in names and archive.getinfo(name).file_size == path.stat().st_size,
                    'Local artifact set differs from the selected successful workflow')
            digest = hashlib.sha256()
            with archive.open(name) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(block)
            require(digest.hexdigest() == legacy.digest(path), 'Local artifact differs from the successful workflow archive')
    return artifact['id']


def licenses(source):
    names = ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'windows/THIRD_PARTY_NOTICES.md']
    names += [path.relative_to(source).as_posix() for path in sorted((source / 'windows/assets/licenses').glob('*.txt'))]
    require(len(names) >= 6, 'Complete Windows component licenses are missing')
    blocks = [b'ClipBoardLine Windows source and component licensing\n']
    for name in names:
        file = safe_file(source, name)
        require(file.stat().st_size <= 2 * 1024 * 1024, 'A license file is unexpectedly large')
        blocks += [b'\n\n----- ' + name.encode() + b' -----\n', file.read_bytes()]
    return b''.join(blocks)


def prepare(artifact_dir, run_id, source_dir=SOURCE_DIR, *, api=None, releases_dir=None):
    source, revision = source_revision(source_dir)
    settings = legacy.config()
    require(settings.get('repository') == PRIVATE_REPOSITORY, 'Existing private signing configuration changed')
    updater = (source / 'windows/lib/updates.cjs').read_text()
    pin = re.search(r"const PUBLIC_KEY = '([^']+)';", updater)
    require(pin is not None and pin[1] == settings['publicKey'], 'Windows updater must pin the existing release public key')
    paths, package = validate_artifacts(artifact_dir, revision)
    api = api or legacy.GitHub(PUBLIC_REPOSITORY)
    artifact_id = verify_ci(api, run_id, revision, paths)
    # Earlier immutable profiles retain their original evidence format. Every
    # new build must pass both native adapters at this exact public revision.
    parity_receipt = parity.verify(api, source, revision, windows_run_id=run_id) if BUILD >= 65 else None
    installer = paths['dist/' + INSTALLER]
    payload = {'schemaVersion': 1, 'repository': PUBLIC_REPOSITORY, 'platform': 'win32', 'arch': 'x64',
               'version': VERSION, 'build': BUILD, 'sourceRevision': revision,
               'url': f'https://github.com/{PUBLIC_REPOSITORY}/releases/download/{TAG}/{INSTALLER}',
               'sha256': package['sha256'], 'size': package['size']}
    release_root = Path(releases_dir) if releases_dir is not None else ROOT / 'releases'
    require(not release_root.is_symlink(), 'Release output must not be a symlink')
    release_root.mkdir(parents=True, exist_ok=True)
    directory = release_root / TAG
    names = [INSTALLER, MANIFEST, 'SHA256SUMS', 'LICENSES.txt']
    licensing = licenses(source)
    if not directory.exists():
        with tempfile.TemporaryDirectory(prefix='windows-package-', dir=release_root) as temporary:
            candidate = Path(temporary)
            shutil.copyfile(installer, candidate / INSTALLER)
            raw = candidate / 'payload.json'
            raw.write_text(json.dumps(payload, sort_keys=True, separators=(',', ':')) + '\n')
            legacy.run([str(legacy.helper()), 'sign', str(raw), str(legacy.KEY), str(candidate / MANIFEST)])
            require(legacy.decode_envelope(candidate / MANIFEST, settings['publicKey']) == payload, 'Windows manifest signature verification failed')
            raw.unlink()
            (candidate / 'LICENSES.txt').write_bytes(licensing)
            (candidate / 'SHA256SUMS').write_text(''.join(f'{legacy.digest(candidate / name)}  {name}\n' for name in names if name != 'SHA256SUMS'))
            os.rename(candidate, directory)
    require(directory.is_dir() and not directory.is_symlink() and {path.name for path in directory.iterdir()} == set(names),
            'Prepared release is incomplete or has unexpected files; immutable packages are never repaired silently')
    assets = [safe_file(directory, name) for name in names]
    require(legacy.decode_envelope(directory / MANIFEST, settings['publicKey']) == payload,
            'Prepared Windows manifest belongs to another source or release')
    require((directory / INSTALLER).stat().st_size == payload['size'] and legacy.digest(directory / INSTALLER) == payload['sha256'] and
            (directory / 'LICENSES.txt').read_bytes() == licensing and
            (directory / 'SHA256SUMS').read_text() == ''.join(f'{legacy.digest(directory / name)}  {name}\n' for name in names if name != 'SHA256SUMS'),
            'Prepared Windows release differs; immutable assets are never overwritten')
    return {'settings': settings, 'payload': payload, 'assets': assets, 'runId': run_id, 'artifactId': artifact_id,
            'artifactDir': str(Path(artifact_dir).resolve()), 'sourceDir': str(source), 'releaseRoot': str(release_root),
            'parity': parity_receipt}


def publish(prepared, *, api=None, stage=False, counterpart_tag=None):
    require(type(stage) is bool, 'Staging must be an explicit boolean')
    api = api or legacy.GitHub(PUBLIC_REPOSITORY)
    # Revalidate source, successful CI artifact and the signed local package
    # immediately before the first external mutation.
    fresh = prepare(prepared['artifactDir'], prepared['runId'], prepared['sourceDir'], api=api, releases_dir=prepared['releaseRoot'])
    require(fresh['payload'] == prepared['payload'] and fresh['assets'] == prepared['assets'], 'Prepared release changed before publication')
    payload, own_assets = fresh['payload'], fresh['assets']
    # Keep the immutable four-file platform package intact. Compose a separate
    # immutable publication snapshot carrying the other signed update channel.
    unified_directory = Path(fresh['releaseRoot']) / (TAG + ('-staged-unified' if stage else '-unified'))
    policy = {'counterpart_tag': counterpart_tag, 'allow_version_mismatch': stage}
    assets = unified.compose('windows', own_assets, api, unified_directory, **policy)
    require(len(assets) == 7 and len({path.name for path in assets}) == 7,
            'Unified release requires exactly seven verified cross-platform assets')
    counterpart_receipt = parity.verify_counterpart(fresh['sourceDir'], assets, 'windows') if BUILD >= 65 and not stage else None
    base = '/repos/' + PUBLIC_REPOSITORY
    reference = api.request('GET', base + '/git/ref/tags/' + TAG, allow_missing=True)
    if reference:
        obj = reference['object']
        for _ in range(8):
            if obj.get('type') != 'tag':
                break
            obj = api.request('GET', base + '/git/tags/' + obj['sha'])['object']
        require(obj.get('type') == 'commit' and obj.get('sha') == payload['sourceRevision'], 'Windows tag targets another source revision')
    release = legacy.find_release(api, base, TAG)
    if release is None:
        release = api.request('POST', base + '/releases', {
            'tag_name': TAG, 'target_commitish': payload['sourceRevision'],
            'name': (f'ClipBoardLine {VERSION} for Windows (build {BUILD})' if stage else f'ClipBoardLine {VERSION} — macOS & Windows'),
            'body': current_release_notes() or ('Windows shelf behavior now matches macOS: only the first image is selected on fresh opening; Up/Down moves between visible, nonempty shelves even with preview closed. Left/Right stays within the row.\n\n'
                    'Native Windows source, packaged and installed acceptance, text/image paste, global shortcuts and build64 → build65 upgrade checks passed. Both platforms passed the same 47 shared behavior observations for this exact source revision.\n\n'
                    'Türkçe: Açılışta yalnızca ilk görsel seçilir. Önizleme kapalıyken de yukarı/aşağı oklarla askılar arasında; sağ/sol oklarla öğeler arasında gezilir. Gizli ve boş askılar atlanır. Yeniden açılış eski seçim ve aramayı sıfırlar.\n\n'
                    'The shared product version remains 1.7.2. This release carries Windows build65 and the verified unchanged macOS build69, both signed update feeds and both packages. Update from Settings → Updates; no GitHub account or token is needed.\n\n'
                    'The Windows update manifest uses the pinned Ed25519 identity. No Windows Authenticode certificate is configured; SmartScreen may warn.'
                    if BUILD >= 65 else
                    'Windows x64 per-user installer, validated on the actual Windows runner before publication.\n\n'
                    '- Mac-style transparent shelves, centered shared search, unified preview tools and a normal Library window.\n'
                    '- Correct visible-page keyboard navigation, Library copy behavior and Settings shortcut isolation.\n'
                    '- Hardened text/image paste target restoration, modifier release and repeated-request handling.\n'
                    '- Configurable hourly update checks, discovery notifications, verified downloads and explicit install/reopen.\n\n'
                    'Türkçe: Askı, arama, önizleme ve Library arayüzleri macOS düzenine yaklaştırıldı; kısayollar, metin/görsel yapıştırma ve güncelleme davranışları düzeltildi.\n\n'
                    'When upgrading from 1.7.0, open ClipBoardLine once if the old updater does not reopen it. The corrected updater in this version reopens after installation. Library data and settings are preserved.\n\n'
                    'The update manifest is signed with the pinned Ed25519 release identity. This build has no configured Windows Authenticode certificate; SmartScreen may warn.\n\n'
                    'macOS and Windows downloads, both signed update feeds and the public source share this repository. No GitHub account or token is needed.'),
            'draft': True, 'prerelease': False})
    require(isinstance(release, dict) and type(release.get('id')) is int and release['id'] > 0 and release.get('tag_name') == TAG,
            'GitHub returned another Windows release identity')
    if reference is None:
        require(release.get('draft') is True, 'Published Windows release has no verifiable tag')
        target = release.get('target_commitish')
        require(isinstance(target, str) and target, 'Windows draft has no verifiable source target')
        if target != payload['sourceRevision']:
            require(api.request('GET', base + '/commits/' + urllib.parse.quote(target, safe='')).get('sha') == payload['sourceRevision'],
                    'Windows draft targets another source revision')
    existing = {asset['name']: asset for asset in release.get('assets', [])}
    require(len(existing) == len(release.get('assets', [])) and set(existing) <= {asset.name for asset in assets},
            'Windows release has unexpected or duplicate assets')
    for asset in assets:
        if asset.name in existing:
            require(api.asset_matches(existing[asset.name], asset), 'Existing Windows release asset differs; refusing to overwrite it')
        else:
            require(release.get('draft') is True, 'Published Windows release is incomplete; refusing to mutate it')
            uploaded = api.upload(release['id'], asset)
            require(api.asset_matches(uploaded, asset), 'Uploaded Windows asset differs')
    if release.get('draft') is True:
        unified.revalidate(unified_directory, api, **policy)
        if BUILD >= 65 and not stage:
            require(parity.verify_counterpart(fresh['sourceDir'], assets, 'windows') == counterpart_receipt,
                    'Carried production source changed before Latest promotion')
        verified_release = api.request('GET', base + '/releases/' + str(release['id']))
        require(verified_release.get('id') == release['id'] and verified_release.get('draft') is True and
                verified_release.get('tag_name') == TAG, 'Windows draft changed before final publication')
        remote_assets = verified_release.get('assets', [])
        require(len(remote_assets) == len(assets) and {asset.get('name') for asset in remote_assets} == {path.name for path in assets} and
                all(api.asset_matches(next(asset for asset in remote_assets if asset.get('name') == path.name), path) for path in assets),
                'Both signed feeds and all seven assets must be uploaded before making this release latest')
        release = api.request('PATCH', base + '/releases/' + str(release['id']),
                              {'draft': False, 'prerelease': False, 'target_commitish': payload['sourceRevision'],
                               'make_latest': 'false' if stage else 'true'})
    return {'url': release['html_url'], 'tag': TAG, 'releaseId': release['id'], 'draft': release['draft'],
            'staged': stage, 'counterpartSource': counterpart_receipt,
            'publicAssets': {path.name: {'sha256': legacy.digest(path), 'size': path.stat().st_size} for path in assets}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact-dir', type=Path, required=True, help='Extracted exact GitHub workflow artifact (dist/ and validation/)')
    parser.add_argument('--run-id', type=int, required=True)
    parser.add_argument('--source-dir', type=Path, default=SOURCE_DIR)
    parser.add_argument('--version', choices=tuple(RELEASE_PROFILES),
                        help='Reviewed fixed release profile (default: shared release-version.json)')
    parser.add_argument('--build', type=int, help='Reviewed build profile (default: latest reviewed build for this version)')
    parser.add_argument('--publish', action='store_true', help='Upload verified immutable assets and publish the exact public-source release')
    parser.add_argument('--stage', action='store_true', help='Publish without making Latest; first half of a shared version')
    parser.add_argument('--counterpart-tag', help='Exact published counterpart release for completing a staged shared version')
    args = parser.parse_args()
    require(args.publish or not (args.stage or args.counterpart_tag), 'Staging/counterpart selection requires --publish')
    if args.version is None:
        args.version = json.loads((ROOT / 'release-version.json').read_text())['version']
    configure_release(args.version, args.build)
    # Every publisher shares one nonblocking owner-only host lock. Keep the
    # complete preparation, peer snapshot, upload and latest promotion within
    # it; dry preparation performs no remote mutations and needs no lock.
    with unified.publishing_lock() if args.publish else nullcontext():
        execute(args)


def execute(args):
    checker = ROOT / 'scripts/check-release-version.py'
    legacy.run([sys.executable, str(checker), '--expected-version', VERSION])
    legacy.run([sys.executable, str(checker), '--root', str(args.source_dir), '--require-windows',
                '--expected-version', VERSION])
    prepared = prepare(args.artifact_dir, args.run_id, args.source_dir)
    receipt = {'preparedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'repository': PUBLIC_REPOSITORY,
               'manifest': prepared['payload'], 'workflowRunId': args.run_id, 'artifactId': prepared['artifactId'],
               'assets': [str(path) for path in prepared['assets']], 'parity': prepared['parity'], 'published': False}
    if args.publish:
        receipt.update(publish(prepared, stage=args.stage, counterpart_tag=args.counterpart_tag), published=True)
    folder = ROOT / 'local/validation'
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f'windows-release-{VERSION}-build{BUILD}.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile, subprocess.SubprocessError, ReleaseError, unified.ReleaseError, parity.ReleaseError) as error:
        print(f'Windows release stopped: {error}', file=sys.stderr)
        sys.exit(1)
