import { ProxyNode } from '../../types';

export class UniversalSubscriptionParser {
  /**
   * Safely decodes a URI component without throwing on invalid percent escapes
   */
  public static safeDecodeUri(str: string): string {
    if (!str) return '';
    try {
      return decodeURIComponent(str);
    } catch {
      try {
        return unescape(str);
      } catch {
        return str;
      }
    }
  }

  /**
   * Safely decodes Base64 strings, supporting URL-safe base64 and auto-padding
   */
  public static safeBase64Decode(str: string): string {
    try {
      const clean = str.trim().replace(/-/g, '+').replace(/_/g, '/');
      const pad = clean.length % 4;
      const padded = pad ? clean + '='.repeat(4 - pad) : clean;
      return Buffer.from(padded, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }

  /**
   * Universal parse entry point: handles JSON (Sing-box/Clash), YAML (Clash), Base64, and URI lists
   */
  public static parse(content: string): ProxyNode[] {
    if (!content || typeof content !== 'string') return [];
    const trimmed = content.trim();
    if (!trimmed) return [];

    // 1. Try Sing-box or Clash JSON format
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const json = JSON.parse(trimmed);
        if (Array.isArray(json.outbounds)) {
          return this.parseSingBoxOutbounds(json.outbounds);
        }
        if (Array.isArray(json.proxies)) {
          return this.parseClashProxiesList(json.proxies);
        }
        if (Array.isArray(json.nodes)) {
          return json.nodes;
        }
      } catch {}
    }

    // 2. Try Clash YAML format
    if (trimmed.includes('proxies:')) {
      const clashProxies = this.parseClashYaml(trimmed);
      if (clashProxies.length > 0) {
        return this.parseClashProxiesList(clashProxies);
      }
    }

    // 3. Try Base64-decoded content if it looks like Base64 (single line or no scheme at start)
    const firstLine = trimmed.split(/[\r\n]+/)[0].trim();
    if (
      !firstLine.includes('://') &&
      !firstLine.includes('proxies:') &&
      !firstLine.startsWith('{')
    ) {
      const decoded = this.safeBase64Decode(trimmed);
      if (decoded && (decoded.includes('://') || decoded.includes('proxies:') || decoded.startsWith('{'))) {
        return this.parse(decoded);
      }
    }

    // 4. Line-by-line URI parsing
    return this.parseUriLines(trimmed);
  }

  /**
   * Parse line-by-line URI links
   */
  public static parseUriLines(text: string): ProxyNode[] {
    const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    const nodes: ProxyNode[] = [];

    for (const line of lines) {
      try {
        let node: ProxyNode | null = null;
        if (line.startsWith('vless://')) {
          node = this.parseVless(line);
        } else if (line.startsWith('vmess://')) {
          node = this.parseVmess(line);
        } else if (line.startsWith('trojan://')) {
          node = this.parseTrojan(line);
        } else if (line.startsWith('ss://')) {
          node = this.parseShadowsocks(line);
        } else if (line.startsWith('hy2://') || line.startsWith('hysteria2://')) {
          node = this.parseHysteria2(line);
        } else if (line.startsWith('tuic://')) {
          node = this.parseTuic(line);
        } else if (line.startsWith('wireguard://')) {
          node = this.parseWireguard(line);
        }

        if (node && node.server) {
          nodes.push(node);
        }
      } catch (e) {
        console.warn('Failed to parse line:', line, e);
      }
    }

    return nodes;
  }

