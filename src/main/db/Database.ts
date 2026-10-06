import path from 'path';
import fs from 'fs';
import { ProxyNode, Subscription, RouteRule, AppRule, DnsConfig, AppSettings } from '../../types';
import { CredentialSecurity } from '../security/CredentialSecurity';

export class Database {
  public static readonly CURRENT_SCHEMA_VERSION = 2;
  private static instance: Database | null = null;
  private static customDir: string | null = null;

  private dataDir: string;
  private dbPath: string;

  private activeNodeId: string = '';
  private nodes: ProxyNode[] = [];
  private subscriptions: Subscription[] = [];
  private rules: RouteRule[] = [];
  private appRules: AppRule[] = [];
  private dns: DnsConfig;
  private settings: AppSettings;

  private saveTimer: NodeJS.Timeout | null = null;
  private isDirty = false;

  private constructor(customDir?: string) {
    if (customDir) {
      this.dataDir = customDir;
    } else {
      const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Roaming');
      this.dataDir = path.join(appData, 'OwnBox');
    }

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
      customBypassList: '',

      tunEnabled: false,
      tunMtu: 9000,
      tunStack: 'native',
      tunAutoRoute: true,
      tunStrictRoute: false,
      tunDnsHijack: true,
      tunIPv6: false,
      tunEndpointIndependentNat: true,

      dnsCache: true,
      dnsOptimistic: true,

      routingMode: 'rule',
      logLevel: 'info',
      clashApiEnabled: true,
      clashApiPort: 9090,

      testUrl: 'http://cp.cloudflare.com/generate_204',
      testTimeoutMs: 5000,
      testConcurrent: 10,

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

    this.nodes = [];
    this.activeNodeId = '';

    this.load();
  }

  public static getInstance(customDir?: string): Database {
    if (customDir && customDir !== Database.customDir) {
      Database.customDir = customDir;
      Database.instance = new Database(customDir);
      return Database.instance;
    }
    if (!Database.instance) {
      Database.instance = new Database(Database.customDir || undefined);
    }
    return Database.instance;
  }

