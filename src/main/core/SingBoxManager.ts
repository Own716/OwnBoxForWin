import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { CoreState } from '../../types';

export function isRunningAsAdmin(): boolean {
  if (process.platform !== 'win32') return true;
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export class SingBoxManager extends EventEmitter {
  private static instance: SingBoxManager;
  private process: ChildProcess | null = null;
  private state: CoreState = 'stopped';
  private configPath: string;
  private binaryPath: string;

  private constructor() {
    super();
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Roaming');
    const ownBoxDir = path.join(appData, 'OwnBox');
    if (!fs.existsSync(ownBoxDir)) {
      fs.mkdirSync(ownBoxDir, { recursive: true });
    }

    this.configPath = path.join(ownBoxDir, 'config.json');
    this.binaryPath = this.locateBinary();
  }

  private locateBinary(): string {
    const candidates = [
      path.join(process.resourcesPath || '', 'bin', 'sing-box.exe'),
      path.join(path.dirname(process.execPath || ''), 'resources', 'bin', 'sing-box.exe'),
      path.join(path.dirname(process.execPath || ''), 'bin', 'sing-box.exe'),
      path.join(__dirname, '../../bin/sing-box.exe'),
      path.join(process.cwd(), 'bin', 'sing-box.exe'),
    ];

    for (const p of candidates) {
      if (p && fs.existsSync(p)) {
        return path.resolve(p);
      }
    }
    return path.resolve(process.cwd(), 'bin', 'sing-box.exe');
  }

  public static getInstance(): SingBoxManager {
    if (!SingBoxManager.instance) {
      SingBoxManager.instance = new SingBoxManager();
    }
    return SingBoxManager.instance;
  }

  public getState(): CoreState {
    return this.state;
  }

  public getPid(): number | undefined {
    return this.process?.pid;
  }

  public isAdmin(): boolean {
    return isRunningAsAdmin();
  }

  public getLiveConfig(): string {
    try {
      if (fs.existsSync(this.configPath)) {
        return fs.readFileSync(this.configPath, 'utf8');
      }
    } catch {}
    return '{}';
  }

  public async getVersion(): Promise<string> {
    return new Promise((resolve) => {
      try {
        const proc = spawn(this.binaryPath, ['version']);
        let output = '';
        proc.stdout?.on('data', (d) => (output += d.toString()));
        proc.on('close', () => {
          const match = output.match(/sing-box version ([^\s\n]+)/i);
          resolve(match ? match[1] : '1.15.0-alpha.6');
        });
        proc.on('error', () => resolve('1.15.0-alpha.6'));
      } catch {
        resolve('1.15.0-alpha.6');
      }
    });
  }

  public async validate(config: Record<string, any>): Promise<{ valid: boolean; error?: string }> {
    const testConfigPath = `${this.configPath}.test.json`;
    try {
      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2), 'utf8');
      return new Promise((resolve) => {
        const proc = spawn(this.binaryPath, ['check', '-c', testConfigPath]);
        let stderr = '';
        proc.stderr?.on('data', (d) => (stderr += d.toString()));
        proc.on('close', (code) => {
          try { fs.unlinkSync(testConfigPath); } catch {}
          if (code === 0) {
            resolve({ valid: true });
          } else {
            resolve({ valid: false, error: stderr.trim() });
          }
        });
        proc.on('error', (err) => {
          try { fs.unlinkSync(testConfigPath); } catch {}
          resolve({ valid: false, error: err.message });
        });
      });
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }

  public async start(config: Record<string, any>): Promise<boolean> {
    if (this.state === 'running' || this.state === 'starting') {
      await this.stop();
    }

    this.setState('starting');

    try {
      // Safety Check: If TUN mode is in config but not elevated, gracefully remove it to prevent fatal crash
      const admin = this.isAdmin();
      if (!admin && config.inbounds) {
        const hasTun = config.inbounds.some((i: any) => i.type === 'tun');
        if (hasTun) {
          config.inbounds = config.inbounds.filter((i: any) => i.type !== 'tun');
          this.emit('log', {
            id: Math.random().toString(36).substring(2),
            timestamp: new Date().toLocaleTimeString(),
            level: 'warn',
            message: '【权限保护】检测到当前以普通用户权限运行，已安全回退为系统代理模式（可在设置中以管理员身份重启启用 TUN 全局网卡）。',
            source: 'system',
          });
        }
      }

      // Check config syntax before launching
      const validation = await this.validate(config);
      if (!validation.valid) {
        this.emit('log', {
          id: Math.random().toString(36).substring(2),
          timestamp: new Date().toLocaleTimeString(),
          level: 'error',
          message: `配置校验失败: ${validation.error}`,
          source: 'core',
        });
        this.setState('error');
        return false;
      }

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');

      const workingDir = path.dirname(this.binaryPath);
      this.process = spawn(this.binaryPath, ['run', '-c', this.configPath], {
        cwd: workingDir,
        windowsHide: true,
      });

      this.process.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            this.emit('log', {
              id: Math.random().toString(36).substring(2),
              timestamp: new Date().toLocaleTimeString(),
              level: line.toLowerCase().includes('error') ? 'error' : 'info',
              message: line.trim(),
              source: 'core',
            });
          }
        }
      });

      this.process.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            let level: 'error' | 'warn' | 'info' = 'info';
            if (/\b(fatal|panic)\b/i.test(trimmed) || (/\berror\b/i.test(trimmed) && !/\bnoerror\b/i.test(trimmed))) {
              level = 'error';
            } else if (/\b(warn|warning)\b/i.test(trimmed)) {
              level = 'warn';
            }
            this.emit('log', {
              id: Math.random().toString(36).substring(2),
              timestamp: new Date().toLocaleTimeString(),
              level,
              message: trimmed,
              source: 'core',
            });
          }
        }
      });

      this.process.on('error', (err) => {
        this.emit('log', {
          id: Math.random().toString(36).substring(2),
          timestamp: new Date().toLocaleTimeString(),
          level: 'error',
          message: `内核启动失败: ${err.message}`,
          source: 'core',
        });
        this.setState('error');
      });

      this.process.on('close', (code) => {
        this.emit('log', {
          id: Math.random().toString(36).substring(2),
          timestamp: new Date().toLocaleTimeString(),
          level: code === 0 ? 'info' : 'warn',
          message: `Sing-box 核心进程已停止 (退出码: ${code})`,
          source: 'core',
        });
        this.process = null;
        if (this.state !== 'stopping') {
          this.setState('stopped');
        }
      });

      // Brief delay to verify process didn't immediately exit
      await new Promise((resolve) => setTimeout(resolve, 800));

      if (this.process && !this.process.killed) {
        this.setState('running');
        this.emit('log', {
          id: Math.random().toString(36).substring(2),
          timestamp: new Date().toLocaleTimeString(),
          level: 'info',
          message: `OwnBox 核心引擎启动成功 (PID: ${this.process.pid})`,
          source: 'core',
        });
        return true;
      } else {
        this.setState('error');
        return false;
      }
    } catch (e: any) {
      this.emit('log', {
        id: Math.random().toString(36).substring(2),
        timestamp: new Date().toLocaleTimeString(),
        level: 'error',
        message: `启动异常: ${e.message}`,
        source: 'core',
      });
      this.setState('error');
      return false;
    }
  }

  public async stop(): Promise<void> {
    if (!this.process || this.state === 'stopped') {
      this.setState('stopped');
      return;
    }

    this.setState('stopping');

    return new Promise((resolve) => {
      const pid = this.process?.pid;
      if (pid) {
        try {
          spawn('taskkill', ['/F', '/T', '/PID', pid.toString()]);
        } catch {
          this.process?.kill();
        }
      }

      const checkInterval = setInterval(() => {
        if (!this.process) {
          clearInterval(checkInterval);
          this.setState('stopped');
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        this.process = null;
        this.setState('stopped');
        resolve();
      }, 2000);
    });
  }

  private setState(state: CoreState) {
    this.state = state;
    this.emit('stateChange', state);
  }
}
