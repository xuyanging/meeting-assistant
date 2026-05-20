const { app, BrowserWindow, ipcMain, globalShortcut, screen } = require('electron');
const path = require('path');

let mainWindow = null;

// 内置输入法状态（主进程侧）
let imeActive = false;
let imeInputFocused = false;
let imeHasBuffer = false;

function createWindow() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 480,
    height: 680,
    x: Math.max(0, screenWidth - 500),
    y: 80,
    minWidth: 320,
    minHeight: 400,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: true,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    title: 'Mac Assistant',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 核心：屏幕共享/录屏时此窗口不可见 (macOS: NSWindowSharingNone)
  mainWindow.setContentProtection(true);

  // 置顶到最高层，包括全屏 App 之上
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 内置输入法：在系统 IME 之前拦截按键
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!imeActive || !imeInputFocused) return;

    if (input.type === 'char') {
      const k = input.key;
      if (/^[a-z]$/.test(k)) {
        event.preventDefault();
        mainWindow.webContents.send('ime:char', k);
      } else if (/^[1-5]$/.test(k) && imeHasBuffer) {
        event.preventDefault();
        mainWindow.webContents.send('ime:select', parseInt(k) - 1);
      } else if (k === ' ' && imeHasBuffer) {
        event.preventDefault();
        mainWindow.webContents.send('ime:select', 0);
      }
    } else if (input.type === 'keyDown') {
      if (input.key === 'Backspace' && imeHasBuffer) {
        event.preventDefault();
        mainWindow.webContents.send('ime:backspace');
      } else if (input.key === 'Escape' && imeHasBuffer) {
        event.preventDefault();
        mainWindow.webContents.send('ime:escape');
      } else if (input.key === 'Return' && imeHasBuffer) {
        event.preventDefault();
        mainWindow.webContents.send('ime:enter');
      }
    }
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  // 全局快捷键：Cmd+Shift+\ 显隐窗口
  globalShortcut.register('CommandOrControl+Shift+\\', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // 全局快捷键：Cmd+Shift+Enter 聚焦输入框
  globalShortcut.register('CommandOrControl+Shift+Return', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('focus-input');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuiting = true;
  globalShortcut.unregisterAll();
});

// IPC: 内置输入法状态同步
ipcMain.on('ime:setActive', (_, v) => { imeActive = v; });
ipcMain.on('ime:setFocus', (_, v) => { imeInputFocused = v; });
ipcMain.on('ime:setHasBuffer', (_, v) => { imeHasBuffer = v; });

// IPC: 窗口控制
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:hide', () => mainWindow?.hide());
ipcMain.handle('window:close', () => {
  app.isQuiting = true;
  app.quit();
});
ipcMain.handle('window:set-opacity', (_, opacity) => {
  const o = Math.max(0.2, Math.min(1, Number(opacity) || 1));
  mainWindow?.setOpacity(o);
});
ipcMain.handle('window:set-always-on-top', (_, flag) => {
  if (!mainWindow) return;
  mainWindow.setAlwaysOnTop(!!flag, 'screen-saver');
});
ipcMain.handle('window:set-content-protection', (_, flag) => {
  mainWindow?.setContentProtection(!!flag);
});
ipcMain.handle('window:get-state', () => ({
  contentProtection: true,
  platform: process.platform,
  version: app.getVersion(),
}));
