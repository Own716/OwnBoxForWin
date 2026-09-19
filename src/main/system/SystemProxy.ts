import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class SystemProxy {
  private static REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

  public static async enable(
    host: string = '127.0.0.1',
    port: number = 2080,
    bypassLan: boolean = true,
    customBypassList?: string
  ): Promise<boolean> {
    try {
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

      // Refresh system internet settings
      await this.refreshWinINet();
      return true;
    } catch (e) {
      console.error('Failed to enable system proxy:', e);
      return false;
    }
  }

  public static async disable(): Promise<boolean> {
    try {
      await execAsync(
        `reg add "${this.REG_PATH}" /v ProxyEnable /t REG_DWORD /d 0 /f`
      );
      await this.refreshWinINet();
      return true;
    } catch (e) {
      console.error('Failed to disable system proxy:', e);
      return false;
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
      await execAsync(`powershell -NoProfile -Command "${notifyScript.replace(/\r?\n/g, ' ')}"`);
    } catch {
      // Ignore if powershell call times out, registry is already changed
    }
  }
}
