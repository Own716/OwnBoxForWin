/**
 * BackupService.ts
 * Central facade orchestrating preview, import, export, and local overwrite backups.
 */

import path from 'path';
import fs from 'fs';
import { Database } from '../Database';
import { BackupValidator } from './BackupValidator';
import { WindowsBackupCodec } from './WindowsBackupCodec';
import { AndroidBackupDecoder } from './AndroidBackupDecoder';
import { AndroidBackupEncoder } from './AndroidBackupEncoder';
import { BackupPreview, RawParsedBackupData } from './BackupPreview';
import { BackupTransaction } from './BackupTransaction';
import { UniversalSubscriptionParser } from '../../net/UniversalSubscriptionParser';
import {
  BackupCategories,
  BackupPreviewResult,
  BackupImportResult,
  ProxyNode,
} from '../../../types';

export class BackupService {
  private static getLocalBackupPath(): string {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Roaming');
    const dataDir = path.join(appData, 'OwnBox');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, 'OwnBox_latest.ownboxbackup');
  }

  /**
   * Generates non-destructive dry-run preview from raw content.
   */
  public static async previewImport(
    content: string,
    categories?: Partial<BackupCategories>
  ): Promise<BackupPreviewResult> {
    const db = Database.getInstance();
    const current = {
      nodes: db.getNodes(),
      subscriptions: db.getSubscriptions(),
      rules: db.getRules(),
      appRules: db.getAppRules(),
      settings: db.getSettings(),
    };

    const parsedData = this.parseRawContent(content);
    return BackupPreview.generatePreview(parsedData, current, categories);
  }

  /**
   * Imports data with atomic transaction, category filtering, and pre-import snapshot.
   */
  public static async importWithTransaction(
    content: string,
    categories: BackupCategories = { profiles: true, rules: true, settings: true },
    mode: 'merge' | 'replace' = 'merge'
  ): Promise<BackupImportResult> {
    const parsed = this.parseRawContent(content);

    return BackupTransaction.execute(
      {
        nodes: parsed.nodes,
        subscriptions: parsed.subscriptions,
        rules: parsed.rules,
        appRules: parsed.appRules,
        settings: parsed.settings,
      },
      categories,
      mode
    );
  }

  /**
   * Exports native Windows backup file content (.ownboxbackup).
   */
  public static async exportWindowsBackup(
    categories: BackupCategories = { profiles: true, rules: true, settings: true }
  ): Promise<string> {
    const db = Database.getInstance();
    return WindowsBackupCodec.encode(
      db.getNodes(),
      db.getSubscriptions(),
      db.getRules(),
      db.getAppRules(),
      db.getDns(),
      db.getSettings(),
      categories
    );
  }

  /**
   * Exports Android compatible backup file content (.json).
   */
  public static async exportAndroidBackup(
    categories: BackupCategories = { profiles: true, rules: true, settings: true }
  ): Promise<string> {
    const db = Database.getInstance();
    return AndroidBackupEncoder.encode(
      db.getNodes(),
      db.getSubscriptions(),
      db.getRules(),
      db.getSettings(),
      categories
    );
  }

  /**
   * Maintains local automatic overwrite backup: OwnBox_latest.ownboxbackup and .bak.
   */
  public static async createLocalBackup(): Promise<{ success: boolean; filePath: string }> {
    const targetPath = this.getLocalBackupPath();
    const tmpPath = `${targetPath}.tmp`;
    const bakPath = `${targetPath}.bak`;

    const db = Database.getInstance();
    const content = WindowsBackupCodec.encode(
      db.getNodes(),
      db.getSubscriptions(),
      db.getRules(),
      db.getAppRules(),
      db.getDns(),
      db.getSettings(),
      { profiles: true, rules: true, settings: true }
    );

    fs.writeFileSync(tmpPath, content, 'utf8');

    if (fs.existsSync(targetPath)) {
      try {
        fs.copyFileSync(targetPath, bakPath);
      } catch {}
    }

    fs.renameSync(tmpPath, targetPath);
    return { success: true, filePath: targetPath };
  }

  /**
   * Restores from local latest backup.
   */
  public static async restoreLocalBackup(): Promise<BackupImportResult> {
    const targetPath = this.getLocalBackupPath();
    if (!fs.existsSync(targetPath)) {
      throw new Error('未找到本地备份文件 (OwnBox_latest.ownboxbackup)');
    }
    const content = fs.readFileSync(targetPath, 'utf8');
    return this.importWithTransaction(content, { profiles: true, rules: true, settings: true }, 'replace');
  }

  /**
   * Returns information about the latest local overwrite backup.
   */
  public static async getLatestLocalBackupInfo(): Promise<{
    exists: boolean;
    timestamp?: number;
    size?: number;
    filePath?: string;
  }> {
    const targetPath = this.getLocalBackupPath();
    if (!fs.existsSync(targetPath)) {
      return { exists: false };
    }
    const stat = fs.statSync(targetPath);
    return {
      exists: true,
      timestamp: stat.mtimeMs,
      size: stat.size,
      filePath: targetPath,
    };
  }

  /**
   * Parses raw text or buffer into normalized parsed backup structure.
   */
  public static parseRawContent(content: string | Buffer): RawParsedBackupData {
    const detection = BackupValidator.detectFormat(content);

    if (detection.format === 'ownbox_android') {
      const decoded = AndroidBackupDecoder.decode(content);
      return {
        format: 'ownbox_android',
        nodes: decoded.nodes,
        subscriptions: decoded.subscriptions,
        rules: decoded.rules,
        appRules: decoded.appRules,
        settings: decoded.settings,
        unparseableCount: decoded.unparseableCount,
        warnings: decoded.warnings,
      };
    }

    if (detection.format === 'ownbox_windows') {
      const contentStr = typeof content === 'string' ? content : content.toString('utf8');
      const decoded = WindowsBackupCodec.decode(contentStr);
      return {
        format: 'ownbox_windows',
        nodes: decoded.nodes || [],
        subscriptions: decoded.subscriptions || [],
        rules: decoded.routing?.rules || [],
        appRules: decoded.routing?.appRules || [],
        settings: decoded.settings || {},
      };
    }

    if (detection.format === 'singbox_config' && detection.rawJson) {
      const nodes: ProxyNode[] = [];
      const outbounds = detection.rawJson.outbounds || [];
      for (const out of outbounds) {
        if (['direct', 'block', 'dns', 'selector', 'urltest'].includes(out.type)) continue;
        nodes.push({
          id: Math.random().toString(36).substring(2),
          name: out.tag || out.server || out.type,
          type: out.type,
          server: out.server || '127.0.0.1',
          port: out.server_port || 443,
          groupId: 'default',
          uuid: out.uuid,
          password: out.password,
          tls: !!out.tls?.enabled,
          sni: out.tls?.server_name,
          reality: !!out.tls?.reality?.enabled,
          publicKey: out.tls?.reality?.public_key,
          shortId: out.tls?.reality?.short_id,
          transport: out.transport?.type,
          transportPath: out.transport?.path,
          rawOutbound: out,
        });
      }
      return {
        format: 'singbox_config',
        nodes,
      };
    }

    // Try parsing as raw subscription links
    if (typeof content === 'string') {
      const nodes = UniversalSubscriptionParser.parse(content);
      if (nodes.length > 0) {
        return {
          format: 'singbox_config',
          nodes,
        };
      }
    }

    throw new Error('无法识别的备份文件格式，请确保上传的是有效的 OwnBox 备份文件或 Android 导出的备份文件');
  }
}
