const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  hide: () => ipcRenderer.invoke('window:hide'),
  close: () => ipcRenderer.invoke('window:close'),
  setOpacity: (opacity) => ipcRenderer.invoke('window:set-opacity', opacity),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('window:set-always-on-top', flag),
  setContentProtection: (flag) => ipcRenderer.invoke('window:set-content-protection', flag),
  getState: () => ipcRenderer.invoke('window:get-state'),
  onFocusInput: (cb) => ipcRenderer.on('focus-input', cb),
  proxyGetEnabled: () => ipcRenderer.invoke('proxy:get-enabled'),
  proxySetEnabled: (enabled) => ipcRenderer.invoke('proxy:set-enabled', enabled),
});
