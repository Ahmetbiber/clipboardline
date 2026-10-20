'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ENDPOINT, clientEnvironment, readReleaseMetadata } = require('./production-metadata.cjs');
const token = 'SYNTHETIC_WORKFLOW_METADATA_TOKEN';
test('only the fixed GitHub metadata command receives the workflow credential', () => {
  const traces = [];
  const result = readReleaseMetadata({ token, environment: { PATH: 'owned-path', GH_HOST: 'example.invalid', GH_DEBUG: 'api', SECRET_KEY: 'synthetic', CLIPBOARDLINE_METADATA_TOKEN: token }, observe: value => traces.push(value), execute: (file, args, options) => {
    assert.equal(file, 'gh');
    assert.deepEqual(args, ['api', '--hostname', 'github.com', ENDPOINT, '--include', '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28']);
    assert.deepEqual(options.env, { PATH: 'owned-path', GH_TOKEN: token });
    assert.equal(options.timeout, 60000);
    return 'HTTP/2.0 200 OK\r\nContent-Length: 8\r\nX-Ratelimit-Remaining: 4999\r\n\r\n{"id":1}';
  } });
  assert.equal(result.id, 1);
  assert.equal(traces[0].status, 200);
  assert.equal(traces[0].rateRemaining, 4999);
  assert.equal(JSON.stringify(traces).includes(token), false);
});
test('actual metadata HTTP failures retain status/rate evidence and never retry or become success', () => {
  let calls = 0; const traces = [];
  assert.throws(() => readReleaseMetadata({ token, observe: value => traces.push(value), execute: () => { calls++; const error = new Error('synthetic failure'); error.stdout = 'HTTP/2.0 403 Forbidden\nX-Ratelimit-Remaining: 0\nX-Ratelimit-Reset: 1792530000\n\n{"message":"synthetic"}'; throw error; } }), /HTTP 403/);
  assert.equal(calls, 1); assert.equal(traces[0].status, 403); assert.equal(traces[0].rateRemaining, 0); assert.equal(traces[0].rateReset, 1792530000);
});
test('redirects, oversized metadata and absent credentials fail without a transport fallback', () => {
  assert.throws(() => readReleaseMetadata({ token, execute: () => 'HTTP/2.0 302 Found\nLocation: https://example.invalid\n\n' }), /HTTP 302/);
  assert.throws(() => readReleaseMetadata({ token, execute: () => 'HTTP/2.0 200 OK\n\n' + 'x'.repeat(500001) }), /size bound/);
  let calls = 0;
  assert.throws(() => readReleaseMetadata({ token: '', execute: () => { calls++; } }), /credential/); assert.equal(calls, 0);
});
test('installed clients and native children receive no credential, host override or debug environment', () => {
  const original = { Path: 'owned-path', SystemRoot: 'C:\\Windows', HOME: 'owned-home', CLIPBOARDLINE_METADATA_TOKEN: token, GITHUB_TOKEN: 'synthetic', GH_TOKEN: 'synthetic', ACTIONS_RUNTIME_TOKEN: 'synthetic', SOME_SECRET: 'synthetic', password: 'synthetic', AUTHORIZATION: 'synthetic', GH_HOST: 'example.invalid', GH_DEBUG: 'api' };
  assert.deepEqual(clientEnvironment(original), { Path: 'owned-path', SystemRoot: 'C:\\Windows', HOME: 'owned-home' });
  assert.equal(original.CLIPBOARDLINE_METADATA_TOKEN, token, 'The parent test credential is only passed explicitly to its metadata command.');
});

test('opaque punctuated credentials preserve real-header parsing and end-to-end child isolation', () => {
  const opaque = 'SYNTHETIC.opaque-token+with/slash=padding_~suffix';
  const parent = { PATH: 'owned-path', CLIPBOARDLINE_METADATA_TOKEN: opaque, GITHUB_TOKEN: 'synthetic-other', GH_DEBUG: 'api' };
  const clean = clientEnvironment(parent); const traces = [];
  const value = readReleaseMetadata({ token: opaque, environment: clean, observe: trace => traces.push(trace), execute: (file, args, options) => {
    assert.equal(file, 'gh'); assert.equal(args[3], ENDPOINT);
    assert.deepEqual(options.env, { PATH: 'owned-path', GH_TOKEN: opaque });
    assert.deepEqual(clientEnvironment(options.env), clean);
    return 'HTTP/2.0 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nX-GitHub-Request-Id: SYNTHETIC\r\nX-Ratelimit-Remaining: 4999\r\nX-Ratelimit-Reset: 1792530000\r\n\r\n{"id":418838938}';
  } });
  assert.equal(value.id, 418838938); assert.equal(traces[0].status, 200); assert.equal(traces[0].authenticated, true);
  assert.equal(traces[0].rateReset, 1792530000); assert.equal(JSON.stringify(traces).includes(opaque), false);
  for (const invalid of ['', ' ', 'synthetic\nvalue', 'x'.repeat(16385)]) {
    let calls = 0;
    assert.throws(() => readReleaseMetadata({ token: invalid, execute: () => { calls++; throw new Error('Unexpected transport invocation.'); } }), /credential/);
    assert.equal(calls, 0, 'Invalid input must be rejected before invoking the authenticated transport.');
  }
});
