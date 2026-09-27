/**
 * BackupValidator.ts
 * Inspects and validates backup payloads, detects backup formats, and verifies safety constraints.
 */

export type BackupFormatType =
  | 'ownbox_windows'
  | 'ownbox_android'
  | 'singbox_config'
  | 'unknown';

export interface FormatDetectionResult {
  format: BackupFormatType;
  rawJson?: any;
  isZip?: boolean;
}

export class BackupValidator {
  /**
   * Detects the format of raw backup content.
   */
  public static detectFormat(content: string | Buffer): FormatDetectionResult {
    // 1. Check if ZIP (PK..)
    if (Buffer.isBuffer(content) && content.length >= 4 && content[0] === 0x50 && content[1] === 0x4b) {
      return { format: 'ownbox_android', isZip: true };
    }

    if (typeof content === 'string') {
      const trimmed = content.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        // Maybe base64 zip or raw text
        try {
          const buf = Buffer.from(trimmed, 'base64');
          if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
            return { format: 'ownbox_android', isZip: true };
          }
        } catch {}
      }

      try {
        const json = JSON.parse(trimmed);
        if (json.schema_version !== undefined || (json.app_version && json.nodes)) {
          return { format: 'ownbox_windows', rawJson: json };
        }
        if (json.profiles || json.proxies || json.groups || (json.rules && Array.isArray(json.rules) && typeof json.rules[0] === 'string')) {
          return { format: 'ownbox_android', rawJson: json };
        }
        if (json.outbounds && Array.isArray(json.outbounds)) {
          return { format: 'singbox_config', rawJson: json };
        }
        if (json.nodes || json.subscriptions || json.routing) {
          return { format: 'ownbox_windows', rawJson: json };
        }
      } catch {}
    }

    return { format: 'unknown' };
  }
}
