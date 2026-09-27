import test from 'node:test';
import assert from 'node:assert';
import { AndroidParcel } from '../main/db/backup/AndroidParcel';
import { KryoBuffer } from '../main/db/backup/KryoBuffer';
import { AndroidBackupEncoder } from '../main/db/backup/AndroidBackupEncoder';
import { AndroidBackupDecoder } from '../main/db/backup/AndroidBackupDecoder';
import { WindowsBackupCodec } from '../main/db/backup/WindowsBackupCodec';
import { BackupValidator } from '../main/db/backup/BackupValidator';
import { BackupPreview } from '../main/db/backup/BackupPreview';
import { BackupTransaction } from '../main/db/backup/BackupTransaction';
import { BackupIdMapper } from '../main/db/backup/BackupIdMapper';
import { Database } from '../main/db/Database';
import { ProxyNode, Subscription, RouteRule, AppSettings } from '../types';

test('AndroidParcel: primitive read/write and alignment', () => {
  const p = new AndroidParcel();
  p.writeInt(123456);
  p.writeLong(987654321098765n);
  p.writeFloat(3.14159);
  p.writeBoolean(true);

  p.setDataPosition(0);
  assert.strictEqual(p.readInt(), 123456);
  assert.strictEqual(p.readLong(), 987654321098765n);
  assert.ok(Math.abs(p.readFloat() - 3.14159) < 0.0001);
  assert.strictEqual(p.readBoolean(), true);
});

test('AndroidParcel: byte array with padding alignment', () => {
  const p = new AndroidParcel();
  const testBytes = Buffer.from([1, 2, 3, 4, 5]); // 5 bytes -> pad 3 to 8
  p.writeByteArray(testBytes);
  p.writeInt(999);

  p.setDataPosition(0);
  const readBack = p.createByteArray();
  assert.ok(readBack);
  assert.deepStrictEqual(readBack, testBytes);
  assert.strictEqual(p.readInt(), 999);
});

test('AndroidParcel: string UTF-16LE with null terminator and padding', () => {
  const p = new AndroidParcel();
  p.writeString('OwnBox Windows');
  p.writeString('中文测试节点');
  p.writeString('');
  p.writeString(null);

  p.setDataPosition(0);
  assert.strictEqual(p.readString(), 'OwnBox Windows');
  assert.strictEqual(p.readString(), '中文测试节点');
  assert.strictEqual(p.readString(), '');
  assert.strictEqual(p.readString(), null);
});

test('AndroidParcel: Base64 URL-safe encoding', () => {
  const p = new AndroidParcel();
  p.writeInt(42);
  p.writeString('test-url-safe');
  const b64 = p.toBase64UrlSafe();
  assert.ok(!b64.includes('+'));
  assert.ok(!b64.includes('/'));
  assert.ok(!b64.includes('='));

  const p2 = AndroidParcel.fromBase64UrlSafe(b64);
  assert.strictEqual(p2.readInt(), 42);
  assert.strictEqual(p2.readString(), 'test-url-safe');
});

test('KryoBuffer: VarInt and VarIntFlag encoding', () => {
  const k = new KryoBuffer();
  k.writeVarInt(0, true);
  k.writeVarInt(63, true);
  k.writeVarInt(127, true);
  k.writeVarInt(16384, true);

  k.setPosition(0);
  assert.strictEqual(k.readVarInt(true), 0);
  assert.strictEqual(k.readVarInt(true), 63);
  assert.strictEqual(k.readVarInt(true), 127);
  assert.strictEqual(k.readVarInt(true), 16384);
});

test('KryoBuffer: String encoding (null, empty, ASCII, UTF-8)', () => {
  const k = new KryoBuffer();
  k.writeString(null);
  k.writeString('');
  k.writeString('short_ascii');
  k.writeString('长文本包含中文与特殊字符 🚀 @#¥%……&*（）');

  k.setPosition(0);
  assert.strictEqual(k.readString(), null);
  assert.strictEqual(k.readString(), '');
  assert.strictEqual(k.readString(), 'short_ascii');
  assert.strictEqual(k.readString(), '长文本包含中文与特殊字符 🚀 @#¥%……&*（）');
});

