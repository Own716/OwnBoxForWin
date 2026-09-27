/**
 * AndroidBackupEncoder.ts
 * Encodes Windows domain models into OwnBox Android compatible backup JSON:
 * - profiles / proxies: Base64 Parcelled ProxyEntity (TYPE_CONFIG with sing-box outbound JSON)
 * - groups: Base64 Parcelled ProxyGroup (SubscriptionBean)
 * - rules: Base64 Parcelled RuleEntity
 * - settings: Base64 Parcelled KeyValuePair
 *
 * Can be directly restored by OwnBox Android BackupFragment without modifying Android code.
 */

import { AndroidParcel } from './AndroidParcel';
import { KryoBuffer } from './KryoBuffer';
import { BackupIdMapper } from './BackupIdMapper';
import { ProxyNode, Subscription, RouteRule, AppSettings, BackupCategories } from '../../../types';

export class AndroidBackupEncoder {
  public static encode(
    nodes: ProxyNode[],
    subscriptions: Subscription[],
    rules: RouteRule[],
    settings: AppSettings,
    categories: BackupCategories = { profiles: true, rules: true, settings: true },
    idMapper = new BackupIdMapper()
  ): string {
    const result: Record<string, any> = {
      version: 1,
    };

    // 1. Categories: Profiles & Groups
    if (categories.profiles) {
      const groupsBase64: string[] = [];
      let groupOrder = 1n;
      for (const sub of subscriptions) {
        try {
          const b64 = this.encodeSubscription(sub, groupOrder++, idMapper);
          groupsBase64.push(b64);
        } catch (e) {
          console.warn(`Failed to encode subscription to Android format: ${sub.name}`, e);
        }
      }
      result.groups = groupsBase64;

      const profilesBase64: string[] = [];
      let nodeOrder = 1n;
      for (const node of nodes) {
        try {
          const b64 = this.encodeProxyNode(node, nodeOrder++, idMapper);
          profilesBase64.push(b64);
        } catch (e) {
          console.warn(`Failed to encode proxy node to Android format: ${node.name}`, e);
        }
      }
      // Populate both profiles and proxies for maximum Android compatibility
      result.profiles = profilesBase64;
      result.proxies = profilesBase64;
    }

    // 2. Categories: Routing Rules
    if (categories.rules) {
      const rulesBase64: string[] = [];
      let ruleOrder = 1n;
      for (const rule of rules) {
        try {
          const b64 = this.encodeRouteRule(rule, ruleOrder++, idMapper);
          rulesBase64.push(b64);
        } catch (e) {
          console.warn(`Failed to encode route rule to Android format: ${rule.name}`, e);
        }
      }
      result.rules = rulesBase64;
    }

    // 3. Categories: Settings
    if (categories.settings) {
      const settingsBase64: string[] = [];
      try {
        this.encodeSettings(settings, settingsBase64);
      } catch (e) {
        console.warn('Failed to encode settings to Android format', e);
      }
      result.settings = settingsBase64;
    }

    return JSON.stringify(result, null, 2);
  }

  /**
   * Encodes a Subscription into an Android Parcelled ProxyGroup (Base64 URL-safe).
   */
  private static encodeSubscription(
    sub: Subscription,
    userOrder: bigint,
    idMapper: BackupIdMapper
  ): string {
    const longId = idMapper.getOrCreateLong(sub.id);

    const k = new KryoBuffer(512);
    // ProxyGroup.serializeToBuffer
    k.writeInt(0); // version: 0
    k.writeLong(longId);
    k.writeLong(userOrder);
    k.writeBoolean(false); // ungrouped
    k.writeString(sub.name || '订阅');
    k.writeInt(1); // type = GroupType.SUBSCRIPTION (1)

    // SubscriptionBean.serializeToBuffer
    k.writeInt(4); // subVersion: 4
    k.writeInt(0); // subType
    k.writeString(sub.url || '');
    k.writeBoolean(false); // forceResolve
    k.writeBoolean(true); // deduplication
    k.writeBoolean(false); // updateWhenConnectedOnly
    k.writeString(''); // customUserAgent
    k.writeBoolean(sub.autoUpdate);
    k.writeInt((sub.updateIntervalHours || 24) * 3600); // autoUpdateDelay in seconds
    k.writeInt(Math.floor((sub.lastUpdate || Date.now()) / 1000)); // lastUpdated
    k.writeString(''); // subscriptionUserinfo
    k.writeInt(0); // filterMode
    k.writeString(''); // filterRegex
    k.writeString(''); // serverDnsResolver
    k.writeBoolean(false); // lockUserAgent

    k.writeInt(0); // order = GroupOrder.ORIGIN

    // Put into Android Parcel
    const parcel = new AndroidParcel(k.getPosition() + 16);
    parcel.writeByteArray(k.toBuffer());
    return parcel.toBase64UrlSafe();
  }

