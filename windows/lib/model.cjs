'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync}=require('node:child_process');

const KINDS = ['image', 'text', 'link'];
const DEFAULTS = Object.freeze({
  visibleKinds: KINDS, captureText: false, captureImages: false, captureLinks: false,fetchLinkMetadata:false,
  retentionDays: {image: 30, text: 30, link: 30},
  shortcuts: {toggle: 'Control+Alt+Space', search: 'Control+Alt+S', screenshot: 'Control+Alt+A'},
  localShortcuts: {},
  autoCheckUpdates: true, watchFolders: [], openAfterScreenshot: true,
  theme:'soft', cardSize:'medium', sounds:false, launchAtLogin:false, language:'en',indexImages:true
});
const clone = value => structuredClone(value);
const fail = message => { throw new Error(message); };
function text(value, maximum = 1024 * 1024, empty = false) {
  if (typeof value !== 'string' || value.length > maximum || (!empty && !value.length) || value.includes('\0')) fail('Invalid text');
  return value;
}
function ids(value) {
  if (!Array.isArray(value) || value.length > 10000 || value.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))) fail('Invalid item selection');
  return [...new Set(value)];
}
function settings(patch, previous = DEFAULTS) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('Invalid settings');
  const out = clone(previous);
  for (const [key, value] of Object.entries(patch)) {
    if (['captureText', 'captureImages', 'captureLinks', 'fetchLinkMetadata','autoCheckUpdates', 'openAfterScreenshot','sounds','launchAtLogin','indexImages'].includes(key)) {
      if (typeof value !== 'boolean') fail('Invalid preference');
      out[key] = value;
    } else if (key === 'visibleKinds') {
      if (!Array.isArray(value) || value.some(k => !KINDS.includes(k))) fail('Invalid visible shelves');
      out[key] = [...new Set(value)];
    } else if (key === 'retentionDays') {
      for (const [kind, days] of Object.entries(value || {})) {
        if (!KINDS.includes(kind) || !Number.isInteger(days) || days < 0 || days > 3650) fail('Invalid history duration');
        out.retentionDays[kind] = days;
      }
    } else if (key === 'shortcuts') {
      for (const [action, shortcut] of Object.entries(value || {})) {
        if (!['toggle', 'search', 'screenshot'].includes(action) || typeof shortcut !== 'string' || shortcut.length > 80 || /[\r\n\0]/.test(shortcut)) fail('Invalid shortcut');
        out.shortcuts[action] = shortcut;
      }
    } else if (key === 'localShortcuts') {
      for (const [action, shortcut] of Object.entries(value || {})) {
        if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,60}$/.test(action) || ['constructor','prototype','__proto__'].includes(action) || typeof shortcut !== 'string' || shortcut.length > 80 || /[\r\n\0]/.test(shortcut)) fail('Invalid local shortcut');
        out.localShortcuts[action] = shortcut;
      }
    } else if (['theme','cardSize','language'].includes(key)) {
      const values={theme:['soft','neutral'],cardSize:['small','medium','large'],language:['en','tr']};
      if(!values[key].includes(value))fail('Invalid appearance preference');out[key]=value;
    } else if (key === 'watchFolders') {
      if (!Array.isArray(value) || value.length > 20 || value.some(v => typeof v !== 'string' || !path.isAbsolute(v) || v.length > 4096)) fail('Invalid watched folder');
      out.watchFolders = [...new Set(value)];
    } else fail('Unknown preference');
  }
  return out;
}
function saved(item) { return item.pinned || item.folderIds.length > 0 || item.tags.length > 0; }
function plainURL(value) {
  if (typeof value !== 'string' || /\s/.test(value) || value.length > 8192) return null;
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}

