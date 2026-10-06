import { WebDAVClient } from './WebDAVClient';
import { CredentialSecurity } from '../security/CredentialSecurity';
import { BackupService } from '../db/backup/BackupService';
import { Database } from '../db/Database';
import { LogManager } from '../log/LogManager';
import { WebDAVConfig, BackupCategories } from '../../types';

export class WebDAVSyncService {
  /**
   * Tests connection to the remote WebDAV server.
   */
  public static async testConnection(cfg: WebDAVConfig): Promise<{ success: boolean; message: string }> {
    if (!cfg || !cfg.serverUrl) {
      return { success: false, message: '请提供有效的 WebDAV 服务器地址' };
    }

    try {
      const realPassword = CredentialSecurity.decrypt(cfg.password || '');
      const client = new WebDAVClient(cfg.serverUrl, cfg.username, realPassword);
      const res = await client.testConnection();
      return res;
    } catch (e: any) {
      return { success: false, message: `连接失败: ${e.message || String(e)}` };
    }
  }

  /**
   * Performs an automated or manual WebDAV backup.
   */
  public static async backup(
    cfgOverride?: WebDAVConfig,
    categories?: BackupCategories
  ): Promise<{ success: boolean; message: string; timestamp?: number }> {
    const db = Database.getInstance();
    const cfg = cfgOverride || db.getSettings().webdav;

    if (!cfg || !cfg.serverUrl) {
      return { success: false, message: '未配置 WebDAV 服务器地址' };
    }

    try {
      const realPassword = CredentialSecurity.decrypt(cfg.password || '');
      const client = new WebDAVClient(cfg.serverUrl, cfg.username, realPassword);
      const remoteDir = (cfg.remotePath || 'OwnBox').trim().replace(/^\/+|\/+$/g, '');

      // 1. Ensure remote directory exists
      await client.createDir(remoteDir);

      // 2. Generate backup content
      const exportCats = categories || { profiles: true, rules: true, settings: true };
      const content = await BackupService.exportWindowsBackup(exportCats);

      // 3. Upload timestamped snapshot and latest pointer
      const now = Date.now();
      const snapshotName = `${remoteDir}/ownbox_backup_${now}.ownboxbackup`;
      const latestName = `${remoteDir}/latest.ownboxbackup`;

      const uploaded = await client.upload(snapshotName, content);
      if (!uploaded) {
        return { success: false, message: '上传备份文件到 WebDAV 失败' };
      }

      // Update latest pointer
      try {
        await client.upload(latestName, content);
      } catch (err) {
        console.warn('Failed to update latest.ownboxbackup on WebDAV:', err);
      }

      // 4. Update sync state
      cfg.lastSyncTime = now;
      db.saveSettings({ webdav: cfg });

      LogManager.getInstance().addLog(
        'info',
        `WebDAV 同步成功: 已备份至 ${snapshotName} [时间戳: ${now}]`,
        'app'
      );

      return { success: true, message: 'WebDAV 备份成功', timestamp: now };
    } catch (e: any) {
      const errMsg = e.message || String(e);
      LogManager.getInstance().addLog('error', `WebDAV 备份失败: ${errMsg}`, 'app');
      return { success: false, message: errMsg };
    }
  }

  /**
   * Restores latest backup from the remote WebDAV server.
   */
  public static async restore(
    cfgOverride?: WebDAVConfig,
    categories?: BackupCategories
  ): Promise<{ success: boolean; message: string; importedCounts?: any }> {
    const db = Database.getInstance();
    const cfg = cfgOverride || db.getSettings().webdav;

    if (!cfg || !cfg.serverUrl) {
      return { success: false, message: '未配置 WebDAV 服务器地址' };
    }

    try {
      const realPassword = CredentialSecurity.decrypt(cfg.password || '');
      const client = new WebDAVClient(cfg.serverUrl, cfg.username, realPassword);
      const remoteDir = (cfg.remotePath || 'OwnBox').trim().replace(/^\/+|\/+$/g, '');
      const latestName = `${remoteDir}/latest.ownboxbackup`;

      let content: string;
      try {
        content = await client.download(latestName);
      } catch (err: any) {
        return { success: false, message: `无法在 WebDAV 目录中找到最新备份 (${latestName}): ${err.message}` };
      }

      if (!content || !content.trim()) {
        return { success: false, message: 'WebDAV 下载的备份内容为空' };
      }

      const importCats = categories || { profiles: true, rules: true, settings: true };
      const result = await BackupService.importWithTransaction(content, importCats);

      if (result.success) {
        LogManager.getInstance().addLog(
          'info',
          `WebDAV 恢复成功: 导入了 ${result.importedCounts.nodes} 个节点, ${result.importedCounts.rules} 条规则`,
          'app'
        );
        return {
          success: true,
          message: 'WebDAV 备份恢复成功',
          importedCounts: result.importedCounts,
        };
      } else {
        return { success: false, message: result.message || '恢复数据校验失败' };
      }
    } catch (e: any) {
      const errMsg = e.message || String(e);
      LogManager.getInstance().addLog('error', `WebDAV 恢复失败: ${errMsg}`, 'app');
      return { success: false, message: errMsg };
    }
  }
}