  /**
   * Encodes a ProxyNode into an Android Parcelled ProxyEntity (TYPE_CONFIG 998).
   */
  private static encodeProxyNode(
    node: ProxyNode,
    userOrder: bigint,
    idMapper: BackupIdMapper
  ): string {
    const nodeLongId = idMapper.getOrCreateLong(node.id);
    const groupLongId = node.groupId && node.groupId !== 'default' ? idMapper.getOrCreateLong(node.groupId) : 0n;

    // Build sing-box outbound JSON
    const outboundJson = this.buildOutboundJson(node);
    const configStr = JSON.stringify(outboundJson);

    // Kryo buffer for ConfigBean
    const kBean = new KryoBuffer(configStr.length + 256);
    kBean.writeInt(0); // ConfigBean version: 0
    kBean.writeString(node.server || '127.0.0.1'); // serverAddress
    kBean.writeInt(node.port || 443); // serverPort
    kBean.writeInt(1); // ConfigBean type: 1 = outbound
    kBean.writeString(configStr); // config
    kBean.writeInt(1); // extraVersion: 1
    kBean.writeString(node.name || 'Outbound'); // name
    kBean.writeString(''); // customOutboundJson
    kBean.writeString(''); // customConfigJson

    const beanBytes = kBean.toBuffer();

    // Kryo buffer for ProxyEntity
    const kEntity = new KryoBuffer(beanBytes.length + 128);
    kEntity.writeInt(1); // version: 1
    kEntity.writeLong(nodeLongId);
    kEntity.writeLong(groupLongId);
    kEntity.writeInt(998); // type = TYPE_CONFIG
    kEntity.writeLong(userOrder);
    kEntity.writeLong(BigInt(node.trafficUp || 0));
    kEntity.writeLong(BigInt(node.trafficDown || 0));
    kEntity.writeInt(0); // status
    kEntity.writeInt(node.ping || 0);
    kEntity.writeString(node.uuid || '');
    kEntity.writeString(null); // error
    kEntity.writeString(''); // speedTestMode
    kEntity.writeLong(0n); // speedTestDownloadBitsPerSecond
    kEntity.writeLong(0n); // speedTestUploadBitsPerSecond

    kEntity.writeVarInt(beanBytes.length, true);
    kEntity.writeBytes(beanBytes);
    kEntity.writeBoolean(false); // dirty

    // Android Parcel
    const parcel = new AndroidParcel(kEntity.getPosition() + 16);
    parcel.writeByteArray(kEntity.toBuffer());
    return parcel.toBase64UrlSafe();
  }

  /**
   * Constructs valid Sing-box outbound configuration for any ProxyNode.
   */
  private static buildOutboundJson(node: ProxyNode): Record<string, any> {
    if (node.rawOutbound) {
      return {
        ...node.rawOutbound,
        tag: node.name,
        server: node.server,
        server_port: node.port,
      };
    }

    const type = node.type || 'vless';
    const out: Record<string, any> = {
      type,
      tag: node.name,
      server: node.server,
      server_port: node.port,
    };

    if (node.uuid) out.uuid = node.uuid;
    if (node.password) out.password = node.password;
    if (node.method) out.method = node.method;
    if (node.alterId !== undefined) out.alter_id = node.alterId;
    if (node.network) out.network = node.network;
    if (node.flow) out.flow = node.flow;

    if (node.tls || node.reality) {
      out.tls = {
        enabled: true,
        server_name: node.sni || node.server,
        insecure: !!node.insecure,
      };
      if (node.alpn && node.alpn.length > 0) {
        out.tls.alpn = node.alpn;
      }
      if (node.reality) {
        out.tls.reality = {
          enabled: true,
          public_key: node.publicKey || '',
          short_id: node.shortId || '',
        };
        if (node.fingerprint) {
          out.tls.utls = {
            enabled: true,
            fingerprint: node.fingerprint,
          };
        }
      }
    }

    if (node.transport && node.transport !== 'tcp') {
      out.transport = {
        type: node.transport,
      };
      if (node.transportPath) out.transport.path = node.transportPath;
      if (node.transportHost) out.transport.headers = { Host: node.transportHost };
    }

    return out;
  }

