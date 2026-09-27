import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import dns from 'dns';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { Database } from './db/Database';
import { SingBoxManager } from './core/SingBoxManager';
import { ConfigGenerator } from './core/ConfigGenerator';
import { SystemProxy } from './system/SystemProxy';
import { ProcessScanner } from './system/ProcessScanner';
import { TcpPing } from './net/TcpPing';
import { SpeedTestRunner } from './net/SpeedTestRunner';
import { WebDAVClient } from './net/WebDAVClient';
import { BackupMigrator } from './db/BackupMigrator';
import { SubscriptionFetcher } from './net/SubscriptionFetcher';
import { UniversalSubscriptionParser } from './net/UniversalSubscriptionParser';
import { TrayManager } from './tray/TrayManager';
import { TrafficStats } from '../types';
import { LogManager } from './log/LogManager';

let mainWindow: BrowserWindow | null = null;
let trafficTimer: NodeJS.Timeout | null = null;
let startTime: number = 0;
let totalRx: number = 0;
let totalTx: number = 0;

function getWindowIcon(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'bin', 'icon.ico'),
    path.join(path.dirname(process.execPath || ''), 'resources', 'bin', 'icon.ico'),
    path.join(__dirname, '../../build/icon.ico'),
    path.join(process.cwd(), 'build', 'icon.ico'),
    path.join(process.cwd(), 'bin', 'icon.ico'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return path.join(process.cwd(), 'build', 'icon.ico');
}

