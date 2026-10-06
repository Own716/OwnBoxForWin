import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';
import http from 'http';
import { EventEmitter } from 'events';
import { CoreState } from '../../types';
import { LogManager } from '../log/LogManager';

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

  // Lifecycle concurrency mutex
  private mutex: Promise<void> = Promise.resolve();

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, source: 'core' | 'app' | 'system' | 'net' = 'core') {
    LogManager.getInstance().addLog(level, message, source);
  }

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
        if (!fs.existsSync(this.binaryPath)) {
          resolve('检测失败 (未找到核心文件)');
          return;
        }
        const proc = spawn(this.binaryPath, ['version']);
        let output = '';
        proc.stdout?.on('data', (d) => (output += d.toString()));
        proc.on('close', () => {
          const match = output.match(/sing-box version ([^\s\n]+)/i);
          if (match) {
            resolve(match[1]);
          } else {
            resolve('检测失败');
          }
        });
        proc.on('error', (err) => {
          LogManager.getInstance().addLog('warn', `获取核心版本异常: ${err.message}`, 'core');
          resolve('检测失败');
        });
      } catch (e: any) {
        LogManager.getInstance().addLog('warn', `获取核心版本失败: ${e.message}`, 'core');
        resolve('检测失败');
      }
    });
  }

  public killOrphans(): void {
    if (this.process?.pid) {
      try {
        execSync(`taskkill /F /T /PID ${this.process.pid}`, { stdio: 'ignore' });
      } catch {}
    }
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

  /**
   * Thread-safe Start with Port & API Readiness Probing
   */
  public async start(config: Record<string, any>): Promise<boolean> {
    return this.runWithMutex(async () => {
      if (this.state === 'running' || this.state === 'starting') {
        await this.stopInternal();
      }

      this.setState('starting');

      try {
        // Safety Check: If TUN mode is in config but not elevated, gracefully remove it to prevent fatal crash
        const admin = this.isAdmin();
        if (!admin && config.inbounds) {
          const hasTun = config.inbounds.some((i: any) => i.type === 'tun');
          if (hasTun) {
            config.inbounds = config.inbounds.filter((i: any) => i.type !== 'tun');
            this.log(
              'warn',
              '【权限保护】检测到当前以普通用户权限运行，已安全回退为系统代理模式（可在设置中以管理员身份重启启用 TUN 全局网卡）。',
              'system'
            );
          }
        }

        // Check config syntax before launching
        const validation = await this.validate(config);
        if (!validation.valid) {
          this.log('error', `配置校验失败: ${validation.error}`, 'core');
          this.setState('error');
          return false;
        }

        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');

        const workingDir = path.dirname(this.binaryPath);
        this.log('info', `正在拉起核心引擎进程: ${this.binaryPath}`, 'core');

        this.process = spawn(this.binaryPath, ['run', '-c', this.configPath], {
          cwd: workingDir,
          windowsHide: true,
        });

        this.process.stdout?.on('data', (data) => {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            if (line.trim()) {
              this.log(
                line.toLowerCase().includes('error') ? 'error' : 'info',
                line.trim(),
                'core'
              );
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
              this.log(level, trimmed, 'core');
            }
          }
        });

        this.process.on('error', (err) => {
          this.log('error', `内核进程异常: ${err.message}`, 'core');
          this.setState('error');
        });

        this.process.on('close', (code, signal) => {
          const wasRunning = this.state === 'running';
          this.log(
            code === 0 ? 'info' : 'warn',
            `Sing-box 核心进程已退出 (代码: ${code}, 信号: ${signal || '无'})`,
            'core'
          );
          this.process = null;

          if (this.state !== 'stopping') {
            if (wasRunning && code !== 0) {
              this.setState('crashed');
            } else {
              this.setState('stopped');
            }
          }
        });

        // Extract mixed port and clash API port for readiness check
        const mixedPort = config.inbounds?.find((i: any) => i.type === 'mixed')?.listen_port || 2080;
        const clashPort = config.experimental?.clash_api?.external_controller
          ? parseInt(config.experimental.clash_api.external_controller.split(':')[1], 10)
          : 9090;

        // Active readiness probing: verify mixed port and process health
        const isReady = await this.waitForReady(mixedPort, clashPort, 5000);
        if (isReady && this.process && !this.process.killed) {
          this.setState('running');
          this.log('info', `OwnBox 核心引擎启动成功 (PID: ${this.process.pid}, 监听端口: ${mixedPort})`, 'core');
          return true;
        } else {
          this.log('error', 'Sing-box 核心就绪超时或中途异常退出', 'core');
          await this.stopInternal();
          this.setState('error');
          return false;
        }
      } catch (e: any) {
        this.log('error', `启动异常: ${e.message}`, 'core');
        this.setState('error');
        return false;
      }
    });
  }

  /**
   * Thread-safe Stop with Graceful Termination & Resource Cleanup
   */
  public async stop(): Promise<void> {
    return this.runWithMutex(async () => {
      await this.stopInternal();
    });
  }

  private async stopInternal(): Promise<void> {
    if (!this.process && this.state === 'stopped') {
      return;
    }

    this.setState('stopping');
    this.log('info', '正在停止 Sing-box 核心进程...', 'core');
    const proc = this.process;
    const pid = proc?.pid;

    if (proc && pid) {
      try {
        // 1. Attempt graceful shutdown via SIGINT first (allows wintun & routes to unbind cleanly)
        proc.kill('SIGINT');
      } catch {}

      // Wait up to 1500ms for graceful exit
      const gracefulExit = await this.waitForExit(1500);

      // 2. Fallback to forced kill if not exited
      if (!gracefulExit && pid) {
        try {
          execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
        } catch {}
      }
    }

    this.process = null;
    this.setState('stopped');
    this.log('info', 'Sing-box 核心进程已安全停止', 'core');
  }

  private waitForExit(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (!this.process || Date.now() - start > timeoutMs) {
          clearInterval(interval);
          resolve(!this.process);
        }
      }, 50);
    });
  }

  /**
   * Probe TCP mixed-in port and Clash API readiness
   */
  private async waitForReady(mixedPort: number, clashPort: number, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (!this.process || this.process.killed) {
        return false;
      }

      // Check if mixed port is accepting connections
      const portOpen = await this.checkPortOpen('127.0.0.1', mixedPort);
      if (portOpen) {
        return true;
      }

      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  private checkPortOpen(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(250);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, host);
    });
  }

  private runWithMutex<T>(action: () => Promise<T>): Promise<T> {
    const next = this.mutex.then(action, action);
    this.mutex = next.then(() => {}, () => {});
    return next;
  }

  private setState(state: CoreState) {
    this.state = state;
    this.emit('stateChange', state);
  }
}
