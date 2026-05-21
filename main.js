const { app, BrowserWindow, ipcMain, globalShortcut, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { startProxy, stopProxy } = require('./proxy');

let mainWindow = null;
let proxyPort = null;

function proxyConfigPath() {
  return path.join(app.getPath('userData'), 'proxy-config.json');
}

function readProxyEnabled() {
  try {
    return !!JSON.parse(fs.readFileSync(proxyConfigPath(), 'utf8')).enabled;
  } catch (_) {
    return true; // default on
  }
}

function writeProxyEnabled(enabled) {
  try {
    fs.mkdirSync(path.dirname(proxyConfigPath()), { recursive: true });
    fs.writeFileSync(proxyConfigPath(), JSON.stringify({ enabled: !!enabled }));
  } catch (e) {
    console.warn('[main] persist proxy state failed:', e.message);
  }
}

async function enableProxy() {
  try {
    const { port } = await startProxy();
    proxyPort = port;
    await session.defaultSession.setProxy({
      proxyRules: `socks5://127.0.0.1:${port}`,
      proxyBypassRules: '<local>',
    });
    console.log('[main] proxy enabled on port', port);
  } catch (e) {
    console.error('[main] proxy enable failed:', e);
  }
}

async function disableProxy() {
  try {
    await session.defaultSession.setProxy({ mode: 'direct' });
    stopProxy();
    proxyPort = null;
    console.log('[main] proxy disabled, direct connection');
  } catch (e) {
    console.error('[main] proxy disable failed:', e);
  }
}


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

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

app.whenReady().then(async () => {
  if (readProxyEnabled()) {
    await enableProxy();
  } else {
    console.log('[main] proxy disabled by user preference');
  }
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

ipcMain.handle('proxy:get-enabled', () => readProxyEnabled());
ipcMain.handle('proxy:set-enabled', async (_, enabled) => {
  const on = !!enabled;
  writeProxyEnabled(on);
  if (on) await enableProxy(); else await disableProxy();
  return on;
});