test('Cross-platform roundtrip: Windows -> Android Backup -> Windows Restore', () => {
  const testNodes: ProxyNode[] = [
    {
      id: 'node-hk-01',
      name: '香港 VLESS 专线 01',
      type: 'vless',
      server: 'hk01.example.com',
      port: 443,
      groupId: 'sub-01',
      uuid: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      tls: true,
      sni: 'hk01.example.com',
      reality: true,
      publicKey: 'test-pubkey',
      shortId: 'abcd',
      ping: 45,
      trafficUp: 1024,
      trafficDown: 2048,
    },
    {
      id: 'node-us-02',
      name: '美国 Trojan 高速',
      type: 'trojan',
      server: 'us02.example.com',
      port: 8443,
      groupId: 'sub-01',
      password: 'mypassword',
      tls: true,
      sni: 'us02.example.com',
      ping: 150,
    },
  ];

  const testSubs: Subscription[] = [
    {
      id: 'sub-01',
      name: '主力机场订阅',
      url: 'https://example.com/api/v1/client/subscribe?token=abc',
      nodeCount: 2,
      lastUpdate: 1700000000000,
      autoUpdate: true,
      updateIntervalHours: 12,
      status: 'idle',
    },
  ];

  const testRules: RouteRule[] = [
    {
      id: 'rule-01',
      name: '国内直连',
      enabled: true,
      domains: ['geosite:cn'],
      ip: ['geoip:cn', 'geoip:private'],
      outbound: 'direct',
    },
    {
      id: 'rule-02',
      name: '拦截广告',
      enabled: true,
      domains: ['geosite:category-ads-all'],
      outbound: 'block',
    },
  ];

  const testSettings: AppSettings = {
    theme: 'dark',
    language: 'zh-CN',
    startOnBoot: false,
    startMinimized: false,
    autoConnectOnLaunch: false,
    closeToTray: true,
    mixedPort: 7890,
    allowLan: true,
    inboundAuth: false,
    systemProxyEnabled: true,
    systemProxyBypassLan: true,
    tunEnabled: true,
    tunMtu: 9000,
    tunStack: 'native',
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
      serverUrl: 'https://dav.example.com',
      username: 'user',
      password: 'pass',
      remotePath: 'OwnBox',
      autoSync: false,
    },
  };

  // 1. Encode into Android backup JSON
  const mapper = new BackupIdMapper();
  const androidJsonStr = AndroidBackupEncoder.encode(testNodes, testSubs, testRules, testSettings, {
    profiles: true,
    rules: true,
    settings: true,
  }, mapper);

  assert.ok(androidJsonStr);
  const parsedJson = JSON.parse(androidJsonStr);
  assert.strictEqual(parsedJson.version, 1);
  assert.ok(Array.isArray(parsedJson.profiles) && parsedJson.profiles.length === 2);
  assert.ok(Array.isArray(parsedJson.proxies) && parsedJson.proxies.length === 2);
  assert.ok(Array.isArray(parsedJson.groups) && parsedJson.groups.length === 1);
  assert.ok(Array.isArray(parsedJson.rules) && parsedJson.rules.length === 2);
  assert.ok(Array.isArray(parsedJson.settings) && parsedJson.settings.length > 0);

  // 2. Decode using AndroidBackupDecoder
  const decoded = AndroidBackupDecoder.decode(androidJsonStr, mapper);

  assert.strictEqual(decoded.nodes.length, 2);
  assert.strictEqual(decoded.subscriptions.length, 1);
  assert.strictEqual(decoded.rules.length, 2);
  assert.strictEqual(decoded.settings.mixedPort, 7890);
  assert.strictEqual(decoded.settings.theme, 'dark');
  assert.strictEqual(decoded.settings.allowLan, true);

  // Verify node details preserved
  const hkNode = decoded.nodes.find((n) => n.name === '香港 VLESS 专线 01');
  assert.ok(hkNode);
  assert.strictEqual(hkNode.server, 'hk01.example.com');
  assert.strictEqual(hkNode.port, 443);
  assert.strictEqual(hkNode.type, 'vless');

  // Verify subscription details preserved
  const sub = decoded.subscriptions[0];
  assert.strictEqual(sub.name, '主力机场订阅');
  assert.strictEqual(sub.url, 'https://example.com/api/v1/client/subscribe?token=abc');
  assert.strictEqual(sub.autoUpdate, true);

  // Verify rule details preserved
  const cnRule = decoded.rules.find((r) => r.name === '国内直连');
  assert.ok(cnRule);
  assert.strictEqual(cnRule.outbound, 'direct');
  assert.deepStrictEqual(cnRule.domains, ['geosite:cn']);
});

test('Format Detection: Windows, Android, SingBox', () => {
  const winBackup = JSON.stringify({ schema_version: 2, nodes: [] });
  assert.strictEqual(BackupValidator.detectFormat(winBackup).format, 'ownbox_windows');

  const androidBackup = JSON.stringify({ version: 1, profiles: ['abcd'], groups: ['efgh'] });
  assert.strictEqual(BackupValidator.detectFormat(androidBackup).format, 'ownbox_android');

  const singboxBackup = JSON.stringify({ outbounds: [{ type: 'vless', server: '1.2.3.4' }] });
  assert.strictEqual(BackupValidator.detectFormat(singboxBackup).format, 'singbox_config');
});

