'use strict';
// Run the actual external observer against owned native children with known
// success AND failure exit codes. A missing exit code must never become zero.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { windowsEnvironment } = require('../lib/windows-environment.cjs');
if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Run the observer self-test only on a disposable Windows GitHub runner.');
}
const output = path.resolve(process.env.CLIPBOARDLINE_VALIDATION || 'validation/observer-selftest');
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'clipboardline-observer-selftest-'));
const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
const targetPath = path.join(process.env.SystemRoot, 'System32/cmd.exe');
const report = { scope: 'actual observer of owned native exit 0 and 37', cases: [], startedAt: new Date().toISOString() };
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until(reader, predicate, timeout, label) {
  const deadline = performance.now() + timeout;
  let last;
  while (performance.now() < deadline) {
    try { last = reader(); } catch (error) { if (!['ENOENT', 'EBUSY', 'EPERM'].includes(error.code) && !(error instanceof SyntaxError)) throw error; }
    if (last && predicate(last)) return last;
    await delay(50);
  }
  throw new Error('Timed out waiting for ' + label + ': ' + JSON.stringify(last));
}
async function exercise(exitCode) {
  const receipt = path.join(temporary, 'observer-' + exitCode + '.json');
  const config = path.join(temporary, 'config-' + exitCode + '.json');
  fs.writeFileSync(config, JSON.stringify({ sourceProcessId: process.pid, installer: targetPath, output: receipt, awaitInstallerMilliseconds: 5000 }));
  const observer = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('tests/upgrade-observer.ps1'), '-Config', config], { env: windowsEnvironment(), windowsHide: true, stdio: 'ignore' });
  let observerExit, observerError, target, targetExit, targetError;
  observer.once('exit', code => { observerExit = code; });
  observer.once('error', error => { observerError = error; });
  const read = () => { if (observerError) throw observerError; return JSON.parse(fs.readFileSync(receipt, 'utf8')); };
  try {
    const ready = await until(read, state => ['waiting', 'failed'].includes(state.status), 10000, 'observer readiness');
    assert.equal(ready.status, 'waiting', JSON.stringify(ready));
    // Fixed, synthetic command only; no input, clipboard or user data enters it.
    target = spawn(targetPath, ['/d', '/q', '/s', '/c', 'ping -n 3 127.0.0.1 >nul & exit /b ' + exitCode], { env: windowsEnvironment(), windowsHide: true, stdio: 'ignore' });
    target.once('exit', code => { targetExit = code; });
    target.once('error', error => { targetError = error; });
    const state = await until(read, state => ['exited', 'failed', 'still-running'].includes(state.status), 15000, 'native exit-code receipt');
    await until(() => ({ observerExit, targetExit, observerError, targetError }), value => value.observerError || value.targetError || (value.observerExit !== undefined && value.targetExit !== undefined), 5000, 'owned process completion');
    if (observerError) throw observerError;
    if (targetError) throw targetError;
    assert.equal(targetExit, exitCode, 'The synthetic child must actually return the known native exit code.');
    assert.equal(observerExit, 0, 'The observer script itself must exit successfully.');
    assert.equal(state.status, 'exited', JSON.stringify(state));
    assert.equal(state.sourceProcessId, process.pid);
    assert.equal(state.processId, target.pid, 'Only the exact owned native child may satisfy the observer.');
    assert.equal(state.executablePath.toLowerCase(), targetPath.toLowerCase());
    assert.equal(state.handleRetained, true);
    assert.equal(state.hasExited, true);
    assert.equal(typeof state.exitCode, 'number', 'An absent/null exit code must never be coerced to zero.');
    assert.equal(state.exitCode, exitCode, 'Both success and nonzero failure codes must be preserved.');
    report.cases.push({ expectedNativeExitCode: exitCode, actualNativeExitCode: targetExit, observerExitCode: state.exitCode, targetProcessId: state.processId, exactParent: true, exactPath: true, handleRetained: true, passed: true });
    console.log('PASS actual retained-handle observer preserves native exit ' + exitCode);
  } finally {
    if (target && target.exitCode === null && !target.killed) target.kill();
    if (observer.exitCode === null && !observer.killed) observer.kill();
  }
}
async function main() { await exercise(0); await exercise(37); report.passed = true; }
main().catch(error => { report.passed = false; report.error = String(error.stack || error.message).slice(0, 5000); console.error(report.error); process.exitCode = 1; }).finally(() => {
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'observer-selftest.json'), JSON.stringify(report, null, 2) + '\n');
  fs.rmSync(temporary, { recursive: true, force: true });
});
