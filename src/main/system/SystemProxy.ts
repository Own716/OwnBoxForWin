import { exec } from 'child_process';
import { promisify } from 'util';
import { LogManager } from '../log/LogManager';

const execAsync = promisify(exec);

export interface ProxySnapshot {
  enabled: boolean;
  server?: string;
  override?: string;
}

export class SystemProxy {
  private static REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
  private static originalSnapshot: ProxySnapshot | null = null;
  private static isOwnBoxEnabled = false;

  /**
   * Capture initial Windows system proxy configuration before OwnBox modifies it
   */
  public static async captureOriginalSnapshot(): Promise<void> {
    if (this.originalSnapshot !== null) return;
    try {
      const status = await this.getFullRegistryStatus();
      this.originalSnapshot = status;
      LogManager.getInstance().addLog(
        'info',
        `已记录系统原始代理状态 (启用: ${status.enabled ? '是' : '否'}${status.server ? `, 服务器: ${status.server}` : ''})`,
        'system'
      );
    } catch (e: any) {
      this.originalSnapshot = { enabled: false };
      LogManager.getInstance().addLog('warn', `查询初始系统代理状态失败: ${e.message}`, 'system');
    }
  }

  public static async enable(
    host: string = '127.0.0.1',
    port: number = 2080,
    bypassLan: boolean = true,
    customBypassList?: string
  ): Promise<boolean> {
    try {
      // Ensure we capture user's original proxy before first override
      await this.captureOriginalSnapshot();

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

      await execAsync(
        `reg add "${this.REG_PATH}" /v ProxyEnable /t REG_DWORD /d 1 /f`
      );
      await execAsync(
        `reg add "${this.REG_PATH}" /v ProxyServer /t REG_SZ /d "${proxyServer}" /f`
      );
      await execAsync(
        `reg add "${this.REG_PATH}" /v ProxyOverride /t REG_SZ /d "${bypassList}" /f`
      );

      // Refresh system WinINet settings
      await this.refreshWinINet();
      this.isOwnBoxEnabled = true;
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

  public static async disable(): Promise<boolean> {
    try {
      await execAsync(
        `reg add "${this.REG_PATH}" /v ProxyEnable /t REG_DWORD /d 0 /f`
      );
      await this.refreshWinINet();
      this.isOwnBoxEnabled = false;
      LogManager.getInstance().addLog('info', 'Windows 系统代理已关闭', 'system');
      return true;
    } catch (e: any) {
      LogManager.getInstance().addLog('error', `关闭系统代理失败: ${e.message}`, 'system');
      return false;
    }
  }

  /**
   * Restore user's original proxy configuration upon quitting OwnBox
   */
  public static async restoreOriginal(): Promise<void> {
    if (!this.originalSnapshot) {
      // If no snapshot was recorded, simply ensure proxy is disabled
      await this.disable();
      return;
    }

    try {
      if (this.originalSnapshot.enabled) {
        await execAsync(`reg add "${this.REG_PATH}" /v ProxyEnable /t REG_DWORD /d 1 /f`);
        if (this.originalSnapshot.server) {
          await execAsync(`reg add "${this.REG_PATH}" /v ProxyServer /t REG_SZ /d "${this.originalSnapshot.server}" /f`);
        }
        if (this.originalSnapshot.override) {
          await execAsync(`reg add "${this.REG_PATH}" /v ProxyOverride /t REG_SZ /d "${this.originalSnapshot.override}" /f`);
        }
        LogManager.getInstance().addLog(
          'info',
          `已恢复系统原始代理配置 (启用: 是, 服务器: ${this.originalSnapshot.server || '无'})`,
          'system'
        );
      } else {
        await execAsync(`reg add "${this.REG_PATH}" /v ProxyEnable /t REG_DWORD /d 0 /f`);
        LogManager.getInstance().addLog('info', '已恢复系统原始代理配置 (启用: 否)', 'system');
      }
      await this.refreshWinINet();
    } catch (e: any) {
      LogManager.getInstance().addLog('warn', `恢复系统原始代理失败: ${e.message}`, 'system');
    }
  }

  public static async getStatus(): Promise<{ enabled: boolean; server?: string }> {
    try {
      const { stdout } = await execAsync(`reg query "${this.REG_PATH}" /v ProxyEnable`);
      const enabled = stdout.includes('0x1');
      let server: string | undefined;
      if (enabled) {
        const { stdout: serverOut } = await execAsync(`reg query "${this.REG_PATH}" /v ProxyServer`);
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
      const { stdout: enableOut } = await execAsync(`reg query "${this.REG_PATH}" /v ProxyEnable`);
      enabled = enableOut.includes('0x1');
    } catch {}

    try {
      const { stdout: serverOut } = await execAsync(`reg query "${this.REG_PATH}" /v ProxyServer`);
      const match = serverOut.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/);
      if (match) server = match[1].trim();
    } catch {}

    try {
      const { stdout: overrideOut } = await execAsync(`reg query "${this.REG_PATH}" /v ProxyOverride`);
      const match = overrideOut.match(/ProxyOverride\s+REG_SZ\s+([^\r\n]+)/);
      if (match) override = match[1].trim();
    } catch {}

    return { enabled, server, override };
  }

  private static async refreshWinINet(): Promise<void> {
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
      await execAsync(`powershell -NoProfile -WindowStyle Hidden -Command "${notifyScript.replace(/\r?\n/g, ' ')}"`, {
        windowsHide: true,
      });
    } catch {
      // Ignore if powershell call times out, registry is already changed
    }
  }
}
