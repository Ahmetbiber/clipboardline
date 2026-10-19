'use strict';
const {contextBridge,ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('clipboardLine',Object.freeze({
  diagnostics:()=>({sandboxed:process.sandboxed===true,contextIsolated:process.contextIsolated===true}),
  state:()=>ipcRenderer.invoke('clipboardline:state'),
  command:(action,payload={})=>ipcRenderer.invoke('clipboardline:command',action,payload),
  subscribe:listener=>{ if(typeof listener!=='function')throw new TypeError('Expected a listener');const wrapped=(_event,state)=>listener(state);ipcRenderer.on('clipboardline:changed',wrapped);return()=>ipcRenderer.removeListener('clipboardline:changed',wrapped); }
}));
