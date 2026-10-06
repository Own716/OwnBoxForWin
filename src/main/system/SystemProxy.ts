import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { LogManager } from '../log/LogManager';

export interface ProxySnapshot {
  enabled: boolean;
  server?: string;
  override?: string;
}

interface OwnershipState {
  managedByOwnBox: boolean;
  managedServer?: string;
  originalSnapshot: ProxySnapshot;
  updatedAt: number;
}

export class SystemProxy {
  private static REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
  private static stateFile: string = '';

  private static getStateFilePath(): string {
    if (!this.stateFile) {
      const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Roaming');
      const ownBoxDir = path.join(appData, 'OwnBox');
      if (!fs.existsSync(ownBoxDir)) {
        fs.mkdirSync(ownBoxDir, { recursive: true });
      }
      this.stateFile = path.join(ownBoxDir, 'proxy_ownership.json');
    }
    return this.stateFile;
  }

  private static loadOwnership(): OwnershipState | null {
    try {
      const p = this.getStateFilePath();
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch {}
    return null;
  }

  private static saveOwnership(state: OwnershipState | null) {
    try {
      const p = this.getStateFilePath();
      if (!state) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } else {
        fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf8');
      }
    } catch {}
  }

  /**
   * Safely execute reg.exe commands via parameterized spawn without cmd.exe shell expansion
   */
  private static execReg(args: string[]): Promise<{ stdout: string; code: number }> {
    return new Promise((resolve) => {
      try {
        const proc = spawn('reg.exe', args, { windowsHide: true });
        let stdout = '';
        proc.stdout?.on('data', (d) => (stdout += d.toString()));
        proc.on('close', (code) => resolve({ stdout, code: code || 0 }));
        proc.on('error', () => resolve({ stdout: '', code: -1 }));
      } catch {
        resolve({ stdout: '', code: -1 });
      }
    });
  }

  /**
   * Capture initial Windows system proxy configuration before OwnBox modifies it
   */
  public static async captureOriginalSnapshot(): Promise<ProxySnapshot> {
    const current = await this.getFullRegistryStatus();
    const existing = this.loadOwnership();

    if (!existing) {
      this.saveOwnership({
        managedByOwnBox: false,
        originalSnapshot: current,
        updatedAt: Date.now(),
      });
      LogManager.getInstance().addLog(
        'info',
        `已持久化记录系统原始代理状态 (启用: ${current.enabled ? '是' : '否'}${current.server ? `, 服务器: ${current.server}` : ''})`,
        'system'
      );
    }
    return existing ? existing.originalSnapshot : current;
  }