  /**
   * Encodes a RouteRule into a Kotlin Parcelled RuleEntity (Base64 URL-safe).
   */
  private static encodeRouteRule(
    rule: RouteRule,
    userOrder: bigint,
    idMapper: BackupIdMapper
  ): string {
    const ruleLongId = idMapper.getOrCreateLong(rule.id);

    // outbound mapping: 0 = proxy, -1 = direct/bypass, -2 = block
    let outboundNum = 0n;
    if (rule.outbound === 'direct') outboundNum = -1n;
    else if (rule.outbound === 'block') outboundNum = -2n;

    const parcel = new AndroidParcel(512);
    parcel.writeLong(ruleLongId);
    parcel.writeString(rule.name || `Rule ${ruleLongId}`);
    parcel.writeString(''); // config
    parcel.writeLong(userOrder);
    parcel.writeInt(rule.enabled ? 1 : 0);
    parcel.writeString(rule.domains ? rule.domains.join(',') : '');
    parcel.writeString(rule.ip ? rule.ip.join(',') : '');
    parcel.writeString(rule.port || '');
    parcel.writeString(rule.sourcePort || '');
    parcel.writeString(rule.network || '');
    parcel.writeString(''); // source
    parcel.writeString(rule.protocol || '');
    parcel.writeString(''); // ruleset
    parcel.writeLong(outboundNum);
    parcel.writeInt(0); // packages count = 0

    return parcel.toBase64UrlSafe();
  }

  /**
   * Encodes key AppSettings entries into KeyValuePair parcels.
   */
  private static encodeSettings(settings: AppSettings, collector: string[]): void {
    // 1. mixed_port (Int)
    if (settings.mixedPort) {
      collector.push(this.encodeKeyValuePair('mixed_port', 3, (buf) => buf.writeInt32BE(settings.mixedPort, 0), 4));
    }
    // 2. allow_lan (Boolean)
    if (settings.allowLan !== undefined) {
      collector.push(this.encodeKeyValuePair('allow_access', 1, (buf) => (buf[0] = settings.allowLan ? 1 : 0), 1));
    }
    // 3. routing_mode (String)
    if (settings.routingMode) {
      collector.push(this.encodeKeyValuePairString('routing_mode', settings.routingMode));
    }
    // 4. tun_enabled (Boolean)
    if (settings.tunEnabled !== undefined) {
      collector.push(this.encodeKeyValuePair('tun_enabled', 1, (buf) => (buf[0] = settings.tunEnabled ? 1 : 0), 1));
    }
    // 5. clash_api_port (Int)
    if (settings.clashApiPort) {
      collector.push(this.encodeKeyValuePair('clash_api_port', 3, (buf) => buf.writeInt32BE(settings.clashApiPort, 0), 4));
    }
    // 6. theme (String)
    if (settings.theme) {
      collector.push(this.encodeKeyValuePairString('theme', settings.theme));
    }
  }

  private static encodeKeyValuePair(
    key: string,
    valueType: number,
    writer: (buf: Buffer) => void,
    byteLen: number
  ): string {
    const valBuf = Buffer.alloc(byteLen);
    writer(valBuf);

    const parcel = new AndroidParcel(128);
    parcel.writeString(key);
    parcel.writeInt(valueType);
    parcel.writeByteArray(valBuf);
    return parcel.toBase64UrlSafe();
  }

  private static encodeKeyValuePairString(key: string, val: string): string {
    const valBuf = Buffer.from(val, 'utf8');
    const parcel = new AndroidParcel(valBuf.length + 64);
    parcel.writeString(key);
    parcel.writeInt(5); // TYPE_STRING
    parcel.writeByteArray(valBuf);
    return parcel.toBase64UrlSafe();
  }
}
