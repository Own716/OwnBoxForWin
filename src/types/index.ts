export type ProxyType =
  | 'vless'
  | 'vmess'
  | 'trojan'
  | 'shadowsocks'
  | 'shadowsocksr'
  | 'hysteria'
  | 'hysteria2'
  | 'tuic'
  | 'wireguard'
  | 'snell'
  | 'socks'
  | 'http';

export interface ProxyNode {
  id: string;
  name: string;
  type: ProxyType;
  server: string;
  port: number;
  groupId: string;
  starred?: boolean;
  ping?: number; // ms (-1 for timeout)
  trafficUp?: number; // bytes
  trafficDown?: number; // bytes
  lastTested?: number; // timestamp
  
  // Auth & Security
  uuid?: string;
  password?: string;
  method?: string; // SS / VMess cipher
  alterId?: number; // VMess
  network?: string; // tcp, udp
  flow?: string; // xtls-rprx-vision
  
  // TLS & Reality
  tls?: boolean;
  sni?: string;
  alpn?: string[];
  insecure?: boolean;
  reality?: boolean;
  publicKey?: string;
  shortId?: string;
  fingerprint?: string; // chrome, firefox, etc.
  
  // Transport
  transport?: 'tcp' | 'ws' | 'grpc' | 'http' | 'xhttp';
  transportPath?: string;
  transportHost?: string;
  
  // WireGuard specific
  privateKey?: string;
  peerPublicKey?: string;
  localAddress?: string;
  presharedKey?: string;
  mtu?: number;
  reserved?: number[];
  
  // Hysteria / TUIC specific
  upMbps?: number;
  downMbps?: number;
  obfs?: string;
  congestionControl?: string; // bbr, cubic
  
  // Raw Sing-box Outbound JSON option fallback
  rawOutbound?: Record<string, any>;
}

export interface Subscription {
  id: string;
  name: string;
  url: string;
  nodeCount: number;
  lastUpdate: number;
  autoUpdate: boolean;
  updateIntervalHours: number;
  status: 'idle' | 'updating' | 'success' | 'error';
  errorMessage?: string;
  userInfo?: {
    upload: number;
    download: number;
    total: number;
    expire: number;
  };
}

export interface RouteRule {
  id: string;
  name: string;
  enabled: boolean;
  domains?: string[]; // full:xxx, domain:xxx, geosite:xxx
  ip?: string[]; // cidr, geoip:xxx
  port?: string; // 80,443, 1000:2000
  sourcePort?: string;
  network?: string; // tcp, udp
  protocol?: string; // http, tls, dns, bittorrent
  processName?: string[]; // chrome.exe
  processPath?: string[];
  outbound: 'proxy' | 'direct' | 'block' | string; // 'proxy' or node ID
}

export interface AppRule {
  id: string;
  name: string;
  exePath: string;
  icon?: string;
  action: 'proxy' | 'direct' | 'block';
  enabled: boolean;
}

export interface DnsServerItem {
  id: string;
  tag: string;
  address: string; // e.g., https://1.1.1.1/dns-query, udp://223.5.5.5
  detour?: string; // 'direct' or 'proxy'
}

export interface DnsConfig {
  mode: 'standard' | 'fakeip';
  remoteDns: string;
  directDns: string;
  fakeIpRange: string;
  enableDnsRouting: boolean;
  servers: DnsServerItem[];
}

export interface WebDAVConfig {
  serverUrl: string;
  username: string;
  password: string;
  remotePath: string; // default: "OwnBox"
  autoSync: boolean;
  lastSyncTime?: number;
}

export interface AppSettings {
  // General
  theme: 'system' | 'light' | 'dark';
  language: 'zh-CN' | 'en-US';
  startOnBoot: boolean;
  startMinimized: boolean;
  autoConnectOnLaunch: boolean;
  closeToTray: boolean;
  
  // Inbound & Proxy
  mixedPort: number;
  allowLan: boolean;
  inboundAuth: boolean;
  inboundUser?: string;
  inboundPass?: string;
  systemProxyEnabled: boolean;
  systemProxyBypassLan: boolean;
  customBypassList?: string;
  
  // TUN Mode
  tunEnabled: boolean;
  tunMtu: number;
  tunStack: 'native' | 'system' | 'gvisor' | 'mixed';
  tunAutoRoute: boolean;
  tunStrictRoute: boolean;
  tunDnsHijack: boolean;
  tunIPv6: boolean;
  tunEndpointIndependentNat?: boolean;

  // DNS
  dnsCache?: boolean;
  dnsOptimistic?: boolean;
  
  // Core & Routing
  routingMode: 'rule' | 'global' | 'direct';
  logLevel: 'panic' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  clashApiEnabled: boolean;
  clashApiPort: number;
  clashApiSecret?: string;
  
  // Speed Test
  testUrl: string;
  testTimeoutMs: number;
  testConcurrent: number;
  
  // WebDAV
  webdav: WebDAVConfig;
}

export type CoreState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface TrafficStats {
  uploadSpeed: number; // bytes/s
  downloadSpeed: number; // bytes/s
  totalUpload: number; // bytes
  totalDownload: number; // bytes
  latency: number; // ms
  uptime: number; // seconds
  activeConnections: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: 'core' | 'app' | 'net';
}

export interface SpeedTestResult {
  nodeId: string;
  nodeName: string;
  ping: number; // ms
  downloadSpeed?: number; // bits/s
  uploadSpeed?: number; // bits/s
  status: 'pending' | 'testing' | 'success' | 'error';
  errorMessage?: string;
}

export interface BackupData {
  schema_version: number;
  app_version: string;
  timestamp: number;
  nodes: ProxyNode[];
  subscriptions: Subscription[];
  routing: {
    mode: 'rule' | 'global' | 'direct';
    rules: RouteRule[];
    appRules: AppRule[];
  };
  dns: DnsConfig;
  settings: Partial<AppSettings>;
  appearance: {
    theme: string;
  };
  webdav?: Partial<WebDAVConfig>;
}

export interface InstalledAppInfo {
  name: string;
  exePath: string;
  icon?: string;
  publisher?: string;
  version?: string;
}
