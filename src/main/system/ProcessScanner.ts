import { spawn } from 'child_process';
import { InstalledAppInfo } from '../../types';

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
    { name: 'WeChat', exePath: 'WeChat.exe' },
    { name: 'QQ', exePath: 'QQ.exe' },
  ];

  public static getRunningProcesses(): Promise<InstalledAppInfo[]> {
    return new Promise((resolve) => {
      // If running on non-Windows environment (e.g. testing), return presets
      if (process.platform !== 'win32') {
        return resolve(this.PRESET_APPS);
      }

      const script = [
        '$ErrorActionPreference = "SilentlyContinue"',
        'Get-Process | Where-Object { $_.MainWindowTitle -ne "" -or $_.Path -ne $null } | ForEach-Object {',
        '  $p = ""',
        '  try { $p = $_.Path } catch {}',
        '  [PSCustomObject]@{',
        '    ProcessName = $_.ProcessName',
        '    Path = $p',
        '    Title = $_.MainWindowTitle',
        '  }',
        '} | Select-Object -Unique ProcessName, Path, Title | ConvertTo-Json -Compress',
      ].join(';\n');

      let stdout = '';
      let resolved = false;

      const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true,
      });

      const finish = (result: InstalledAppInfo[]) => {
        if (resolved) return;
        resolved = true;
        try {
          ps.kill();
        } catch {}
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish(this.PRESET_APPS);
      }, 4000);

      ps.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });

      ps.on('close', () => {
        clearTimeout(timer);
        if (resolved) return;

        try {
          if (!stdout.trim()) {
            return finish(this.PRESET_APPS);
          }

          const raw = JSON.parse(stdout.trim());
          const list = Array.isArray(raw) ? raw : [raw];
          const results: InstalledAppInfo[] = [];

          for (const item of list) {
            if (item && item.ProcessName) {
              const exe = item.ProcessName.endsWith('.exe') ? item.ProcessName : `${item.ProcessName}.exe`;
              const displayName = item.Title ? `${item.ProcessName} (${item.Title.slice(0, 30)})` : item.ProcessName;
              results.push({
                name: displayName,
                exePath: item.Path || exe,
              });
            }
          }

          // Merge presets that are not already present
          for (const preset of this.PRESET_APPS) {
            const exeBase = preset.exePath.toLowerCase();
            if (!results.some((r) => r.exePath.toLowerCase().endsWith(exeBase))) {
              results.push(preset);
            }
          }

          finish(results);
        } catch {
          finish(this.PRESET_APPS);
        }
      });

      ps.on('error', () => {
        clearTimeout(timer);
        finish(this.PRESET_APPS);
      });
    });
  }
}
