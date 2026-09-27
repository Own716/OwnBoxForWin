/**
 * BackupSnapshot.ts
 * Takes automatic pre-import snapshots before modifying the database.
 * Preserves historical rollback points and purges snapshots older than the 10 newest.
 */

import path from 'path';
import fs from 'fs';
import { Database } from '../Database';
import { WindowsBackupCodec } from './WindowsBackupCodec';

export class BackupSnapshot {
  private static getSnapshotDir(): string {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Roaming');
    const snapshotDir = path.join(appData, 'OwnBox', 'snapshots');
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }
    return snapshotDir;
  }

  /**
   * Creates an automatic snapshot of current database state before importing.
   */
  public static createPreImportSnapshot(): string {
    const dir = this.getSnapshotDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = path.join(dir, `OwnBox_pre_import_${timestamp}.ownboxbackup`);

    const db = Database.getInstance();
    const backupJson = WindowsBackupCodec.encode(
      db.getNodes(),
      db.getSubscriptions(),
      db.getRules(),
      db.getAppRules(),
      db.getDns(),
      db.getSettings(),
      { profiles: true, rules: true, settings: true }
    );

    fs.writeFileSync(snapshotPath, backupJson, 'utf8');

    // Clean up older snapshots (keep up to 10)
    try {
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith('OwnBox_pre_import_') && f.endsWith('.ownboxbackup'))
        .map((f) => ({ name: f, path: path.join(dir, f), time: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 10) {
        files.slice(10).forEach((file) => {
          try {
            fs.unlinkSync(file.path);
          } catch {}
        });
      }
    } catch {}

    return snapshotPath;
  }
}