  /**
   * Enable Windows system proxy safely using parameterized calls
   */
  public static async enable(
    host: string = '127.0.0.1',
    port: number = 2080,
    bypassLan: boolean = true,
    customBypassList?: string
  ): Promise<boolean> {
    try {
      const original = await this.captureOriginalSnapshot();
      const proxyServer = `${host}:${port}`;

      let bypassList = bypassLan
        ? '<local>;localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*'
        : '<local>;localhost;127.*';

      if (customBypassList && customBypassList.trim()) {
        const customParts = customBypassList
          .split(/[\r\n,;]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (customParts.length > 0) {
          bypassList = `${bypassList};${customParts.join(';')}`;
        }
      }

      // Safe parameterized registry updates (No shell injection possible)
      await this.execReg(['add', this.REG_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f']);
      await this.execReg(['add', this.REG_KEY, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', proxyServer, '/f']);
      await this.execReg(['add', this.REG_KEY, '/v', 'ProxyOverride', '/t', 'REG_SZ', '/d', bypassList, '/f']);

      // Record ownership
      this.saveOwnership({
        managedByOwnBox: true,
        managedServer: proxyServer,
        originalSnapshot: original,
        updatedAt: Date.now(),
      });

      // Refresh system WinINet
      await this.refreshWinINet();
      LogManager.getInstance().addLog(
        'info',
        `Windows 系统代理已开启 (服务器: ${proxyServer})`,
        'system'
      );
      return true;
    } catch (e: any) {
      LogManager.getInstance().addLog('error', `开启系统代理失败: ${e.message}`, 'system');
      return false;
    }
  }

  /**
   * Disable Windows system proxy safely
   */
  public static async disable(): Promise<boolean> {
    try {
      await this.execReg(['add', this.REG_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f']);
      await this.refreshWinINet();

      const state = this.loadOwnership();
      if (state) {
        state.managedByOwnBox = false;
        this.saveOwnership(state);
      }

      LogManager.getInstance().addLog('info', 'Windows 系统代理已关闭', 'system');
      return true;
    } catch (e: any) {
      LogManager.getInstance().addLog('error', `关闭系统代理失败: ${e.message}`, 'system');
      return false;
    }
  }

  /**
   * Restore user's original proxy configuration upon quitting OwnBox with ownership verification
   */
  public static async restoreOriginal(): Promise<void> {
    const state = this.loadOwnership();
    if (!state) {
      await this.disable();
      return;
    }

    try {
      // 1. Check ownership: Verify current registry proxy server matches what OwnBox set
      const current = await this.getFullRegistryStatus();
      if (state.managedServer && current.server && current.server !== state.managedServer) {
        LogManager.getInstance().addLog(
          'warn',
          `检测到系统代理已被外部程序或用户手动修改为 "${current.server}"，取消强制还原以保护用户当前网络。`,
          'system'
        );
        this.saveOwnership(null);
        return;
      }

      // 2. Restore original snapshot
      const orig = state.originalSnapshot;
      if (orig && orig.enabled) {
        await this.execReg(['add', this.REG_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f']);
        if (orig.server) {
          await this.execReg(['add', this.REG_KEY, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', orig.server, '/f']);
        }
        if (orig.override) {
          await this.execReg(['add', this.REG_KEY, '/v', 'ProxyOverride', '/t', 'REG_SZ', '/d', orig.override, '/f']);
        }
        LogManager.getInstance().addLog(
          'info',
          `已恢复系统原始代理配置 (启用: 是, 服务器: ${orig.server || '无'})`,
          'system'
        );
      } else {
        await this.execReg(['add', this.REG_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f']);
        // If original had no ProxyServer, safely delete the key so no dead loopback stays
        if (!orig?.server) {
          await this.execReg(['delete', this.REG_KEY, '/v', 'ProxyServer', '/f']);
        }
        LogManager.getInstance().addLog('info', '已恢复系统原始代理配置 (启用: 否)', 'system');
      }

      await this.refreshWinINet();
      this.saveOwnership(null);
    } catch (e: any) {
      LogManager.getInstance().addLog('warn', `恢复系统原始代理失败: ${e.message}`, 'system');
    }
  }

  /**
   * Check for residual OwnBox proxy on startup (e.g. after crash or sudden reboot)
   */
  public static async checkAndCleanResidual(expectedPort: number = 2080): Promise<boolean> {
    try {
      const current = await this.getFullRegistryStatus();
      if (current.enabled && current.server && current.server.includes(`127.0.0.1:${expectedPort}`)) {
        LogManager.getInstance().addLog(
          'warn',
          `检测到上次异常退出残留的 OwnBox 系统代理配置 (127.0.0.1:${expectedPort})，正在自动安全重置...`,
          'system'
        );
        await this.restoreOriginal();
        return true;
      }
    } catch {}
    return false;
  }

  public static async getStatus(): Promise<{ enabled: boolean; server?: string }> {
    try {
      const { stdout } = await this.execReg(['query', this.REG_KEY, '/v', 'ProxyEnable']);
      const enabled = stdout.includes('0x1');
      let server: string | undefined;
      if (enabled) {
        const { stdout: serverOut } = await this.execReg(['query', this.REG_KEY, '/v', 'ProxyServer']);
        const match = serverOut.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/);
        if (match) server = match[1].trim();
      }
      return { enabled, server };
    } catch {
      return { enabled: false };
    }
  }

  private static async getFullRegistryStatus(): Promise<ProxySnapshot> {
    let enabled = false;
    let server: string | undefined;
    let override: string | undefined;

    try {
      const { stdout: enableOut } = await this.execReg(['query', this.REG_KEY, '/v', 'ProxyEnable']);
      enabled = enableOut.includes('0x1');
    } catch {}

    try {
      const { stdout: serverOut } = await this.execReg(['query', this.REG_KEY, '/v', 'ProxyServer']);
      const match = serverOut.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/);
      if (match) server = match[1].trim();
    } catch {}

    try {
      const { stdout: overrideOut } = await this.execReg(['query', this.REG_KEY, '/v', 'ProxyOverride']);
      const match = overrideOut.match(/ProxyOverride\s+REG_SZ\s+([^\r\n]+)/);
      if (match) override = match[1].trim();
    } catch {}

    return { enabled, server, override };
  }

  private static async refreshWinINet(): Promise<void> {
    return new Promise((resolve) => {
      // Refresh system WinINet via rundll32 inetsrv/wininet or powershell with short timeout
      const notifyScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinINet {
  [DllImport("wininet.dll", SetLastError = true)]
  public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
}
"@;
[WinINet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0);
[WinINet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0);
`;
      try {
        const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', notifyScript.replace(/\r?\n/g, ' ')], {
          windowsHide: true,
        });
        const timer = setTimeout(() => {
          proc.kill();
          resolve();
        }, 1200);
        proc.on('close', () => {
          clearTimeout(timer);
          resolve();
        });
        proc.on('error', () => {
          clearTimeout(timer);
          resolve();
        });
      } catch {
        resolve();
      }
    });
  }
}
