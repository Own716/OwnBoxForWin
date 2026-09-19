import fs from 'fs';
import path from 'path';
import { BrowserWindow } from 'electron';
import { LogEntry } from '../../types';

export class LogManager {
  private static instance: LogManager;
  private logBuffer: LogEntry[] = [];
  private readonly maxBufferSize = 1000;
  private logDir: string;
  private logFilePath: string;
  private mainWindow: BrowserWindow | null = null;

  private constructor() {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Roaming');
    this.logDir = path.join(appData, 'OwnBox', 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    this.logFilePath = path.join(this.logDir, 'ownbox.log');

    // Add initial log
    this.addLog('info', 'OwnBox 日志系统已初始化就绪', 'app');
  }

  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }

  public setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window;
  }

  public addLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, source: 'core' | 'app' | 'system' = 'app') {
    const timestamp = new Date().toLocaleTimeString();
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp,
      level,
      message,
      source,
    };

    // 1. In-memory buffer
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }

    // 2. Append to disk log file
    try {
      const line = `[${new Date().toISOString()}] [${source.toUpperCase()}] [${level.toUpperCase()}] ${message}\n`;
      fs.appendFileSync(this.logFilePath, line, 'utf8');
    } catch {
      // Ignore disk write errors
    }

    // 3. Broadcast to frontend if renderer is alive
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('core:log', entry);
      } catch {
        // Ignore send errors
      }
    }
  }

  public getLogs(): LogEntry[] {
    return [...this.logBuffer];
  }

  public clearLogs() {
    this.logBuffer = [];
    try {
      if (fs.existsSync(this.logFilePath)) {
        fs.writeFileSync(this.logFilePath, '', 'utf8');
      }
    } catch {}
    this.addLog('info', '日志已清空', 'app');
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }
}