  /**
   * Parse Sing-box outbounds
   */
  private static parseSingBoxOutbounds(outbounds: any[]): ProxyNode[] {
    const nodes: ProxyNode[] = [];
    for (const out of outbounds) {
      if (!out || ['direct', 'block', 'dns', 'selector', 'urltest'].includes(out.type)) continue;
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
    return nodes;
  }

  /**
   * Parse Clash YAML text into objects
   */
  private static parseClashYaml(content: string): any[] {
    const proxies: any[] = [];
    const lines = content.split(/\r?\n/);
    let inProxiesSection = false;
    let currentProxy: any = null;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (/^proxies\s*:/i.test(trimmed)) {
        inProxiesSection = true;
        continue;
      }

      if (inProxiesSection && /^[a-zA-Z0-9_-]+\s*:/.test(rawLine) && !rawLine.startsWith(' ') && !rawLine.startsWith('\t')) {
        if (currentProxy) proxies.push(currentProxy);
        break;
      }

      if (!inProxiesSection) continue;

      // Inline flow format: - { name: "...", type: ... }
      const inlineMatch = rawLine.match(/^\s*-\s*\{(.+)\}\s*$/);
      if (inlineMatch) {
        if (currentProxy) {
          proxies.push(currentProxy);
          currentProxy = null;
        }
        const itemStr = inlineMatch[1];
        const obj: any = {};
        const regex = /([a-zA-Z0-9_-]+)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,{}]+))/g;
        let m;
        while ((m = regex.exec(itemStr)) !== null) {
          const key = m[1];
          const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4].trim());
          obj[key] = val;
        }
        if (obj.name && obj.type) proxies.push(obj);
        continue;
      }

      // Block list item: - name: "..."
      const dashMatch = rawLine.match(/^(\s*)-\s*(.*)$/);
      if (dashMatch) {
        if (currentProxy) {
          proxies.push(currentProxy);
        }
        currentProxy = {};
        const rest = dashMatch[2].trim();
        if (rest) {
          const kv = this.parseYamlKv(rest);
          if (kv) currentProxy[kv.key] = kv.value;
        }
        continue;
      }

      // Property under current proxy
      if (currentProxy) {
        const kv = this.parseYamlKv(trimmed);
        if (kv) {
          currentProxy[kv.key] = kv.value;
        }
      }
    }

    if (currentProxy) {
      proxies.push(currentProxy);
    }

    return proxies;
  }

  private static parseYamlKv(str: string): { key: string; value: any } | null {
    const idx = str.indexOf(':');
    if (idx === -1) return null;
    const key = str.slice(0, idx).trim();
    let value: any = str.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    } else if (!isNaN(Number(value)) && value !== '') {
      value = Number(value);
    }
    return { key, value };
  }

  /**
   * Convert Clash proxy objects into ProxyNode models
   */
  private static parseClashProxiesList(clashList: any[]): ProxyNode[] {
    const nodes: ProxyNode[] = [];
    for (const p of clashList) {
      if (!p || !p.name || !p.server) continue;
      const type = (p.type || '').toLowerCase();
      const node: ProxyNode = {
        id: Math.random().toString(36).substring(2),
        name: String(p.name),
        type: 'vless',
        server: String(p.server),
        port: Number(p.port) || 443,
        groupId: 'default',
      };

      if (type === 'ss') {
        node.type = 'shadowsocks';
        node.method = p.cipher;
        node.password = p.password;
        node.obfs = p.plugin;
      } else if (type === 'vmess') {
        node.type = 'vmess';
        node.uuid = p.uuid;
        node.alterId = Number(p.alterId) || 0;
        node.method = p.cipher || 'auto';
        node.tls = !!p.tls;
        node.sni = p.servername || p.sni;
        node.transport = p.network === 'ws' ? 'ws' : (p.network === 'grpc' ? 'grpc' : 'tcp');
        node.transportPath = p['ws-opts']?.path || p['ws-path'];
      } else if (type === 'vless') {
        node.type = 'vless';
        node.uuid = p.uuid;
        node.flow = p.flow;
        node.tls = !!p.tls || !!p['reality-opts'];
        node.reality = !!p['reality-opts'];
        node.publicKey = p['reality-opts']?.['public-key'];
        node.shortId = p['reality-opts']?.['short-id'];
        node.sni = p.servername || p.sni;
        node.fingerprint = p['client-fingerprint'] || 'chrome';
        node.transport = p.network === 'ws' ? 'ws' : (p.network === 'grpc' ? 'grpc' : 'tcp');
        node.transportPath = p['ws-opts']?.path || p['ws-path'];
      } else if (type === 'trojan') {
        node.type = 'trojan';
        node.password = p.password;
        node.tls = true;
        node.sni = p.sni || p.servername;
        node.transport = p.network === 'ws' ? 'ws' : (p.network === 'grpc' ? 'grpc' : 'tcp');
        node.transportPath = p['ws-opts']?.path;
      } else if (type === 'hysteria2' || type === 'hysteria') {
        node.type = 'hysteria2';
        node.password = p.password || p.auth;
        node.tls = true;
        node.sni = p.sni;
        node.obfs = p['obfs-password'] || p.obfs;
        node.upMbps = p.up ? Number(p.up) : undefined;
        node.downMbps = p.down ? Number(p.down) : undefined;
      } else if (type === 'tuic') {
        node.type = 'tuic';
        node.uuid = p.uuid;
        node.password = p.password;
        node.tls = true;
        node.sni = p.sni;
        node.congestionControl = p['congestion-controller'] || 'bbr';
      } else if (type === 'wireguard') {
        node.type = 'wireguard';
        node.privateKey = p['private-key'];
        node.peerPublicKey = p['public-key'];
        node.presharedKey = p['preshared-key'];
        node.localAddress = p.ip;
        node.mtu = p.mtu;
      } else {
        continue;
      }

      nodes.push(node);
    }
    return nodes;
  }

  // --- Specific URI Parsers ---

  public static parseVless(uri: string): ProxyNode | null {
    const url = new URL(uri);
    const rawTag = url.hash.replace(/^#/, '');
    const name = this.safeDecodeUri(rawTag) || url.hostname;
    const search = url.searchParams;

    return {
      id: Math.random().toString(36).substring(2),
      name,
      type: 'vless',
      server: url.hostname.replace(/^\[|\]$/g, ''),
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

  public static parseVmess(uri: string): ProxyNode | null {
    const b64 = uri.replace('vmess://', '');
    const jsonStr = this.safeBase64Decode(b64);
    if (!jsonStr) return null;
    const obj = JSON.parse(jsonStr);

    return {
      id: Math.random().toString(36).substring(2),
      name: obj.ps || obj.add,
      type: 'vmess',
      server: String(obj.add).replace(/^\[|\]$/g, ''),
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

  public static parseTrojan(uri: string): ProxyNode | null {
    const url = new URL(uri);
    const rawTag = url.hash.replace(/^#/, '');
    const name = this.safeDecodeUri(rawTag) || url.hostname;
    const search = url.searchParams;

    return {
      id: Math.random().toString(36).substring(2),
      name,
      type: 'trojan',
      server: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port) || 443,
      groupId: 'default',
      password: url.username,
      tls: true,
      sni: search.get('sni') || url.hostname,
      transport: (search.get('type') as any) || 'tcp',
      transportPath: search.get('path') || undefined,
    };
  }

  public static parseShadowsocks(uri: string): ProxyNode | null {
    const hashIdx = uri.indexOf('#');
    let cleanUri = hashIdx !== -1 ? uri.slice(0, hashIdx) : uri;
    const rawTag = hashIdx !== -1 ? uri.slice(hashIdx + 1) : '';
    const name = this.safeDecodeUri(rawTag);

    cleanUri = cleanUri.replace(/^ss:\/\//, '');

    let method = 'aes-256-gcm';
    let password = '';
    let server = '';
    let port = 8388;

    if (cleanUri.includes('@')) {
      // SIP002 format
      const atParts = cleanUri.split('@');
      const userinfo = atParts[0];
      const hostPort = atParts[1].split('/')[0].split('?')[0];

      if (userinfo.includes(':')) {
        const parts = userinfo.split(':');
        method = parts[0];
        password = parts.slice(1).join(':');
      } else {
        const decoded = this.safeBase64Decode(userinfo);
        const parts = decoded.split(':');
        method = parts[0];
        password = parts.slice(1).join(':');
      }

      const hpParts = hostPort.split(':');
      server = hpParts[0].replace(/^\[|\]$/g, '');
      port = Number(hpParts[1]) || 8388;
    } else {
      // Legacy format
      const decoded = this.safeBase64Decode(cleanUri);
      const atIdx = decoded.lastIndexOf('@');
      if (atIdx !== -1) {
        const userinfo = decoded.slice(0, atIdx);
        const hostPort = decoded.slice(atIdx + 1);
        const parts = userinfo.split(':');
        method = parts[0];
        password = parts.slice(1).join(':');
        const hpParts = hostPort.split(':');
        server = hpParts[0].replace(/^\[|\]$/g, '');
        port = Number(hpParts[1]) || 8388;
      }
    }

    if (!server) return null;

    return {
      id: Math.random().toString(36).substring(2),
      name: name || `${server}:${port}`,
      type: 'shadowsocks',
      server,
      port,
      groupId: 'default',
      method,
      password,
    };
  }

  public static parseHysteria2(uri: string): ProxyNode | null {
    const cleanUri = uri.replace(/^hy2:\/\//, 'https://').replace(/^hysteria2:\/\//, 'https://');
    const url = new URL(cleanUri);
    const rawTag = url.hash.replace(/^#/, '');
    const name = this.safeDecodeUri(rawTag) || url.hostname;
    const search = url.searchParams;

    return {
      id: Math.random().toString(36).substring(2),
      name,
      type: 'hysteria2',
      server: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port) || 443,
      groupId: 'default',
      password: url.username,
      tls: true,
      sni: search.get('sni') || url.hostname,
      obfs: search.get('obfs-password') || search.get('obfs') || undefined,
    };
  }

  public static parseTuic(uri: string): ProxyNode | null {
    const cleanUri = uri.replace(/^tuic:\/\//, 'https://');
    const url = new URL(cleanUri);
    const rawTag = url.hash.replace(/^#/, '');
    const name = this.safeDecodeUri(rawTag) || url.hostname;
    const search = url.searchParams;

    return {
      id: Math.random().toString(36).substring(2),
      name,
      type: 'tuic',
      server: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port) || 443,
      groupId: 'default',
      uuid: url.username,
      password: url.password,
      tls: true,
      sni: search.get('sni') || url.hostname,
      congestionControl: search.get('congestion_control') || 'bbr',
    };
  }

  public static parseWireguard(uri: string): ProxyNode | null {
    const cleanUri = uri.replace(/^wireguard:\/\//, 'https://');
    const url = new URL(cleanUri);
    const rawTag = url.hash.replace(/^#/, '');
    const name = this.safeDecodeUri(rawTag) || url.hostname;
    const search = url.searchParams;

    return {
      id: Math.random().toString(36).substring(2),
      name,
      type: 'wireguard',
      server: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port) || 51820,
      groupId: 'default',
      privateKey: url.username,
      peerPublicKey: search.get('publickey') || search.get('public_key') || undefined,
      presharedKey: search.get('presharedkey') || search.get('preshared_key') || undefined,
      localAddress: search.get('address') || '10.0.0.2/32',
      mtu: Number(search.get('mtu')) || 1420,
    };
  }
}
