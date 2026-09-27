/**
 * AndroidBackupDecoder.ts
 * Decodes OwnBox Android backup files (JSON or ZIP) into Windows domain models:
 * - ProxyNode[]
 * - Subscription[]
 * - RouteRule[]
 * - AppRule[]
 * - Partial<AppSettings>
 *
 * Fully resilient with fail-soft parsing: any corrupt item is skipped and counted,
 * never causing total failure.
 */

import { AndroidParcel } from './AndroidParcel';
import { KryoBuffer } from './KryoBuffer';
import { BackupIdMapper } from './BackupIdMapper';
import { ProxyNode, Subscription, RouteRule, AppRule, AppSettings, ProxyType } from '../../../types';

export interface DecodedAndroidBackup {
  nodes: ProxyNode[];
  subscriptions: Subscription[];
  rules: RouteRule[];
  appRules: AppRule[];
  settings: Partial<AppSettings>;
  unparseableCount: number;
  warnings: string[];
}

export class AndroidBackupDecoder {
  /**
   * Main entry point to decode Android backup data.
   */
  public static decode(
    content: string | Buffer,
    idMapper = new BackupIdMapper()
  ): DecodedAndroidBackup {
    const rawJsonStr = this.extractJsonString(content);
    let json: any;
    try {
      json = JSON.parse(rawJsonStr);
    } catch (e: any) {
      throw new Error(`Failed to parse Android backup JSON: ${e.message}`);
    }

    const nodes: ProxyNode[] = [];
    const subscriptions: Subscription[] = [];
    const rules: RouteRule[] = [];
    const appRules: AppRule[] = [];
    const settings: Partial<AppSettings> = {};
    let unparseableCount = 0;
    const warnings: string[] = [];

    // 1. Decode Groups / Subscriptions
    const rawGroups = json.groups;
    if (Array.isArray(rawGroups)) {
      for (const item of rawGroups) {
        if (typeof item === 'string') {
          try {
            const sub = this.decodeGroup(item, idMapper);
            if (sub) subscriptions.push(sub);
          } catch (e: any) {
            unparseableCount++;
            warnings.push(`Failed to decode group parcel: ${e.message}`);
          }
        } else if (typeof item === 'object' && item !== null && item.name) {
          // Plain object fallback (e.g. from custom JSON exports)
          subscriptions.push({
            id: item.id ? String(item.id) : idMapper.getOrCreateUuid(Math.floor(Math.random() * 100000), 'group'),
            name: item.name,
            url: item.url || item.link || '',
            nodeCount: 0,
            lastUpdate: item.sub_last_update || Date.now(),
            autoUpdate: !item.skip_auto_update,
            updateIntervalHours: 24,
            status: 'idle',
          });
        }
      }
    }

    // 2. Decode Proxies / Profiles
    const rawProfiles = json.profiles || json.proxies;
    if (Array.isArray(rawProfiles)) {
      for (const item of rawProfiles) {
        if (typeof item === 'string') {
          try {
            const node = this.decodeProxyEntity(item, idMapper);
            if (node) nodes.push(node);
          } catch (e: any) {
            unparseableCount++;
            warnings.push(`Failed to decode proxy entity parcel: ${e.message}`);
          }
        } else if (typeof item === 'object' && item !== null && item.name) {
          // Plain object fallback
          nodes.push({
            id: item.id ? String(item.id) : idMapper.getOrCreateUuid(Math.floor(Math.random() * 100000), 'node'),
            name: item.name,
            type: (item.type as ProxyType) || 'vless',
            server: item.server || '127.0.0.1',
            port: item.port || 443,
            groupId: item.gid ? String(item.gid) : 'default',
            uuid: item.uuid,
            password: item.password,
            ping: item.latency || 0,
            trafficUp: item.traffic_up || 0,
            trafficDown: item.traffic_dl || 0,
          });
        }
      }
    }

    // 3. Decode Rules
    const rawRules = json.rules;
    if (Array.isArray(rawRules)) {
      for (const item of rawRules) {
        if (typeof item === 'string') {
          try {
            const rule = this.decodeRuleEntity(item, idMapper, appRules);
            if (rule) rules.push(rule);
          } catch (e: any) {
            unparseableCount++;
            warnings.push(`Failed to decode rule parcel: ${e.message}`);
          }
        }
      }
    }

    // 4. Decode Settings
    const rawSettings = json.settings;
    if (Array.isArray(rawSettings)) {
      for (const item of rawSettings) {
        if (typeof item === 'string') {
          try {
            this.decodeKeyValuePair(item, settings);
          } catch (e: any) {
            warnings.push(`Failed to decode setting item: ${e.message}`);
          }
        }
      }
    }

    return {
      nodes,
      subscriptions,
      rules,
      appRules,
      settings,
      unparseableCount,
      warnings,
    };
  }

