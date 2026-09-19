import { BackupData, ProxyNode, Subscription, RouteRule, AppRule, DnsConfig, AppSettings } from '../../types';

import { UniversalSubscriptionParser } from '../net/UniversalSubscriptionParser';

export class BackupMigrator {
  public static exportOwnBoxBackup(
    nodes: ProxyNode[],
    subscriptions: Subscription[],
    rules: RouteRule[],
    appRules: AppRule[],
    dns: DnsConfig,
    settings: AppSettings
  ): string {
    const backup: BackupData = {
      schema_version: 1,
      app_version: '1.0.0',
      timestamp: Date.now(),
      nodes,
      subscriptions,
      routing: {
        mode: settings.routingMode,
        rules,
        appRules,
      },
      dns,
      settings,
      appearance: {
        theme: settings.theme,
      },
      webdav: settings.webdav,
    };
    return JSON.stringify(backup, null, 2);
  }

  public static importBackup(content: string): Partial<BackupData> {
    const parsed = JSON.parse(content);

    // Native .ownboxbackup format
    if (parsed.schema_version && parsed.nodes) {
      return parsed;
    }

    // Android JSON backup format (from BackupHelper.kt)
    if (parsed.proxies || parsed.groups) {
      return this.migrateAndroidBackup(parsed);
    }

    // Sing-box raw configuration format
    if (parsed.outbounds) {
      return this.migrateSingBoxConfig(parsed);
    }

    throw new Error('Unknown backup format');
  }

  /**
   * Migrates Android JSON backup format
   */
  private static migrateAndroidBackup(androidData: any): Partial<BackupData> {
    const nodes: ProxyNode[] = [];
    const subs: Subscription[] = [];

    // Migrate groups / subscriptions
    if (Array.isArray(androidData.groups)) {
      for (const g of androidData.groups) {
        if (typeof g === 'object' && g.name) {
          subs.push({
            id: g.id ? String(g.id) : Math.random().toString(36).substring(2),
            name: g.name,
            url: g.url || '',
            nodeCount: 0,
            lastUpdate: g.sub_last_update || Date.now(),
            autoUpdate: !g.skip_auto_update,
            updateIntervalHours: 24,
            status: 'idle',
          });
        }
      }
    }

    // Migrate proxies
    if (Array.isArray(androidData.proxies)) {
      for (const p of androidData.proxies) {
        if (typeof p === 'object' && p.name) {
          nodes.push({
            id: p.id ? String(p.id) : Math.random().toString(36).substring(2),
            name: p.name,
            type: p.type || 'vless',
            server: p.server || '127.0.0.1',
            port: p.port || 443,
            groupId: p.gid ? String(p.gid) : 'default',
            uuid: p.uuid,
            password: p.password,
            ping: p.latency || 0,
            trafficUp: p.traffic_up || 0,
            trafficDown: p.traffic_dl || 0,
          });
        }
      }
    }

    return {
      nodes,
      subscriptions: subs,
    };
  }

  /**
   * Migrates raw Sing-box outbounds configuration
   */
  private static migrateSingBoxConfig(singBoxJson: any): Partial<BackupData> {
    const nodes: ProxyNode[] = [];
    if (Array.isArray(singBoxJson.outbounds)) {
      for (const out of singBoxJson.outbounds) {
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
    }
    return { nodes };
  }

  /**
   * Universal node parser: handles Base64, Clash YAML, Sing-box JSON, and standard URI links
   */
  public static parseNodeLinks(text: string): ProxyNode[] {
    return UniversalSubscriptionParser.parse(text);
  }
}