  public static resetInstance(): void {
    if (Database.instance && Database.instance.saveTimer) {
      clearTimeout(Database.instance.saveTimer);
      Database.instance.saveTimer = null;
    }
    Database.instance = null;
    Database.customDir = null;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        // Guard against zero-byte corrupted files
        const stat = fs.statSync(this.dbPath);
        if (stat.size === 0) {
          console.warn('Database file is 0 bytes, recovering from backup...');
          this.recoverFromBackup();
          return;
        }

        let raw = '';
        try {
          raw = fs.readFileSync(this.dbPath, 'utf8');
        } catch (readErr: any) {
          console.error('Failed to read database file:', readErr);
          this.recoverFromBackup();
          return;
        }

        try {
          const data = JSON.parse(raw);
          this.applyData(data);

          // Auto-migrate schema if version is older
          if (!data.schemaVersion || data.schemaVersion < Database.CURRENT_SCHEMA_VERSION) {
            console.log(`Migrating database from version ${data.schemaVersion || 1} to ${Database.CURRENT_SCHEMA_VERSION}`);
            this.flush();
          }
        } catch (jsonErr: any) {
          console.error('Database JSON parse error, isolating corrupt file:', jsonErr);
          const corruptPath = `${this.dbPath}.corrupted.${Date.now()}`;
          try {
            fs.copyFileSync(this.dbPath, corruptPath);
          } catch {}
          this.recoverFromBackup();
        }
      } else {
        this.flush();
      }
    } catch (e) {
      console.error('Failed to load database:', e);
    }
  }

  private applyData(data: any): void {
    if (Array.isArray(data.nodes)) {
      this.nodes = (data.nodes as ProxyNode[]).filter(
        (n) => n && n.id && (!n.server || !n.server.includes('ownbox.org'))
      );
    }
    if (Array.isArray(data.subscriptions)) {
      this.subscriptions = data.subscriptions.filter((s: any) => s && s.id);
    }
    if (Array.isArray(data.rules)) {
      this.rules = data.rules.filter((r: any) => r && r.id);
    }
    if (Array.isArray(data.appRules)) {
      this.appRules = data.appRules.filter((a: any) => a && a.id);
    }
    if (data.dns && typeof data.dns === 'object') {
      this.dns = { ...this.dns, ...data.dns };
    }
    if (data.settings && typeof data.settings === 'object') {
      this.settings = { ...this.settings, ...data.settings };
      // Decrypt sensitive credentials in memory
      if (this.settings.webdav && this.settings.webdav.password) {
        this.settings.webdav.password = CredentialSecurity.decrypt(this.settings.webdav.password);
      }
    }
    if (data.activeNodeId && typeof data.activeNodeId === 'string') {
      this.activeNodeId = data.activeNodeId;
    }
  }

  private recoverFromBackup(): void {
    const bakPath = `${this.dbPath}.bak`;
    if (fs.existsSync(bakPath)) {
      try {
        const raw = fs.readFileSync(bakPath, 'utf8');
        const data = JSON.parse(raw);
        this.applyData(data);
        console.log('Successfully recovered database from .bak backup');
        this.flush();
        return;
      } catch (e) {
        console.error('Failed to recover from .bak backup:', e);
      }
    }
    // If no backup exists or backup corrupted, initialize with default empty state
    this.flush();
  }

  /**
   * Saves database state. If debounceMs > 0, coalesces multiple writes to prevent disk I/O thrashing.
   */
  public save(debounceMs = 0): void {
    if (debounceMs > 0) {
      this.isDirty = true;
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
      }
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.flush();
      }, debounceMs);
    } else {
      this.flush();
    }
  }

  /**
   * High-frequency debounced save (default 300ms window).
   */
  public saveDebounced(debounceMs = 300): void {
    this.save(debounceMs);
  }

  /**
   * Immediately flushes any pending changes to disk atomically.
   */
  public flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    const tempPath = `${this.dbPath}.tmp`;
    const bakPath = `${this.dbPath}.bak`;
    try {
      // Encrypt sensitive fields on disk
      const diskSettings: AppSettings = {
        ...this.settings,
        webdav: {
          ...this.settings.webdav,
          password: CredentialSecurity.encrypt(this.settings.webdav.password || ''),
        },
      };

      const data = {
        schemaVersion: Database.CURRENT_SCHEMA_VERSION,
        activeNodeId: this.activeNodeId,
        nodes: this.nodes,
        subscriptions: this.subscriptions,
        rules: this.rules,
        appRules: this.appRules,
        dns: this.dns,
        settings: diskSettings,
      };

      const jsonStr = JSON.stringify(data, null, 2);

      // 1. Atomic write to temporary file
      fs.writeFileSync(tempPath, jsonStr, 'utf8');

      // 2. Create/update backup file from currently working dbPath
      if (fs.existsSync(this.dbPath)) {
        try {
          fs.copyFileSync(this.dbPath, bakPath);
        } catch {}
      }

      // 3. Rename temp file to target file
      fs.renameSync(tempPath, this.dbPath);
      this.isDirty = false;
    } catch (e) {
      console.error('Failed to save database atomically:', e);
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
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
    if (this.nodes.length === 0) {
      this.activeNodeId = '';
    } else if (!this.nodes.some((n) => n.id === this.activeNodeId)) {
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

  public resetSettings(): AppSettings {
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
      customBypassList: '',

      tunEnabled: false,
      tunMtu: 9000,
      tunStack: 'native',
      tunAutoRoute: true,
      tunStrictRoute: false,
      tunDnsHijack: true,
      tunIPv6: false,
      tunEndpointIndependentNat: true,

      dnsCache: true,
      dnsOptimistic: true,

      routingMode: 'rule',
      logLevel: 'info',
      clashApiEnabled: true,
      clashApiPort: 9090,

      testUrl: 'http://cp.cloudflare.com/generate_204',
      testTimeoutMs: 5000,
      testConcurrent: 10,

      webdav: {
        serverUrl: '',
        username: '',
        password: '',
        remotePath: 'OwnBox',
        autoSync: false,
      },
    };
    this.save();
    return this.settings;
  }
}
