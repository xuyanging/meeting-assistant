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

  // 内置输入法
  imeSetActive: (v) => ipcRenderer.send('ime:setActive', v),
  imeSetFocus: (v) => ipcRenderer.send('ime:setFocus', v),
  imeSetHasBuffer: (v) => ipcRenderer.send('ime:setHasBuffer', v),
  onImeChar: (cb) => ipcRenderer.on('ime:char', (_, c) => cb(c)),
  onImeSelect: (cb) => ipcRenderer.on('ime:select', (_, i) => cb(i)),
  onImeBackspace: (cb) => ipcRenderer.on('ime:backspace', cb),
  onImeEscape: (cb) => ipcRenderer.on('ime:escape', cb),
  onImeEnter: (cb) => ipcRenderer.on('ime:enter', cb),
});
