'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {boundedFetch} = require('./network.cjs');
const FEED = 'https://github.com/orkunisitmak/clipboardline-desktop/releases/latest/download/windows-update.json';
const PUBLIC_KEY = 's9DO901wav4VK/hfnLROxJYk4+oNFYvxdOK974E3PgI=';
const REPOSITORY = 'orkunisitmak/clipboardline-desktop';
function verifyEnvelope(bytes, publicKey = PUBLIC_KEY) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 200000) throw new Error('Update manifest is too large');
  const envelope = JSON.parse(bytes.toString('utf8'));
  if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(envelope.payload) || !/^[A-Za-z0-9+/]*={0,2}$/.test(envelope.signature)) throw new Error('Invalid signed update encoding');
  const payload = Buffer.from(envelope.payload, 'base64'); const signature = Buffer.from(envelope.signature, 'base64');
  const key = crypto.createPublicKey({key: Buffer.concat([Buffer.from('302a300506032b6570032100','hex'), Buffer.from(publicKey,'base64')]), format:'der',type:'spki'});
  if (signature.length !== 64 || !crypto.verify(null, payload, key, signature)) throw new Error('Update signature was rejected');
  const manifest = JSON.parse(payload.toString('utf8'));
  if (manifest.schemaVersion !== 1 || manifest.repository !== REPOSITORY || manifest.platform !== 'win32' || manifest.arch !== 'x64' ||
      !Number.isInteger(manifest.build) || manifest.build < 1 || typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version) ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isInteger(manifest.size) || manifest.size < 1000 || manifest.size > 1024 ** 3 ||
      typeof manifest.url !== 'string' || !/^https:\/\/github\.com\/orkunisitmak\/clipboardline-desktop\/releases\/download\/[a-zA-Z0-9._-]+\/ClipBoardLine-Setup-[a-zA-Z0-9._-]+\.exe$/.test(manifest.url)) throw new Error('Invalid Windows update metadata');
  return manifest;
}
class Updates {
  constructor(directory, {build = 62, fetcher = boundedFetch, publicKey = PUBLIC_KEY, changed = () => {}} = {}) {
    this.directory = directory; this.build = build; this.fetcher = fetcher; this.publicKey = publicKey; this.changed = changed;
    this.state = {status:'idle', message:'Updates use a public, cryptographically signed Windows channel.'}; this.manifest = null; this.installer = null;
  }
  set(state) { this.state = {...this.state, ...state}; this.changed(); }
  async check() {
    if (this.state.status === 'checking' || this.state.status === 'downloading') return;
    this.set({status:'checking',message:'Checking for updates…'});
    try {
      const response = await this.fetcher(FEED,{maximum:200000});
      const manifest = verifyEnvelope(response.bytes, this.publicKey);
      this.manifest = manifest.build > this.build ? manifest : null;
      this.set({status:this.manifest ? 'available':'current', version:manifest.version, message:this.manifest ? `ClipBoardLine ${manifest.version} is available.`:'You are up to date.',checkedAt:Date.now()});
    } catch (error) { this.manifest = null; this.set({status:'error', message:'Update check failed: ' + error.message}); }
  }
  async download() {
    if (!this.manifest) throw new Error('Check for a signed update first');
    const manifest = {...this.manifest}; this.set({status:'downloading',message:'Downloading verified update…'});
    try {
      const response = await this.fetcher(manifest.url,{maximum:manifest.size});
      if (response.bytes.length !== manifest.size || crypto.createHash('sha256').update(response.bytes).digest('hex') !== manifest.sha256 || response.bytes.subarray(0,2).toString() !== 'MZ') throw new Error('Installer integrity check failed');
      fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
      const destination = path.join(this.directory,`ClipBoardLine-Setup-${manifest.build}.exe`);
      const temporary = destination + '.tmp-' + crypto.randomUUID();
      fs.writeFileSync(temporary,response.bytes,{flag:'wx',mode:0o600}); fs.renameSync(temporary,destination);
      this.installer = destination; this.set({status:'ready',message:'Verified update is ready to install.'}); return destination;
    } catch(error) { this.set({status:'error',message:error.message}); throw error; }
  }
}
module.exports = {Updates,verifyEnvelope,FEED,PUBLIC_KEY,REPOSITORY};