function createWindow(): void {
  const iconPath = getWindowIcon();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#020617',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  LogManager.getInstance().setMainWindow(mainWindow);

  // Open any external http(s) links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on('close', (e) => {
    const settings = Database.getInstance().getSettings();
    if (settings.closeToTray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  TrayManager.getInstance().init(mainWindow);
}

let isAppQuitting = false;

app.whenReady().then(() => {
  createWindow();

  let lastSampleTime = 0;
  let lastDownloadTotal = 0;
  let lastUploadTotal = 0;
  let hasSampledBefore = false;

  // Real traffic & connections polling loop
  trafficTimer = setInterval(async () => {
    const core = SingBoxManager.getInstance();
    if (core.getState() === 'running') {
      if (!startTime) {
        startTime = Date.now();
        lastSampleTime = Date.now();
        hasSampledBefore = false;
      }
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      const settings = Database.getInstance().getSettings();
      const port = settings.clashApiPort || 9090;
      const secret = settings.clashApiSecret;

      let rx = 0;
      let tx = 0;
      let activeConnections = 0;

      try {
        const stats = await fetchClashConnections(port, secret);
        const now = Date.now();
        const elapsedSec = (now - lastSampleTime) / 1000;

        if (hasSampledBefore && elapsedSec > 0) {
          rx = Math.max(0, Math.round((stats.downloadTotal - lastDownloadTotal) / elapsedSec));
          tx = Math.max(0, Math.round((stats.uploadTotal - lastUploadTotal) / elapsedSec));
        }

        lastDownloadTotal = stats.downloadTotal;
        lastUploadTotal = stats.uploadTotal;
        lastSampleTime = now;
        hasSampledBefore = true;

        totalRx = stats.downloadTotal;
        totalTx = stats.uploadTotal;
        activeConnections = stats.connectionsCount;
      } catch {
        // Core might be starting up or shutting down; output true 0, never mock
        rx = 0;
        tx = 0;
        activeConnections = 0;
      }

      // Real node latency from active node if tested
      const activeNodeId = Database.getInstance().getActiveNodeId();
      const activeNode = Database.getInstance().getNodes().find((n) => n.id === activeNodeId);
      const latency = activeNode && activeNode.ping && activeNode.ping > 0 ? activeNode.ping : 0;

      const traffic: TrafficStats = {
        downloadSpeed: rx,
        uploadSpeed: tx,
        totalDownload: totalRx,
        totalUpload: totalTx,
        latency,
        uptime,
        activeConnections,
      };

      mainWindow?.webContents.send('core:traffic', traffic);
    } else {
      startTime = 0;
      hasSampledBefore = false;
    }
  }, 1000);

  // Auto connect on launch
  const settings = Database.getInstance().getSettings();
  if (settings.autoConnectOnLaunch) {
    handleCoreStart();
  }
});

app.on('before-quit', async (e) => {
  if (!isAppQuitting) {
    e.preventDefault();
    isAppQuitting = true;
    if (trafficTimer) {
      clearInterval(trafficTimer);
      trafficTimer = null;
    }
    try {
      await handleCoreStop();
      await SystemProxy.restoreOriginal();
      await LogManager.getInstance().destroy();
      TrayManager.getInstance().destroy();
    } catch (err) {
      console.error('Error during cleanup on quit:', err);
    }
    app.quit();
  }
});

function fetchClashConnections(
  port: number,
  secret?: string
): Promise<{ downloadTotal: number; uploadTotal: number; connectionsCount: number }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (secret) {
      headers['Authorization'] = `Bearer ${secret}`;
    }
    const req = http.get(
      `http://127.0.0.1:${port}/connections`,
      { headers, timeout: 800 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({
              downloadTotal: typeof parsed.downloadTotal === 'number' ? parsed.downloadTotal : 0,
              uploadTotal: typeof parsed.uploadTotal === 'number' ? parsed.uploadTotal : 0,
              connectionsCount: Array.isArray(parsed.connections) ? parsed.connections.length : 0,
            });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function handleCoreStop(): Promise<boolean> {
  const core = SingBoxManager.getInstance();
  const settings = Database.getInstance().getSettings();
  await core.stop();
  if (settings.systemProxyEnabled) {
    await SystemProxy.disable();
    LogManager.getInstance().addLog('info', 'Windows 系统代理已关闭', 'system');
  }
  LogManager.getInstance().addLog('info', '代理核心引擎已停止连接', 'core');
  TrayManager.getInstance().updateMenu();
  return true;
}

async function handleCoreStart(): Promise<boolean> {
  const db = Database.getInstance();
  const core = SingBoxManager.getInstance();
  const settings = db.getSettings();
  const nodes = db.getNodes();
  const activeNodeId = db.getActiveNodeId();

  if (nodes.length === 0) {
    LogManager.getInstance().addLog(
      'warn',
      '【提示】当前节点列表中暂无可用节点。建议先添加或更新订阅后再进行连接。',
      'app'
    );
  }

  const config = ConfigGenerator.generate(
    activeNodeId,
    nodes,
    db.getRules(),
    db.getAppRules(),
    db.getDns(),
    settings
  );

  LogManager.getInstance().addLog('info', '正在启动 Sing-box 核心代理引擎...', 'app');
  const started = await core.start(config);
  if (started) {
    LogManager.getInstance().addLog('info', '代理核心引擎已就绪并接管网络流量', 'core');
    if (settings.systemProxyEnabled) {
      await SystemProxy.enable(
        '127.0.0.1',
        settings.mixedPort,
        settings.systemProxyBypassLan,
        settings.customBypassList
      );
      LogManager.getInstance().addLog('info', `Windows 系统代理已开启 (127.0.0.1:${settings.mixedPort})`, 'system');
    }
  } else {
    LogManager.getInstance().addLog('error', 'Sing-box 核心启动失败，请检查配置或日志详情', 'core');
  }
  TrayManager.getInstance().updateMenu();
  return started;
}

// -------------------------------------------------------------
// IPC Handlers
// -------------------------------------------------------------

// Logs
ipcMain.handle('log:getAll', () => LogManager.getInstance().getLogs());
ipcMain.handle('log:clear', () => {
  LogManager.getInstance().clearLogs();
  return true;
});
ipcMain.handle('log:export', async () => {
  return LogManager.getInstance().exportLogs();
});

// Window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() || false);
ipcMain.handle('system:openExternal', (_, url: string) => {
  if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
    shell.openExternal(url);
    return true;
  }
  return false;
});
ipcMain.handle('system:isAdmin', () => SingBoxManager.getInstance().isAdmin());
ipcMain.handle('system:relaunchAsAdmin', () => {
  const execPath = process.execPath;
  const script = `Start-Process -FilePath "${execPath}" -Verb RunAs`;
  spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  setTimeout(() => app.quit(), 500);
  return true;
});
ipcMain.handle('system:flushDns', async () => {
  try {
    await promisify(exec)('ipconfig /flushdns');
    LogManager.getInstance().addLog('info', 'Windows 本地 DNS 缓存已成功刷新 (ipconfig /flushdns)', 'system');
    return { success: true, message: 'Windows 本地 DNS 缓存已成功刷新！' };
  } catch (e: any) {
    LogManager.getInstance().addLog('warn', `刷新 DNS 缓存失败: ${e.message}`, 'system');
    return { success: false, message: e.message };
  }
});
ipcMain.handle('system:getAppVersion', () => app.getVersion());

// Core
ipcMain.handle('core:start', async () => handleCoreStart());
ipcMain.handle('core:stop', async () => handleCoreStop());
ipcMain.handle('core:restart', async () => {
  await handleCoreStop();
  return handleCoreStart();
});
ipcMain.handle('core:getState', () => SingBoxManager.getInstance().getState());
ipcMain.handle('core:getVersion', () => SingBoxManager.getInstance().getVersion());
ipcMain.handle('core:getLiveConfig', () => SingBoxManager.getInstance().getLiveConfig());
ipcMain.handle('core:validateConfig', () => {
  const db = Database.getInstance();
  const config = ConfigGenerator.generate(
    db.getActiveNodeId(),
    db.getNodes(),
    db.getRules(),
    db.getAppRules(),
    db.getDns(),
    db.getSettings()
  );
  return SingBoxManager.getInstance().validate(config);
});

// Forward core state change
SingBoxManager.getInstance().on('stateChange', (state) => {
  mainWindow?.webContents.send('core:stateChange', state);
});

// Nodes
ipcMain.handle('nodes:getAll', () => Database.getInstance().getNodes());
ipcMain.handle('nodes:save', (_, nodes) => Database.getInstance().saveNodes(nodes));
ipcMain.handle('nodes:getActiveId', () => Database.getInstance().getActiveNodeId());
ipcMain.handle('nodes:setActiveId', async (_, id) => {
  const db = Database.getInstance();
  db.setActiveNodeId(id);
  const core = SingBoxManager.getInstance();
  if (core.getState() === 'running') {
    await handleCoreStart();
  }
  TrayManager.getInstance().updateMenu();
  return true;
});
ipcMain.handle('nodes:ping', (_, host, port) => TcpPing.ping(host, port));
ipcMain.handle('nodes:batchPing', (_, list) => TcpPing.batchPing(list, 10));

// Subscriptions
ipcMain.handle('subs:getAll', () => Database.getInstance().getSubscriptions());
ipcMain.handle('subs:save', (_, subs) => Database.getInstance().saveSubscriptions(subs));
ipcMain.handle('subs:update', async (_, id) => {
  const db = Database.getInstance();
  const subs = db.getSubscriptions();
  const target = subs.find((s) => s.id === id);
  if (!target || !target.url) return false;

  try {
    target.status = 'updating';
    db.saveSubscriptions(subs);

    const settings = db.getSettings();
    const result = await SubscriptionFetcher.fetch(target.url, settings.mixedPort);
    const newNodes = UniversalSubscriptionParser.parse(result.content);

    if (newNodes.length > 0) {
      newNodes.forEach((n) => (n.groupId = target.id));
      const otherNodes = db.getNodes().filter((n) => n.groupId !== target.id);
      db.saveNodes([...otherNodes, ...newNodes]);

      target.nodeCount = newNodes.length;
      target.lastUpdate = Date.now();
      target.status = 'success';
      target.errorMessage = undefined;
      db.saveSubscriptions(subs);
      return true;
    } else {
      target.status = 'error';
      target.errorMessage = '未能从订阅源解析出有效节点';
      db.saveSubscriptions(subs);
      return false;
    }
  } catch (e: any) {
    target.status = 'error';
    target.errorMessage = e.message || '更新订阅失败';
    db.saveSubscriptions(subs);
    return false;
  }
});

// Routing & Apps
ipcMain.handle('routing:getRules', () => Database.getInstance().getRules());
ipcMain.handle('routing:saveRules', (_, rules) => Database.getInstance().saveRules(rules));
ipcMain.handle('routing:getAppRules', () => Database.getInstance().getAppRules());
ipcMain.handle('routing:saveAppRules', (_, rules) => Database.getInstance().saveAppRules(rules));
ipcMain.handle('routing:getRunningApps', () => ProcessScanner.getRunningProcesses());

// DNS
ipcMain.handle('dns:get', () => Database.getInstance().getDns());
ipcMain.handle('dns:save', (_, dns) => Database.getInstance().saveDns(dns));
ipcMain.handle('dns:testResolve', async (_, domain: string) => {
  const start = Date.now();
  try {
    const addresses = await dns.promises.resolve4(domain);
    const duration = Date.now() - start;
    return {
      success: true,
      ip: addresses[0] || '无返回记录',
      allIps: addresses,
      latency: duration,
    };
  } catch (e: any) {
    try {
      const res = await dns.promises.lookup(domain);
      const duration = Date.now() - start;
      return {
        success: true,
        ip: res.address,
        allIps: [res.address],
        latency: duration,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || '域名解析失败',
        latency: Date.now() - start,
      };
    }
  }
});

// Speed Test
ipcMain.handle('speedtest:latency', (_, url, nodeId) => {
  const settings = Database.getInstance().getSettings();
  const testUrl = url || settings.testUrl || 'http://cp.cloudflare.com/generate_204';
  const timeoutMs = settings.testTimeoutMs || 5000;
  return SpeedTestRunner.testLatency(
    testUrl,
    timeoutMs,
    settings.mixedPort,
    nodeId,
    settings.clashApiPort || 9090
  );
});
ipcMain.handle('speedtest:download', (_, url, nodeId) => {
  const settings = Database.getInstance().getSettings();
  const downloadUrl = url || 'http://speed.cloudflare.com/__down?bytes=5000000';
  return SpeedTestRunner.testDownload(
    downloadUrl,
    4,
    settings.mixedPort,
    nodeId,
    settings.clashApiPort || 9090
  );
});
ipcMain.handle('speedtest:cancel', () => SpeedTestRunner.cancel());

// WebDAV
ipcMain.handle('webdav:test', async (_, cfg) => {
  const client = new WebDAVClient(cfg.serverUrl, cfg.username, cfg.password);
  return client.testConnection();
});
ipcMain.handle('webdav:backup', async () => {
  const db = Database.getInstance();
  const settings = db.getSettings();
  const cfg = settings.webdav;
  if (!cfg.serverUrl) throw new Error('WebDAV server not configured');

  const client = new WebDAVClient(cfg.serverUrl, cfg.username, cfg.password);
  await client.createDir(cfg.remotePath || 'OwnBox');

  const content = BackupMigrator.exportOwnBoxBackup(
    db.getNodes(),
    db.getSubscriptions(),
    db.getRules(),
    db.getAppRules(),
    db.getDns(),
    settings
  );

  const filename = `${cfg.remotePath || 'OwnBox'}/ownbox_backup_${Date.now()}.ownboxbackup`;
  const success = await client.upload(filename, content);
  if (success) {
    cfg.lastSyncTime = Date.now();
    db.saveSettings({ webdav: cfg });
  }
  return success;
});
ipcMain.handle('webdav:restore', async () => {
  const db = Database.getInstance();
  const cfg = db.getSettings().webdav;
  if (!cfg.serverUrl) throw new Error('WebDAV server not configured');
  const client = new WebDAVClient(cfg.serverUrl, cfg.username, cfg.password);
  const content = await client.download(`${cfg.remotePath || 'OwnBox'}/latest.ownboxbackup`);
  const data = BackupMigrator.importBackup(content);
  if (data.nodes) db.saveNodes(data.nodes);
  if (data.subscriptions) db.saveSubscriptions(data.subscriptions);
  if (data.routing?.rules) db.saveRules(data.routing.rules);
  if (data.routing?.appRules) db.saveAppRules(data.routing.appRules);
  if (data.dns) db.saveDns(data.dns);
  return true;
});

// Backup
ipcMain.handle('backup:export', () => {
  const db = Database.getInstance();
  return BackupMigrator.exportOwnBoxBackup(
    db.getNodes(),
    db.getSubscriptions(),
    db.getRules(),
    db.getAppRules(),
    db.getDns(),
    db.getSettings()
  );
});
ipcMain.handle('backup:import', (_, content) => {
  const db = Database.getInstance();
  const data = BackupMigrator.importBackup(content);
  if (data.nodes) db.saveNodes(data.nodes);
  if (data.subscriptions) db.saveSubscriptions(data.subscriptions);
  if (data.routing?.rules) db.saveRules(data.routing.rules);
  if (data.routing?.appRules) db.saveAppRules(data.routing.appRules);
  if (data.dns) db.saveDns(data.dns);
  return true;
});
ipcMain.handle('backup:importLinks', (_, text) => {
  const nodes = BackupMigrator.parseNodeLinks(text);
  if (nodes.length > 0) {
    const db = Database.getInstance();
    db.saveNodes([...db.getNodes(), ...nodes]);
  }
  return nodes;
});

// Settings
ipcMain.handle('settings:get', () => Database.getInstance().getSettings());
ipcMain.handle('settings:save', async (_, s) => {
  const db = Database.getInstance();
  db.saveSettings(s);
  const currentSettings = db.getSettings();

  // 1. Windows Startup
  if (s.startOnBoot !== undefined) {
    try {
      app.setLoginItemSettings({
        openAtLogin: !!s.startOnBoot,
        path: process.execPath,
      });
    } catch (e) {
      console.warn('Failed to set login item settings:', e);
    }
  }

  // 2. System Proxy sync
  const core = SingBoxManager.getInstance();
  if (
    s.systemProxyEnabled !== undefined ||
    s.mixedPort !== undefined ||
    s.systemProxyBypassLan !== undefined ||
    s.customBypassList !== undefined
  ) {
    if (currentSettings.systemProxyEnabled && core.getState() === 'running') {
      await SystemProxy.enable(
        '127.0.0.1',
        currentSettings.mixedPort,
        currentSettings.systemProxyBypassLan,
        currentSettings.customBypassList
      );
    } else if (!currentSettings.systemProxyEnabled) {
      await SystemProxy.disable();
    }
  }

  // 3. Core dynamic reload if running
  if (core.getState() === 'running') {
    await handleCoreStart();
  }

  TrayManager.getInstance().updateMenu();
  return true;
});

ipcMain.handle('settings:resetDefaults', async () => {
  const db = Database.getInstance();
  const newSettings = db.resetSettings();
  const core = SingBoxManager.getInstance();
  if (core.getState() === 'running') {
    await handleCoreStart();
  }
  TrayManager.getInstance().updateMenu();
  return newSettings;
});