test('Partial category export and unselected category protection', () => {
  const testNodes: ProxyNode[] = [
    { id: '1', name: 'N1', type: 'vless', server: '1.1.1.1', port: 443, groupId: 'default' },
  ];
  const testRules: RouteRule[] = [{ id: '1', name: 'R1', enabled: true, outbound: 'direct' }];
  const testSettings: AppSettings = Database.getInstance().getSettings();

  // Export only rules
  const rulesOnlyJson = AndroidBackupEncoder.encode(testNodes, [], testRules, testSettings, {
    profiles: false,
    rules: true,
    settings: false,
  });
  const parsed = JSON.parse(rulesOnlyJson);
  assert.strictEqual(parsed.profiles, undefined);
  assert.strictEqual(parsed.groups, undefined);
  assert.ok(parsed.rules && parsed.rules.length === 1);
  assert.strictEqual(parsed.settings, undefined);
});

test('Dry run preview computes adds, updates, and unparseable counts correctly', () => {
  const current = {
    nodes: [{ id: '1', name: 'Node A', type: 'vless' as const, server: '1.1.1.1', port: 443, groupId: 'default' }],
    subscriptions: [],
    rules: [],
    appRules: [],
    settings: Database.getInstance().getSettings(),
  };

  const incoming = {
    format: 'ownbox_windows' as const,
    nodes: [
      { id: '2', name: 'Node A', type: 'vless' as const, server: '1.1.1.1', port: 443, groupId: 'default' }, // match -> update
      { id: '3', name: 'Node B', type: 'trojan' as const, server: '2.2.2.2', port: 443, groupId: 'default' }, // new -> add
    ],
    subscriptions: [],
    rules: [],
    appRules: [],
    unparseableCount: 1,
  };

  const preview = BackupPreview.generatePreview(incoming, current, { profiles: true });
  assert.strictEqual(preview.counts.nodes.total, 2);
  assert.strictEqual(preview.counts.nodes.update, 1);
  assert.strictEqual(preview.counts.nodes.add, 1);
  assert.strictEqual(preview.counts.unparseable, 1);
});

test('Corrupted Base64 tolerance: increments unparseable without crashing', () => {
  const corruptedBackup = JSON.stringify({
    version: 1,
    profiles: ['!!invalid-base64-not-a-parcel!!', 'short'],
    groups: ['another-corrupted-group-string'],
    rules: [],
  });

  const decoded = AndroidBackupDecoder.decode(corruptedBackup);
  assert.ok(decoded.unparseableCount >= 2);
  assert.strictEqual(decoded.nodes.length, 0);
  assert.ok(decoded.warnings.length >= 2);
});

test('Anti-wipe protection: prevents emptying existing nodes on empty import', () => {
  const db = Database.getInstance();
  const originalNodes = [
    { id: 'keep-1', name: 'Must Keep Node', type: 'vless' as const, server: '1.2.3.4', port: 443, groupId: 'default' },
  ];
  db.saveNodes(originalNodes);

  // Attempt to import empty nodes
  BackupTransaction.execute(
    {
      nodes: [],
      subscriptions: [],
    },
    { profiles: true, rules: false, settings: false },
    'replace'
  );

  // Existing node must NOT be wiped
  const afterNodes = db.getNodes();
  assert.ok(afterNodes.length > 0);
  assert.strictEqual(afterNodes[0].name, 'Must Keep Node');
});

test('Multi-protocol support: Shadowsocks, WireGuard, Hysteria2', () => {
  const nodes: ProxyNode[] = [
    {
      id: 'ss-1',
      name: 'SS-Node',
      type: 'shadowsocks',
      server: 'ss.example.com',
      port: 8388,
      password: 'sspassword',
      method: 'aes-256-gcm',
      groupId: 'default',
    },
    {
      id: 'hy2-1',
      name: 'Hy2-Node',
      type: 'hysteria2',
      server: 'hy2.example.com',
      port: 443,
      password: 'hy2password',
      groupId: 'default',
    },
    {
      id: 'wg-1',
      name: 'WG-Node',
      type: 'wireguard',
      server: 'wg.example.com',
      port: 51820,
      privateKey: 'privkey',
      peerPublicKey: 'pubkey',
      groupId: 'default',
    },
  ];

  const mapper = new BackupIdMapper();
  const encoded = AndroidBackupEncoder.encode(nodes, [], [], Database.getInstance().getSettings(), {
    profiles: true,
    rules: false,
    settings: false,
  }, mapper);

  const decoded = AndroidBackupDecoder.decode(encoded, mapper);
  assert.strictEqual(decoded.nodes.length, 3);
  assert.ok(decoded.nodes.some((n) => n.type === 'shadowsocks'));
  assert.ok(decoded.nodes.some((n) => n.type === 'hysteria2'));
  assert.ok(decoded.nodes.some((n) => n.type === 'wireguard'));
});