  /**
   * Extracts JSON string from raw string or ZIP buffer.
   */
  private static extractJsonString(content: string | Buffer): string {
    if (typeof content === 'string') {
      const trimmed = content.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return trimmed;
      }
      // If base64 or zip string, convert to buffer first
      const buf = Buffer.from(content, 'utf8');
      if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
        return this.extractJsonFromZip(buf);
      }
      return trimmed;
    }

    if (Buffer.isBuffer(content)) {
      if (content.length >= 4 && content[0] === 0x50 && content[1] === 0x4b) {
        return this.extractJsonFromZip(content);
      }
      return content.toString('utf8');
    }

    throw new Error('Unsupported content type for Android backup');
  }

  /**
   * Minimal ZIP parser to extract first .json entry without external dependency.
   */
  private static extractJsonFromZip(buf: Buffer): string {
    let offset = 0;
    while (offset < buf.length - 30) {
      const sig = buf.readUInt32LE(offset);
      if (sig !== 0x04034b50) break; // Local file header signature

      const compMethod = buf.readUInt16LE(offset + 8);
      const compSize = buf.readUInt32LE(offset + 18);
      const uncompSize = buf.readUInt32LE(offset + 22);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);

      const fileName = buf.toString('utf8', offset + 30, offset + 30 + nameLen);
      const fileDataOffset = offset + 30 + nameLen + extraLen;

      if (fileName.endsWith('.json')) {
        const fileData = buf.subarray(fileDataOffset, fileDataOffset + compSize);
        if (compMethod === 0) {
          // Stored (no compression)
          return fileData.toString('utf8');
        } else if (compMethod === 8) {
          // Deflate
          const zlib = require('zlib');
          const decompressed = zlib.inflateRawSync(fileData);
          return decompressed.toString('utf8');
        }
      }

      offset = fileDataOffset + compSize;
    }
    throw new Error('No .json file found inside ZIP archive');
  }

  /**
   * Decodes a Base64 URL-safe string containing an Android Parcelled ProxyGroup.
   */
  private static decodeGroup(b64Str: string, idMapper: BackupIdMapper): Subscription | null {
    const parcel = AndroidParcel.fromBase64UrlSafe(b64Str);
    const bytes = parcel.createByteArray();
    if (!bytes || bytes.length === 0) {
      throw new Error('Invalid or empty group parcel byte payload');
    }

    const k = KryoBuffer.fromBuffer(bytes);
    const version = k.readInt();
    const id = k.readLong();
    const userOrder = k.readLong();
    const ungrouped = k.readBoolean();
    const name = k.readString();
    const type = k.readInt(); // 0 = BASIC, 1 = SUBSCRIPTION

    if (type !== 1) {
      // Basic group (not a subscription with URL)
      return null;
    }

    // SubscriptionBean
    const subVersion = k.readInt();
    const subType = k.readInt();
    const link = k.readString();
    const forceResolve = k.readBoolean();
    const deduplication = k.readBoolean();
    const updateWhenConnectedOnly = k.readBoolean();
    const customUserAgent = k.readString();
    const autoUpdate = k.readBoolean();
    const autoUpdateDelay = k.readInt();
    const lastUpdated = k.readInt();
    const subscriptionUserinfo = k.readString();

    const subId = idMapper.getOrCreateUuid(id, 'sub');
    return {
      id: subId,
      name: name || '订阅',
      url: link || '',
      nodeCount: 0,
      lastUpdate: lastUpdated ? lastUpdated * 1000 : Date.now(),
      autoUpdate: !!autoUpdate,
      updateIntervalHours: Math.max(1, Math.round((autoUpdateDelay || 86400) / 3600)),
      status: 'idle',
    };
  }

  /**
   * Decodes a Base64 URL-safe string containing an Android Parcelled ProxyEntity.
   */
  private static decodeProxyEntity(b64Str: string, idMapper: BackupIdMapper): ProxyNode | null {
    const parcel = AndroidParcel.fromBase64UrlSafe(b64Str);
    const bytes = parcel.createByteArray();
    if (!bytes || bytes.length === 0) {
      throw new Error('Invalid or empty proxy entity parcel byte payload');
    }

    const k = KryoBuffer.fromBuffer(bytes);
    const version = k.readInt();
    const id = k.readLong();
    const groupId = k.readLong();
    const type = k.readInt();
    const userOrder = k.readLong();
    const tx = k.readLong();
    const rx = k.readLong();
    const status = k.readInt();
    const ping = k.readInt();
    const uuid = k.readString();
    const error = k.readString();

    let speedTestMode = '';
    let dlBps = 0n;
    let ulBps = 0n;
    if (version >= 1) {
      speedTestMode = k.readString() || '';
      dlBps = k.readLong();
      ulBps = k.readLong();
    }

    const beanLen = k.readVarInt(true);
    const beanBytes = k.readBytes(beanLen);
    const dirty = k.hasRemaining() ? k.readBoolean() : false;

    const nodeId = idMapper.getOrCreateUuid(id, 'node');
    const groupUuid = groupId > 0n ? idMapper.getOrCreateUuid(groupId, 'sub') : 'default';

    // Parse Bean bytes according to type
    return this.parseBeanBytes(type, beanBytes, {
      id: nodeId,
      groupId: groupUuid,
      uuid: uuid || undefined,
      ping: ping > 0 ? ping : undefined,
      trafficUp: Number(tx),
      trafficDown: Number(rx),
    });
  }

  /**
   * Parses Kryo serialized bean bytes into a ProxyNode.
   */
  private static parseBeanBytes(
    type: number,
    beanBytes: Buffer,
    base: Partial<ProxyNode>
  ): ProxyNode {
    const k = KryoBuffer.fromBuffer(beanBytes);

    try {
      if (type === 998) {
        // TYPE_CONFIG -> ConfigBean
        const configVersion = k.readInt();
        const serverAddress = k.readString();
        const serverPort = k.readInt();
        const extraVersion = k.readInt();
        const name = k.readString();
        const customOutboundJson = k.readString();
        const customConfigJson = k.readString();
        const configType = k.readInt(); // 0=config, 1=outbound
        const configStr = k.readString();

        if (configStr && configStr.trim().startsWith('{')) {
          try {
            const out = JSON.parse(configStr);
            return {
              id: base.id!,
              groupId: base.groupId!,
              name: name || out.tag || out.server || 'Custom Outbound',
              type: this.mapProtocolType(out.type),
              server: out.server || serverAddress || '127.0.0.1',
              port: out.server_port || serverPort || 443,
              uuid: out.uuid || base.uuid,
              password: out.password,
              tls: !!out.tls?.enabled,
              sni: out.tls?.server_name,
              reality: !!out.tls?.reality?.enabled,
              publicKey: out.tls?.reality?.public_key,
              shortId: out.tls?.reality?.short_id,
              transport: out.transport?.type,
              transportPath: out.transport?.path,
              rawOutbound: out,
              ping: base.ping,
              trafficUp: base.trafficUp,
              trafficDown: base.trafficDown,
            };
          } catch {}
        }

        return {
          id: base.id!,
          groupId: base.groupId!,
          name: name || 'Custom Config',
          type: 'vless',
          server: serverAddress || '127.0.0.1',
          port: serverPort || 443,
          ping: base.ping,
          trafficUp: base.trafficUp,
          trafficDown: base.trafficDown,
        };
      }

      // Standard Beans (VMess, Trojan, Shadowsocks, Hysteria, Tuic, SOCKS, HTTP, WireGuard)
      // AbstractBean starts with serverAddress (String) and serverPort (Int)
      const serverAddress = k.readString() || '127.0.0.1';
      const serverPort = k.readInt() || 443;

      let name = '';
      let password = '';
      let method = '';
      let protocolType: ProxyType = 'vless';

      if (type === 4) {
        // TYPE_VMESS
        protocolType = 'vmess';
      } else if (type === 6) {
        // TYPE_TROJAN
        protocolType = 'trojan';
      } else if (type === 2) {
        // TYPE_SS
        protocolType = 'shadowsocks';
      } else if (type === 15) {
        // TYPE_HYSTERIA
        protocolType = 'hysteria2';
      } else if (type === 20) {
        // TYPE_TUIC
        protocolType = 'tuic';
      } else if (type === 0) {
        // TYPE_SOCKS
        protocolType = 'socks';
      } else if (type === 1) {
        // TYPE_HTTP
        protocolType = 'http';
      } else if (type === 18) {
        // TYPE_WG
        protocolType = 'wireguard';
      }

      // Read remaining strings to find name, passwords, or UUIDs
      const remainingStrings: string[] = [];
      while (k.hasRemaining()) {
        try {
          const s = k.readString();
          if (s) remainingStrings.push(s);
        } catch {
          break;
        }
      }

      if (remainingStrings.length > 0) {
        name = remainingStrings[0];
      }

      return {
        id: base.id!,
        groupId: base.groupId!,
        name: name || `${protocolType.toUpperCase()} Node`,
        type: protocolType,
        server: serverAddress,
        port: serverPort,
        uuid: base.uuid,
        password: password || undefined,
        method: method || undefined,
        ping: base.ping,
        trafficUp: base.trafficUp,
        trafficDown: base.trafficDown,
      };
    } catch (e) {
      // Fallback: search for embedded JSON or plaintext server in bean bytes
      const rawText = beanBytes.toString('utf8');
      const jsonMatch = rawText.match(/\{[\s\S]*"type"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const out = JSON.parse(jsonMatch[0]);
          return {
            id: base.id!,
            groupId: base.groupId!,
            name: out.tag || out.server || 'Recovered Node',
            type: this.mapProtocolType(out.type),
            server: out.server || '127.0.0.1',
            port: out.server_port || 443,
            uuid: out.uuid || base.uuid,
            password: out.password,
            rawOutbound: out,
            ping: base.ping,
          };
        } catch {}
      }

      return {
        id: base.id!,
        groupId: base.groupId!,
        name: `Node ${base.id?.substring(0, 8)}`,
        type: 'vless',
        server: '127.0.0.1',
        port: 443,
        ping: base.ping,
      };
    }
  }

  private static mapProtocolType(typeStr: string): ProxyType {
    const s = (typeStr || '').toLowerCase();
    if (s.includes('vmess')) return 'vmess';
    if (s.includes('vless')) return 'vless';
    if (s.includes('trojan')) return 'trojan';
    if (s.includes('shadowsocksr') || s.includes('ssr')) return 'shadowsocksr';
    if (s.includes('shadowsocks') || s.includes('ss')) return 'shadowsocks';
    if (s.includes('hysteria2') || s.includes('hy2')) return 'hysteria2';
    if (s.includes('hysteria')) return 'hysteria';
    if (s.includes('tuic')) return 'tuic';
    if (s.includes('wireguard') || s.includes('wg')) return 'wireguard';
    if (s.includes('snell')) return 'snell';
    if (s.includes('http')) return 'http';
    return 'socks';
  }

  /**
   * Decodes a Base64 URL-safe string containing a Kotlin Parcelled RuleEntity.
   */
  private static decodeRuleEntity(
    b64Str: string,
    idMapper: BackupIdMapper,
    appRulesCollector: AppRule[]
  ): RouteRule | null {
    const parcel = AndroidParcel.fromBase64UrlSafe(b64Str);
    const id = parcel.readLong();
    const name = parcel.readString();
    const config = parcel.readString();
    const userOrder = parcel.readLong();
    const enabled = parcel.readInt() !== 0;
    const domains = parcel.readString();
    const ip = parcel.readString();
    const port = parcel.readString();
    const sourcePort = parcel.readString();
    const network = parcel.readString();
    const source = parcel.readString();
    const protocol = parcel.readString();
    const ruleset = parcel.readString();
    const outbound = parcel.readLong();

    // Packages set (Kotlin parcelize writes count + strings)
    const packages: string[] = [];
    if (parcel.dataAvail() >= 4) {
      try {
        const pkgCount = parcel.readInt();
        for (let i = 0; i < pkgCount; i++) {
          const pkg = parcel.readString();
          if (pkg) packages.push(pkg);
        }
      } catch {}
    }

    // Determine outbound string: 0 = proxy, -1 = direct/bypass, -2 = block
    let outboundStr: 'proxy' | 'direct' | 'block' | string = 'proxy';
    if (outbound === 0n) outboundStr = 'proxy';
    else if (outbound === -1n) outboundStr = 'direct';
    else if (outbound === -2n) outboundStr = 'block';
    else if (outbound > 0n) {
      outboundStr = idMapper.getOrCreateUuid(outbound, 'node');
    }

    const ruleId = idMapper.getOrCreateUuid(id, 'rule');

    // If package rules exist, map them to AppRules
    if (packages.length > 0) {
      for (const pkg of packages) {
        const action: 'proxy' | 'direct' | 'block' =
          outboundStr === 'block' ? 'block' : outboundStr === 'direct' ? 'direct' : 'proxy';
        appRulesCollector.push({
          id: `app-${pkg.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
          name: pkg,
          exePath: `${pkg}.exe`,
          action,
          enabled,
        });
      }
    }

    return {
      id: ruleId,
      name: name || `Rule ${id}`,
      enabled,
      domains: domains ? domains.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      ip: ip ? ip.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      port: port || undefined,
      sourcePort: sourcePort || undefined,
      network: network || undefined,
      protocol: protocol || undefined,
      outbound: outboundStr,
    };
  }

  /**
   * Decodes an Android KeyValuePair and maps recognized settings to AppSettings.
   */
  private static decodeKeyValuePair(b64Str: string, settings: Partial<AppSettings>): void {
    const parcel = AndroidParcel.fromBase64UrlSafe(b64Str);
    const key = parcel.readString();
    const valueType = parcel.readInt();
    const valueBytes = parcel.createByteArray();

    if (!key || !valueBytes) return;

    // Decode value according to valueType
    let parsedValue: any = null;
    const buf = Buffer.from(valueBytes);

    if (valueType === 1 && buf.length >= 1) {
      // TYPE_BOOLEAN
      parsedValue = buf[0] !== 0;
    } else if (valueType === 2 && buf.length >= 4) {
      // TYPE_FLOAT
      parsedValue = buf.readFloatBE(0);
    } else if (valueType === 3 && buf.length >= 4) {
      // TYPE_INT
      parsedValue = buf.readInt32BE(0);
    } else if (valueType === 4 && buf.length >= 8) {
      // TYPE_LONG
      parsedValue = Number(buf.readBigInt64BE(0));
    } else if (valueType === 5) {
      // TYPE_STRING
      parsedValue = buf.toString('utf8');
    }

    // Map known Android keys to Windows AppSettings
    switch (key.toLowerCase()) {
      case 'mixed_port':
      case 'socks_port':
        if (typeof parsedValue === 'number' && parsedValue > 0) settings.mixedPort = parsedValue;
        break;
      case 'allow_access':
      case 'allow_lan':
        if (typeof parsedValue === 'boolean') settings.allowLan = parsedValue;
        break;
      case 'theme':
        if (typeof parsedValue === 'string') {
          settings.theme = parsedValue === 'dark' ? 'dark' : parsedValue === 'light' ? 'light' : 'system';
        }
        break;
      case 'routing_mode':
        if (typeof parsedValue === 'string') {
          settings.routingMode = parsedValue === 'global' ? 'global' : parsedValue === 'direct' ? 'direct' : 'rule';
        }
        break;
      case 'tun_implementation':
      case 'tun_stack':
        if (typeof parsedValue === 'string') {
          settings.tunStack = ['system', 'gvisor', 'mixed', 'native'].includes(parsedValue)
            ? (parsedValue as any)
            : 'native';
        }
        break;
      case 'tun_enabled':
        if (typeof parsedValue === 'boolean') settings.tunEnabled = parsedValue;
        break;
      case 'clash_api_port':
        if (typeof parsedValue === 'number') settings.clashApiPort = parsedValue;
        break;
      case 'log_level':
        if (typeof parsedValue === 'string') {
          settings.logLevel = (parsedValue.toLowerCase() as any) || 'info';
        }
        break;
    }
  }
}
