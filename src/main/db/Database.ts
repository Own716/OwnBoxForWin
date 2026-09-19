import path from 'path';
import fs from 'fs';
import { ProxyNode, Subscription, RouteRule, AppRule, DnsConfig, AppSettings } from '../../types';

export class Database {
  private static instance: Database;
  private dataDir: string;
  private dbPath: string;

  private activeNodeId: string = '';
  private nodes: ProxyNode[] = [];
  private subscriptions: Subscription[] = [];
  private rules: RouteRule[] = [];
  private appRules: AppRule[] = [];
  private dns: DnsConfig;
  private settings: AppSettings;

  private constructor() {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Roaming');
    this.dataDir = path.join(appData, 'OwnBox');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.dbPath = path.join(this.dataDir, 'ownbox.json');

    // Default DNS
    this.dns = {
      mode: 'standard',
      remoteDns: 'https://1.1.1.1/dns-query',
      directDns: '223.5.5.5',
      fakeIpRange: '198.18.0.0/15',
      enableDnsRouting: true,
      servers: [
        { id: '1', tag: 'remote-dns', address: 'https://1.1.1.1/dns-query', detour: 'proxy' },
        { id: '2', tag: 'direct-dns', address: '223.5.5.5', detour: 'direct' },
      ],
    };

    // Default Settings
    this.settings = {
      theme: 'system',
      language: 'zh-CN',
      startOnBoot: false,
      startMinimized: false,
      autoConnectOnLaunch: false,
      closeToTray: true,

      mixedPort: 2080,
      allowLan: false,
      inboundAuth: false,
      systemProxyEnabled: true,
      systemProxyBypassLan: true,

      tunEnabled: false,
      tunMtu: 9000,
      tunStack: 'system',
      tunAutoRoute: true,
      tunStrictRoute: false,
      tunDnsHijack: true,
      tunIPv6: false,

      routingMode: 'rule',
      logLevel: 'info',
      clashApiEnabled: true,
      clashApiPort: 9090,

      testUrl: 'http://cp.cloudflare.com/generate_204',
      testTimeoutMs: 5000,
      testConcurrent: 8,

      webdav: {
        serverUrl: '',
        username: '',
        password: '',
        remotePath: 'OwnBox',
        autoSync: false,
      },
    };

    // Default Route Rules
    this.rules = [
      {
        id: 'rule-lan',
        name: '局域网直连 (Private IPs)',
        enabled: true,
        ip: ['geoip:private'],
        outbound: 'direct',
      },
      {
        id: 'rule-cn-domains',
        name: '国内域名直连 (GeoSite CN)',
        enabled: true,
        domains: ['geosite:cn'],
        outbound: 'direct',
      },
      {
        id: 'rule-cn-ips',
        name: '国内 IP 直连 (GeoIP CN)',
        enabled: true,
        ip: ['geoip:cn'],
        outbound: 'direct',
      },
      {
        id: 'rule-adblock',
        name: '广告与恶意域名拦截 (GeoSite Category Ads)',
        enabled: true,
        domains: ['geosite:category-ads-all'],
        outbound: 'block',
      },
    ];

    // Default App Rules
    this.appRules = [
      { id: 'app-chrome', name: 'Google Chrome', exePath: 'chrome.exe', action: 'proxy', enabled: true },
      { id: 'app-edge', name: 'Microsoft Edge', exePath: 'msedge.exe', action: 'proxy', enabled: true },
      { id: 'app-telegram', name: 'Telegram Desktop', exePath: 'Telegram.exe', action: 'proxy', enabled: true },
      { id: 'app-discord', name: 'Discord', exePath: 'Discord.exe', action: 'proxy', enabled: true },
      { id: 'app-steam', name: 'Steam Client', exePath: 'steam.exe', action: 'direct', enabled: true },
    ];

    // Initialize empty node list (no fake mock nodes)
    this.nodes = [];
    this.activeNodeId = '';

    this.load();
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        const data = JSON.parse(raw);
        if (data.nodes) {
          this.nodes = (data.nodes as ProxyNode[]).filter((n) => !n.server || !n.server.includes('ownbox.org'));
        }
        if (data.subscriptions) this.subscriptions = data.subscriptions;
        if (data.rules) this.rules = data.rules;
        if (data.appRules) this.appRules = data.appRules;
        if (data.dns) this.dns = { ...this.dns, ...data.dns };
        if (data.settings) this.settings = { ...this.settings, ...data.settings };
        if (data.activeNodeId) this.activeNodeId = data.activeNodeId;
      } else {
        this.save();
      }
    } catch (e) {
      console.error('Failed to load database:', e);
    }
  }

  public save(): void {
    try {
      const data = {
        activeNodeId: this.activeNodeId,
        nodes: this.nodes,
        subscriptions: this.subscriptions,
        rules: this.rules,
        appRules: this.appRules,
        dns: this.dns,
        settings: this.settings,
      };
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save database:', e);
    }
  }

  public getActiveNodeId(): string {
    return this.activeNodeId;
  }

  public setActiveNodeId(id: string): void {
    this.activeNodeId = id;
    this.save();
  }

  public getNodes(): ProxyNode[] {
    return this.nodes;
  }

  public saveNodes(nodes: ProxyNode[]): void {
    this.nodes = nodes;
    if (!this.nodes.some((n) => n.id === this.activeNodeId) && this.nodes.length > 0) {
      this.activeNodeId = this.nodes[0].id;
    }
    this.save();
  }

  public getSubscriptions(): Subscription[] {
    return this.subscriptions;
  }

  public saveSubscriptions(subs: Subscription[]): void {
    this.subscriptions = subs;
    this.save();
  }

  public getRules(): RouteRule[] {
    return this.rules;
  }

  public saveRules(rules: RouteRule[]): void {
    this.rules = rules;
    this.save();
  }

  public getAppRules(): AppRule[] {
    return this.appRules;
  }

  public saveAppRules(appRules: AppRule[]): void {
    this.appRules = appRules;
    this.save();
  }

  public getDns(): DnsConfig {
    return this.dns;
  }

  public saveDns(dns: DnsConfig): void {
    this.dns = dns;
    this.save();
  }

  public getSettings(): AppSettings {
    return this.settings;
  }

  public saveSettings(settings: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.save();
  }
}
