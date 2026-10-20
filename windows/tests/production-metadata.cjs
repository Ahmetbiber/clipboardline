'use strict';
// Read-only control-plane metadata. Neither installed application receives this
// credential; its signed feed and installer requests remain anonymous.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const ENDPOINT = 'repos/orkunisitmak/clipboardline-desktop/releases/latest';
const credentialKey = key => /TOKEN|SECRET|PASSWORD|AUTHORIZATION/i.test(key);
function clientEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => !credentialKey(key) && !['GH_DEBUG', 'GH_HOST'].includes(key.toUpperCase())));
}
function responseMetadata(raw) {
  const split = raw.search(/\r?\n\r?\n/);
  const headers = split < 0 ? raw : raw.slice(0, split);
  const status = /^HTTP\/[\d.]+\s+(\d{3})(?:\s|$)/i.exec(headers);
  const values = {};
  for (const line of headers.split(/\r?\n/).slice(1)) {
    const colon = line.indexOf(':');
    if (colon > 0) values[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
  }
  const number = key => /^\d{1,16}$/.test(values[key] || '') ? Number(values[key]) : null;
  return {
    phase: 'control-plane-latest-metadata',
    endpoint: 'https://api.github.com/' + ENDPOINT,
    authenticated: true,
    status: status ? Number(status[1]) : null,
    contentLength: number('content-length'),
    rateRemaining: number('x-ratelimit-remaining'),
    rateReset: number('x-ratelimit-reset'),
    body: split < 0 ? '' : raw.slice(split).replace(/^\r?\n\r?\n/, '')
  };
}
function readReleaseMetadata({ token, environment = process.env, execute = execFileSync, observe = () => {} }) {
  assert.match(token || '', /^[A-Za-z0-9_]{20,1000}$/, 'A read-only workflow metadata credential is required.');
  const env = { ...clientEnvironment(environment), GH_TOKEN: token };
  const args = ['api', '--hostname', 'github.com', ENDPOINT, '--include', '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28'];
  let raw, failed = false;
  try { raw = execute('gh', args, { env, encoding: 'utf8', timeout: 60000, maxBuffer: 600000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { raw = String(error.stdout || ''); failed = true; }
  const metadata = responseMetadata(raw);
  const { body, ...trace } = metadata;
  observe(trace);
  if (failed || metadata.status !== 200) throw new Error('Control-plane release metadata request failed (HTTP ' + (metadata.status ?? 'unavailable') + ').');
  if (Buffer.byteLength(body, 'utf8') > 500000) throw new Error('Control-plane release metadata exceeds its existing size bound.');
  return JSON.parse(body);
}
module.exports = { ENDPOINT, credentialKey, clientEnvironment, readReleaseMetadata };
