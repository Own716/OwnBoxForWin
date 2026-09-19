import { BackupData, ProxyNode, Subscription, RouteRule, AppRule, DnsConfig, AppSettings } from '../../types';

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
   * Parse node links (vless://, vmess://, trojan://, ss://, hysteria2://, tuic://)
   */
  public static parseNodeLinks(text: string): ProxyNode[] {
    const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    const nodes: ProxyNode[] = [];

    for (const line of lines) {
      try {
        if (line.startsWith('vless://')) {
          const parsed = this.parseVless(line);
          if (parsed) nodes.push(parsed);
        } else if (line.startsWith('vmess://')) {
          const parsed = this.parseVmess(line);
          if (parsed) nodes.push(parsed);
        } else if (line.startsWith('trojan://')) {
          const parsed = this.parseTrojan(line);
          if (parsed) nodes.push(parsed);
        } else if (line.startsWith('ss://')) {
          const parsed = this.parseShadowsocks(line);
          if (parsed) nodes.push(parsed);
        } else if (line.startsWith('hy2://') || line.startsWith('hysteria2://')) {
          const parsed = this.parseHysteria2(line);
          if (parsed) nodes.push(parsed);
        } else if (line.startsWith('tuic://')) {
          const parsed = this.parseTuic(line);
          if (parsed) nodes.push(parsed);
        }
      } catch (e) {
        console.error('Failed to parse line:', line, e);
      }
    }

    return nodes;
  }

  private static parseVless(uri: string): ProxyNode | null {
    const url = new URL(uri);
    const name = decodeURIComponent(url.hash.replace(/^#/, '')) || url.hostname;
    const search = url.searchParams;

    return {
      id: Math.random().toString(36).substring(2),
      name,
      type: 'vless',
      server: url.hostname,
      port: Number(url.port) || 443,
      groupId: 'default',
      uuid: url.username,
      flow: search.get('flow') || undefined,
      tls: search.get('security') === 'tls' || search.get('security') === 'reality',
      reality: search.get('security') === 'reality',
      sni: search.get('sni') || undefined,
      publicKey: search.get('pbk') || undefined,
      shortId: search.get('sid') || undefined,
      fingerprint: search.get('fp') || 'chrome',
      transport: (search.get('type') as any) || 'tcp',
      transportPath: search.get('path') || undefined,
      transportHost: search.get('host') || undefined,
    };
  }

  private static parseVmess(uri: string): ProxyNode | null {
    const b64 = uri.replace('vmess://', '');
    const jsonStr = Buffer.from(b64, 'base64').toString('utf8');
    const obj = JSON.parse(jsonStr);

    return {
      id: Math.random().toString(36).substring(2),
      name: obj.ps || obj.add,
      type: 'vmess',
      server: obj.add,
      port: Number(obj.port),
      groupId: 'default',
      uuid: obj.id,
      alterId: Number(obj.aid) || 0,
      method: obj.scy || 'auto',
      tls: obj.tls === 'tls',
      sni: obj.sni || obj.host,
      transport: obj.net === 'ws' ? 'ws' : (obj.net === 'grpc' ? 'grpc' : 'tcp'),
      transportPath: obj.path,
    };
  }

  private static parseTrojan(uri: string): ProxyNode | null {
    const url = new URL(uri);
    const name = decodeURIComponent(url.hash.replace(/^#/, '')) || url.hostname;
    const search = url.searchParams;

    return {
      id: Math.random().toString(36).substring(2),
      name,
      type: 'trojan',
      server: url.hostname,
      port: Number(url.port) || 443,
      groupId: 'default',
      password: url.username,
      tls: true,
      sni: search.get('sni') || url.hostname,
    };
  }

  private static parseShadowsocks(uri: string): ProxyNode | null {
    const url = new URL(uri);
    const name = decodeURIComponent(url.hash.replace(/^#/, '')) || url.hostname;

    let method = 'aes-256-gcm';
    let password = '';

    if (url.username) {
      if (url.password) {
        method = url.username;
        password = url.password;
      } else {
        const decoded = Buffer.from(url.username, 'base64').toString('utf8');
        const parts = decoded.split(':');
        method = parts[0];
        password = parts.slice(1).join(':');
      }
    }

    return {
      id: Math.random().toString(36).substring(2),
      name,
      type: 'shadowsocks',
      server: url.hostname,
      port: Number(url.port) || 8388,
      groupId: 'default',
      method,
      password,
    };
  }

  private static parseHysteria2(uri: string): ProxyNode | null {
    const cleanUri = uri.replace(/^hy2:\/\//, 'https://').replace(/^hysteria2:\/\//, 'https://');
    const url = new URL(cleanUri);
    const name = decodeURIComponent(url.hash.replace(/^#/, '')) || url.hostname;
    const search = url.searchParams;

    return {
      id: Math.random().toString(36).substring(2),
      name,
      type: 'hysteria2',
      server: url.hostname,
      port: Number(url.port) || 443,
      groupId: 'default',
      password: url.username,
      tls: true,
      sni: search.get('sni') || url.hostname,
      obfs: search.get('obfs-password') || undefined,
    };
  }

  private static parseTuic(uri: string): ProxyNode | null {
    const cleanUri = uri.replace(/^tuic:\/\//, 'https://');
    const url = new URL(cleanUri);
    const name = decodeURIComponent(url.hash.replace(/^#/, '')) || url.hostname;
    const search = url.searchParams;

    return {
      id: Math.random().toString(36).substring(2),
      name,
      type: 'tuic',
      server: url.hostname,
      port: Number(url.port) || 443,
      groupId: 'default',
      uuid: url.username,
      password: url.password,
      tls: true,
      sni: search.get('sni') || url.hostname,
      congestionControl: search.get('congestion_control') || 'bbr',
    };
  }
}
