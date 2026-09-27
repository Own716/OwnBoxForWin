/**
 * WindowsBackupCodec.ts
 * Codec for OwnBox Windows native backup format (.ownboxbackup).
 * Schema version 2 with backward-compatibility for schema version 1.
 * Supports partial category export/import (profiles, rules, settings).
 */

import {
  BackupData,
  ProxyNode,
  Subscription,
  RouteRule,
  AppRule,
  DnsConfig,
  AppSettings,
  BackupCategories,
} from '../../../types';

export class WindowsBackupCodec {
  public static readonly CURRENT_SCHEMA_VERSION = 2;

  public static encode(
    nodes: ProxyNode[],
    subscriptions: Subscription[],
    rules: RouteRule[],
    appRules: AppRule[],
    dns: DnsConfig,
    settings: AppSettings,
    categories: BackupCategories = { profiles: true, rules: true, settings: true }
  ): string {
    const backup: Partial<BackupData> = {
      schema_version: this.CURRENT_SCHEMA_VERSION,
      app_version: '1.0.3',
      timestamp: Date.now(),
    };

    if (categories.profiles) {
      backup.nodes = nodes;
      backup.subscriptions = subscriptions;
    }

    if (categories.rules) {
      backup.routing = {
        mode: settings.routingMode || 'rule',
        rules,
        appRules,
      };
    }

    if (categories.settings) {
      backup.dns = dns;
      backup.settings = settings;
      backup.appearance = {
        theme: settings.theme || 'system',
      };
      backup.webdav = settings.webdav;
    }

    return JSON.stringify(backup, null, 2);
  }

  public static decode(content: string): Partial<BackupData> {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid JSON structure in backup');
    }

    if (!parsed.schema_version && !parsed.nodes && !parsed.subscriptions && !parsed.routing && !parsed.settings) {
      throw new Error('Not a valid OwnBox Windows backup file');
    }

    return parsed;
  }
}
