import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import path from 'path';
import { Database } from '../db/Database';
import { SingBoxManager } from '../core/SingBoxManager';
import { SystemProxy } from '../system/SystemProxy';
import { ConfigGenerator } from '../core/ConfigGenerator';

export class TrayManager {
  private static instance: TrayManager;
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;

  private constructor() {}

  public static getInstance(): TrayManager {
    if (!TrayManager.instance) {
      TrayManager.instance = new TrayManager();
    }
    return TrayManager.instance;
  }

  public init(window: BrowserWindow): void {
    this.mainWindow = window;

    const iconPath = path.join(__dirname, '../../src/renderer/assets/tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

    this.tray = new Tray(icon);
    this.tray.setToolTip('OwnBox - 未连接');

    this.tray.on('click', () => {
      this.toggleWindow();
    });

    this.updateMenu();
  }

  public toggleWindow(): void {
    if (!this.mainWindow) return;
    if (this.mainWindow.isVisible()) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
        this.mainWindow.focus();
      } else if (this.mainWindow.isFocused()) {
        this.mainWindow.hide();
      } else {
        this.mainWindow.focus();
      }
    } else {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  public updateMenu(): void {
    if (!this.tray) return;

    const db = Database.getInstance();
    const core = SingBoxManager.getInstance();
    const nodes = db.getNodes();
    const activeNodeId = db.getActiveNodeId();
    const activeNode = nodes.find((n) => n.id === activeNodeId) || nodes[0];
    const settings = db.getSettings();
    const isRunning = core.getState() === 'running';

    this.tray.setToolTip(
      isRunning ? `OwnBox - 已连接: ${activeNode?.name || '未知'}` : 'OwnBox - 未连接'
    );

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `OwnBox v1.0.0 (${isRunning ? '● 已连接' : '○ 未连接'})`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: isRunning ? '断开连接' : '立即连接',
        click: async () => {
          if (isRunning) {
            await core.stop();
            if (settings.systemProxyEnabled) {
              await SystemProxy.disable();
            }
          } else {
            const config = ConfigGenerator.generate(
              activeNodeId,
              nodes,
              db.getRules(),
              db.getAppRules(),
              db.getDns(),
              settings
            );
            const started = await core.start(config);
            if (started && settings.systemProxyEnabled) {
              await SystemProxy.enable('127.0.0.1', settings.mixedPort, settings.systemProxyBypassLan);
            }
          }
          this.updateMenu();
          this.mainWindow?.webContents.send('core:stateChange', core.getState());
        },
      },
      {
        label: `当前节点: ${activeNode?.name || '无'}`,
        submenu: nodes.map((n) => ({
          label: `${n.name} (${n.type.toUpperCase()})`,
          type: 'radio',
          checked: n.id === activeNodeId,
          click: async () => {
            db.setActiveNodeId(n.id);
            if (core.getState() === 'running') {
              const config = ConfigGenerator.generate(
                n.id,
                nodes,
                db.getRules(),
                db.getAppRules(),
                db.getDns(),
                settings
              );
              await core.start(config);
            }
            this.updateMenu();
            this.mainWindow?.webContents.send('node:changed', n.id);
          },
        })),
      },
      { type: 'separator' },
      {
        label: '系统代理',
        type: 'checkbox',
        checked: settings.systemProxyEnabled,
        click: async () => {
          const newState = !settings.systemProxyEnabled;
          db.saveSettings({ systemProxyEnabled: newState });
          if (core.getState() === 'running') {
            if (newState) {
              await SystemProxy.enable('127.0.0.1', settings.mixedPort, settings.systemProxyBypassLan);
            } else {
              await SystemProxy.disable();
            }
          }
          this.updateMenu();
          this.mainWindow?.webContents.send('settings:changed', db.getSettings());
        },
      },
      {
        label: 'TUN 模式 (虚拟网卡)',
        type: 'checkbox',
        checked: settings.tunEnabled,
        click: async () => {
          const newState = !settings.tunEnabled;
          db.saveSettings({ tunEnabled: newState });
          if (core.getState() === 'running') {
            const config = ConfigGenerator.generate(
              activeNodeId,
              nodes,
              db.getRules(),
              db.getAppRules(),
              db.getDns(),
              { ...settings, tunEnabled: newState }
            );
            await core.start(config);
          }
          this.updateMenu();
          this.mainWindow?.webContents.send('settings:changed', db.getSettings());
        },
      },
      { type: 'separator' },
      {
        label: '打开主界面',
        click: () => {
          this.mainWindow?.show();
          this.mainWindow?.focus();
        },
      },
      {
        label: '退出 OwnBox',
        click: async () => {
          await core.stop();
          await SystemProxy.disable();
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
