import { exec } from 'child_process';
import { promisify } from 'util';
import { InstalledAppInfo } from '../../types';

const execAsync = promisify(exec);

export class ProcessScanner {
  // Preset popular apps for quick one-click routing
  public static PRESET_APPS: InstalledAppInfo[] = [
    { name: 'Google Chrome', exePath: 'chrome.exe' },
    { name: 'Microsoft Edge', exePath: 'msedge.exe' },
    { name: 'Mozilla Firefox', exePath: 'firefox.exe' },
    { name: 'Telegram Desktop', exePath: 'Telegram.exe' },
    { name: 'Discord', exePath: 'Discord.exe' },
    { name: 'Steam Client', exePath: 'steam.exe' },
    { name: 'Epic Games Launcher', exePath: 'EpicGamesLauncher.exe' },
    { name: 'Spotify Music', exePath: 'Spotify.exe' },
    { name: 'Visual Studio Code', exePath: 'Code.exe' },
    { name: 'Git for Windows', exePath: 'git.exe' },
    { name: 'GitHub Desktop', exePath: 'GitHubDesktop.exe' },
    { name: 'Obsidian', exePath: 'Obsidian.exe' },
    { name: 'Notion', exePath: 'Notion.exe' },
  ];

  public static async getRunningProcesses(): Promise<InstalledAppInfo[]> {
    try {
      const psCommand = `Get-Process | Where-Object { $_.MainWindowTitle -ne '' -or $_.Path -ne $null } | Select-Object -Unique ProcessName, Path | ConvertTo-Json -Compress`;
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${psCommand}"`);
      if (!stdout || stdout.trim() === '') return this.PRESET_APPS;

      const raw = JSON.parse(stdout);
      const list = Array.isArray(raw) ? raw : [raw];
      const results: InstalledAppInfo[] = [];

      for (const item of list) {
        if (item.ProcessName) {
          const exe = item.ProcessName.endsWith('.exe') ? item.ProcessName : `${item.ProcessName}.exe`;
          results.push({
            name: item.ProcessName,
            exePath: item.Path || exe,
          });
        }
      }

      // Merge with presets
      for (const preset of this.PRESET_APPS) {
        if (!results.some((r) => r.name.toLowerCase() === preset.name.toLowerCase())) {
          results.push(preset);
        }
      }

      return results;
    } catch {
      return this.PRESET_APPS;
    }
  }
}
