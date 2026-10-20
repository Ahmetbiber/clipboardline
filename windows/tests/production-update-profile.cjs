'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const REPOSITORY='orkunisitmak/clipboardline-desktop';
const EXPECTED=Object.freeze({version:'1.7.3',build:66,tag:'windows-1.7.3-build66',macArchive:'ClipboardLine-1.7.3-build72.zip',previousVersion:'1.7.2',previousBuild:65,previousSource:'998c1ac203e11a7a97aee2039b4c5bd6d8df9a09',previousSHA256:'62cebf204958ca8729c8fd569d7c5a6f83c73aeced6d1f63760500a6b2cf5a8f',previousURL:`https://github.com/${REPOSITORY}/releases/download/windows-1.7.2-build65/ClipBoardLine-Setup-1.7.2-x64.exe`});
function expectedPublication(env){
 const source=env.CLIPBOARDLINE_PUBLISHED_SOURCE,releaseId=env.CLIPBOARDLINE_PUBLISHED_RELEASE_ID;
 assert.match(source||'',/^[a-f0-9]{40}$/,'Supply the exact published application source SHA, not the validation branch SHA.');
 assert.match(releaseId||'',/^[1-9][0-9]{0,15}$/,'Supply the reviewed canonical Latest release ID.');
 return Object.freeze({source,releaseId});
}
function assertPublication(manifest,latest,assetEnvelope,latestEnvelope,expected){
 assert.equal(manifest.repository,REPOSITORY);assert.equal(manifest.version,EXPECTED.version);assert.equal(manifest.build,EXPECTED.build);assert.equal(manifest.sourceRevision,expected.source);
 assert.equal(String(latest.id),expected.releaseId,'Latest changed after this one-off test was authorized.');assert.equal(latest.draft,false);assert.equal(latest.prerelease,false);assert.equal(latest.tag_name,EXPECTED.tag);
 assert.ok(Array.isArray(latest.assets));assert.equal(latest.assets.length,7,'The reviewed coordinated release must have exactly seven assets.');
 const assets=new Map(latest.assets.map(asset=>[asset.name,asset]));assert.equal(assets.size,latest.assets.length,'Duplicate asset names are ambiguous.');
 const installerName=`ClipBoardLine-Setup-${EXPECTED.version}-x64.exe`;
 assert.deepEqual([...assets.keys()].sort(),[installerName,EXPECTED.macArchive,'appcast.xml','windows-update.json','SHA256SUMS','LICENSES-macOS.txt','LICENSES-Windows.txt'].sort());
 assert.equal(new Set(latest.assets.map(asset=>asset.id)).size,7,'Duplicate asset identities are ambiguous.');
 for(const asset of latest.assets){assert.ok(Number.isSafeInteger(asset.id)&&asset.id>0);assert.ok(Number.isSafeInteger(asset.size)&&asset.size>0&&asset.size<=1024**3);assert.equal(asset.state,'uploaded');}
 const installer=assets.get(installerName);assert.equal(installer.size,manifest.size);assert.equal(path.posix.basename(new URL(manifest.url).pathname),installerName);
 assert.equal(manifest.url,`https://github.com/${REPOSITORY}/releases/download/${EXPECTED.tag}/${installerName}`);
 assert.equal(installer.browser_download_url,manifest.url,'The installer attached to the reviewed release must be the signed manifest URL.');
 assert.ok(Buffer.isBuffer(assetEnvelope)&&Buffer.isBuffer(latestEnvelope));assert.ok(assetEnvelope.equals(latestEnvelope),'Anonymous Latest must serve the exact envelope attached to the reviewed release ID.');
 return {id:String(latest.id),tag:latest.tag_name,feedAssetId:String(assets.get('windows-update.json').id),installerAssetId:String(installer.id)};
}
function assertProductionRuntime(info,version,build,state){
 assert.equal(info.packaged,true);assert.equal(info.testHooks,false);assert.equal(info.version,version);assert.equal(state.version,version);assert.equal(state.build,build);assert.equal(state.development,false);
 assert.ok(Array.isArray(info.argv));assert.ok(!info.argv.some(value=>/^--test-(?:mode|data)(?:=|$)/.test(value)),'Production acceptance may never enable test hooks or redirect user data.');
 assert.match(info.appPath,/[/\\]resources[/\\]app\.asar$/i);
}
module.exports={REPOSITORY,EXPECTED,expectedPublication,assertPublication,assertProductionRuntime};
