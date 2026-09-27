import { BackupData, ProxyNode, Subscription, RouteRule, AppRule, DnsConfig, AppSettings } from '../../types';
import { UniversalSubscriptionParser } from '../net/UniversalSubscriptionParser';
import { BackupService } from './backup/BackupService';
import { WindowsBackupCodec } from './backup/WindowsBackupCodec';

export class BackupMigrator {
  public static exportOwnBoxBackup(
    nodes: ProxyNode[],
    subscriptions: Subscription[],
    rules: RouteRule[],
    appRules: AppRule[],
    dns: DnsConfig,
    settings: AppSettings
  ): string {
    return WindowsBackupCodec.encode(nodes, subscriptions, rules, appRules, dns, settings);
  }

  public static importBackup(content: string): Partial<BackupData> {
    const parsed = BackupService.parseRawContent(content);
    return {
      nodes: parsed.nodes,
      subscriptions: parsed.subscriptions,
      routing: {
        mode: parsed.settings?.routingMode || 'rule',
        rules: parsed.rules || [],
        appRules: parsed.appRules || [],
      },
      settings: parsed.settings,
    };
  }

  /**
   * Universal node parser: handles Base64, Clash YAML, Sing-box JSON, and standard URI links
   */
  public static parseNodeLinks(text: string): ProxyNode[] {
    return UniversalSubscriptionParser.parse(text);
  }
}