class Store {
  constructor(directory, {clock = Date.now} = {}) {
    this.directory = path.resolve(directory); this.clock = clock; this.undoStack = [];
    fs.mkdirSync(this.directory, {recursive: true, mode: 0o700});
    if(fs.lstatSync(this.directory).isSymbolicLink())fail('Application data must not be a symlink.');
    if(process.platform==='win32'){
      const script=__dirname.includes('app.asar')?path.join(process.resourcesPath,'native','protect-directory.ps1'):path.join(__dirname,'..','native','protect-directory.ps1');
      const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
      try{execFileSync(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Directory',this.directory],{windowsHide:true,timeout:15000,stdio:['ignore','pipe','pipe']});}
      catch{fail('The private application data permissions could not be secured. Existing files were preserved.');}
    }
    this.mediaDirectory = path.join(this.directory, 'media'); fs.mkdirSync(this.mediaDirectory, {recursive: true, mode: 0o700});
    this.file = path.join(this.directory, 'library.json');
    this.data = {schema: 1, items: [], folders: [], settings: clone(DEFAULTS)};
    if (fs.existsSync(this.file)) {
      if (fs.statSync(this.file).size > 64 * 1024 * 1024) fail('Library exceeds safe load size');
      let parsed;
      try { parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { fail('Library is unreadable. Original data was preserved; recover library.json.backup.'); }
      if (parsed.schema !== 1 || !Array.isArray(parsed.items) || parsed.items.length > 20000 || !Array.isArray(parsed.folders)) fail('Unsupported library format');
      this.data = {...parsed, settings: settings(parsed.settings)};
      for (const item of this.data.items) this.validateStored(item);
    }
    this.expire();
  }
  validateStored(item) {
    ids([item.id]); if (!KINDS.includes(item.kind) || !Array.isArray(item.folderIds) || !Array.isArray(item.tags)) fail('Invalid library record');
    if (item.text != null) text(item.text, 1024 * 1024, true);
    for (const key of ['imageFile', 'renderedFile']) if (item[key] && !/^[a-f0-9]{64}\.png$/.test(item[key])) fail('Unsafe managed media path');
  }
  persist() {
    const temporary = this.file + '.tmp-' + crypto.randomUUID();
    let descriptor;
    try {
      descriptor = fs.openSync(temporary, 'wx', 0o600); fs.writeFileSync(descriptor, JSON.stringify(this.data)); fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = null;
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.backup');
      fs.renameSync(temporary, this.file);
    } finally { if (descriptor != null) fs.closeSync(descriptor); if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  selected(value) { const selected = ids(value); const result = selected.map(id => this.data.items.find(i => i.id === id)); if (result.some(i => !i)) fail('An item no longer exists'); return result; }
  item(id) { return this.selected([id])[0]; }
  putPNG(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 24 || buffer.length > 64 * 1024 * 1024 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail('Invalid PNG image');
    const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
    if (!width || !height || width * height > 80_000_000) fail('Image is too large');
    const filename = crypto.createHash('sha256').update(buffer).digest('hex') + '.png';
    const destination = path.join(this.mediaDirectory, filename);
    if (!fs.existsSync(destination)) fs.writeFileSync(destination, buffer, {flag: 'wx', mode: 0o600});
    return filename;
  }
  mediaPath(id, original = false) {
    const item = this.item(id); const filename = original ? item.imageFile : (item.renderedFile || item.imageFile);
    if (item.kind !== 'image' || !filename || !/^[a-f0-9]{64}\.png$/.test(filename)) fail('Image unavailable');
    const result = path.join(this.mediaDirectory, filename);
    if (!fs.existsSync(result) || fs.lstatSync(result).isSymbolicLink()) fail('Image unavailable');
    return result;
  }
  insert(kind, value, extra = {}) {
    if (!KINDS.includes(kind)) fail('Invalid content kind');
    let textValue = '', url = '', imageFile = '';
    if (kind === 'image') imageFile = this.putPNG(value);
    else if (kind === 'link') { url = plainURL(value) || fail('Invalid URL'); }
    else textValue = text(value);
    const matching = this.data.items.filter(i => i.kind === kind && !i.trashedAt &&
      (kind === 'text' ? i.text === textValue : kind === 'link' ? i.url === url : i.imageFile === imageFile));
    const prior = matching.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if(!prior&&this.data.items.length>=20000)fail('Library item limit reached');
    const now = this.clock();
    const item = prior || {id: crypto.randomUUID(), kind, text: textValue, url, title: '', name: '', pinned: false, folderIds: [], tags: [],
      imageFile, renderedFile: '', ocrText: '', annotations: [], crop: null, createdAt: now, updatedAt: now, trashedAt: null, hiddenFromShelf: false};
    item.createdAt = now; item.updatedAt = now; item.hiddenFromShelf = false;
    if (extra.title) item.title = text(extra.title, 500, true);
    if (matching.length > 1) {
      item.pinned ||= matching.some(i => i.pinned);
      item.folderIds = [...new Set(matching.flatMap(i => i.folderIds))]; item.tags = [...new Set(matching.flatMap(i => i.tags))];
      item.name ||= matching.find(i => i.name)?.name || '';
    }
    this.data.items = [item, ...this.data.items.filter(i => i.id !== item.id && !matching.includes(i))];
    this.expire(false); this.persist(); return item;
  }
  expire(persist = true) {
    let changed = false;
    for (const item of this.data.items) {
      const days = this.data.settings.retentionDays[item.kind];
      if (!item.trashedAt && !saved(item) && days > 0 && item.createdAt < this.clock() - days * 86400000) { item.trashedAt = this.clock(); changed = true; }
    }
    if (persist && changed) this.persist();
  }
  modify(action, payload = {}) {
    const before=clone(this.data), undo=clone(this.undoStack);
    try{return this.modifyTransaction(action,payload);}catch(error){this.data=before;this.undoStack=undo;throw error;}
  }
  modifyTransaction(action, payload = {}) {
    const now = this.clock();
    if (action === 'setSettings') { this.data.settings = settings(payload.patch, this.data.settings); this.expire(false); this.persist(); return; }
    if (action === 'createFolder') {
      const name = text(payload.name, 120).trim(); if (!name) fail('Folder name is empty');
      const parentId = payload.parentId || null;
      if (parentId && !this.data.folders.some(f => f.id === parentId)) fail('Parent folder is unavailable');
      const folder = {id: crypto.randomUUID(), name, parentId}; this.data.folders.push(folder); this.persist(); return folder;
    }
    if(action==='renameFolder'||action==='removeFolder') {
      const folder=this.data.folders.find(f=>f.id===payload.id);if(!folder)fail('Folder unavailable');
      if(action==='renameFolder'){folder.name=text(payload.name,120).trim();if(!folder.name)fail('Folder name is empty');}
      else {this.data.folders=this.data.folders.filter(f=>f.id!==folder.id);for(const child of this.data.folders)if(child.parentId===folder.id)child.parentId=folder.parentId;for(const item of this.data.items)item.folderIds=item.folderIds.filter(id=>id!==folder.id);}
      this.persist();return;
    }
    if (action === 'undo') {
      const batch = this.undoStack.pop(); if (!batch) return;
      for (const before of batch) { const item = this.data.items.find(i => i.id === before.id); if (item) { item.trashedAt = before.trashedAt; item.hiddenFromShelf = before.hiddenFromShelf; } }
      this.persist(); return;
    }
    const items = this.selected(payload.ids || (payload.id ? [payload.id] : []));
    if (!items.length) fail('Select an item first');
    if (action === 'remove') {
      this.undoStack.push(items.map(i => ({id: i.id, trashedAt: i.trashedAt, hiddenFromShelf: i.hiddenFromShelf})));
      if (this.undoStack.length > 32) this.undoStack.shift();
    }
    const targetPin = typeof payload.value === 'boolean' ? payload.value : items.some(i => !i.pinned);
    for (const item of items) {
      if (action === 'pin') item.pinned = targetPin;
      else if (action === 'name') { item.name = text(payload.name, 200, true).trim(); item.pinned = true; }
      else if (action === 'folder') {
        if (!this.data.folders.some(f => f.id === payload.folderId)) fail('Folder unavailable');
        item.folderIds = [...new Set([...item.folderIds, payload.folderId])]; item.pinned = true;
      } else if (action === 'tag') {
        if (!Array.isArray(payload.tags) || payload.tags.length > 50) fail('Invalid tags');
        item.tags = [...new Set(payload.tags.map(tag => text(tag, 80).trim()).filter(Boolean))];
      } else if (action === 'remove') { if (saved(item)) item.hiddenFromShelf = true; else item.trashedAt = now; }
      else if (action === 'trash') item.trashedAt = now;
      else if (action === 'restore') { item.trashedAt = null; item.hiddenFromShelf = false; }
      else if (action === 'editText') { if (item.kind !== 'text') fail('Only text can be edited'); item.text = text(payload.text, 1024 * 1024, true); }
      else if (action === 'saveImage') {
        if (item.kind !== 'image' || typeof payload.dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(payload.dataUrl) || payload.dataUrl.length > 90_000_000) fail('Invalid image edit');
        const annotations = payload.annotations ?? []; const crop = payload.crop ?? null;
        if (!Array.isArray(annotations) || annotations.length > 2000 || JSON.stringify(annotations).length > 2_000_000 || (crop !== null && (typeof crop !== 'object' || ['x','y','width','height'].some(k => !Number.isFinite(crop[k])) || crop.x<0 || crop.y<0 || crop.width<=0 || crop.height<=0))) fail('Invalid image edit metadata');
        if(crop){const original=fs.readFileSync(this.mediaPath(item.id,true));if(crop.x+crop.width>original.readUInt32BE(16)||crop.y+crop.height>original.readUInt32BE(20))fail('Crop is outside the original image');}
        item.renderedFile = this.putPNG(Buffer.from(payload.dataUrl.split(',')[1], 'base64')); item.annotations = clone(annotations); item.crop = clone(crop); item.ocrText = '';
      } else if (action === 'delete') { if (!item.trashedAt) fail('Move items to Trash before permanent deletion'); }
      else fail('Unknown library action');
      item.updatedAt = now;
    }
    if (action === 'delete') this.data.items = this.data.items.filter(i => !items.includes(i));
    if (['delete', 'trash', 'restore'].includes(action)) this.undoStack = this.undoStack.filter(batch => !batch.some(old => items.some(i => i.id === old.id)));
    this.persist();
  }
  publicState() {
    return {
      items: this.data.items.map(({imageFile, renderedFile, thumbnailFile, ...item}) => ({...clone(item),
        ...(thumbnailFile ? {thumbnailUrl: `appmedia://media/${item.id}/thumbnail`} : {}),
        ...(item.kind === 'image' ? {mediaUrl: `appmedia://media/${item.id}`, originalMediaUrl: `appmedia://media/${item.id}/original`} : {})})),
      folders: clone(this.data.folders), settings: clone(this.data.settings), canUndo: this.undoStack.length > 0
    };
  }
}
module.exports = {Store, KINDS, DEFAULTS, settings, saved, plainURL, text, ids};
