import { ProxyNode, RouteRule, AppRule, DnsConfig, AppSettings } from '../../types';

export class ConfigGenerator {
  /**
   * Generates a complete, standard Sing-box JSON configuration
   */
  public static generate(
    activeNodeId: string,
    nodes: ProxyNode[],
    rules: RouteRule[],
    appRules: AppRule[],
    dns: DnsConfig,
    settings: AppSettings
  ): Record<string, any> {
    const activeNode = nodes.find((n) => n.id === activeNodeId) || nodes[0];

    // 1. Inbounds
    const inbounds: any[] = [
      {
        type: 'mixed',
        tag: 'mixed-in',
        listen: settings.allowLan ? '0.0.0.0' : '127.0.0.1',
        listen_port: settings.mixedPort || 2080,
      },
    ];

    if (settings.inboundAuth && settings.inboundUser && settings.inboundPass) {
      inbounds[0].users = [
        {
          username: settings.inboundUser,
          password: settings.inboundPass,
        },
      ];
    }

    if (settings.tunEnabled) {
      inbounds.push({
        type: 'tun',
        tag: 'tun-in',
        interface_name: 'OwnBoxTun',
        address: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
        mtu: settings.tunMtu || 9000,
        auto_route: settings.tunAutoRoute !== false,
        strict_route: settings.tunStrictRoute || false,
      });
    }

    // 2. Outbounds
    const outbounds: any[] = [];

    // System outbounds
    outbounds.push({ type: 'direct', tag: 'direct' });

    // Node outbounds
    const nodeTags: string[] = [];
    for (const node of nodes) {
      const nodeOutbound = this.buildNodeOutbound(node);
      if (nodeOutbound) {
        outbounds.push(nodeOutbound);
        nodeTags.push(nodeOutbound.tag);
      }
    }

    // Proxy selector
    const mainProxyTag = activeNode ? `node-${activeNode.id}` : (nodeTags[0] || 'direct');
    outbounds.unshift({
      type: 'selector',
      tag: 'proxy',
      outbounds: nodeTags.length > 0 ? nodeTags : ['direct'],
      default: mainProxyTag,
    });

    // 3. DNS Configuration
    const dnsServers: any[] = [
      this.parseDnsServer('remote-dns', dns.remoteDns || 'https://1.1.1.1/dns-query', 'proxy'),
      this.parseDnsServer('direct-dns', dns.directDns || '223.5.5.5', 'direct'),
    ];

    if (dns.mode === 'fakeip') {
      dnsServers.unshift({
        tag: 'fakeip-dns',
        type: 'fakeip',
        inet4_range: dns.fakeIpRange || '198.18.0.0/15',
      });
    }

    const dnsRules: any[] = [
      {
        server: 'direct-dns',
      },
    ];

    if (dns.mode === 'fakeip') {
      dnsRules.unshift({
        inbound: settings.tunEnabled ? ['tun-in', 'mixed-in'] : ['mixed-in'],
        server: 'fakeip-dns',
      });
    }

    const dnsConfig: any = {
      servers: dnsServers,
      rules: dnsRules,
      final: 'remote-dns',
      strategy: 'prefer_ipv4',
    };

    // 4. Route Rules
    const ruleSets: any[] = [
      {
        tag: 'geosite-cn',
        type: 'remote',
        format: 'binary',
        url: 'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/cn.srs',
        download_detour: 'direct',
      },
      {
        tag: 'geoip-cn',
        type: 'remote',
        format: 'binary',
        url: 'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/cn.srs',
        download_detour: 'direct',
      },
    ];

    const routeRules: any[] = [
      {
        action: 'sniff',
      },
      {
        protocol: 'dns',
        action: 'hijack-dns',
      },
    ];

    if (settings.systemProxyBypassLan) {
      routeRules.push({
        ip_is_private: true,
        outbound: 'direct',
      });
    }

    // App rules (Windows process routing)
    for (const app of appRules) {
      if (!app.enabled) continue;
      const ruleItem: any = {};
      if (app.action === 'block') {
        ruleItem.action = 'reject';
      } else {
        ruleItem.outbound = app.action;
      }
      if (app.name) {
        const exeName = app.name.endsWith('.exe') ? app.name : `${app.name}.exe`;
        ruleItem.process_name = [exeName];
      }
      if (app.exePath) {
        ruleItem.process_path = [app.exePath];
      }
      routeRules.push(ruleItem);
    }

    // Custom Route Rules
    for (const r of rules) {
      if (!r.enabled) continue;
      const ruleObj: any = {};
      if (r.outbound === 'block') {
        ruleObj.action = 'reject';
      } else if (r.outbound === 'proxy' || r.outbound === 'direct') {
        ruleObj.outbound = r.outbound;
      } else if (nodes.some((n) => n.id === r.outbound)) {
        ruleObj.outbound = `node-${r.outbound}`;
      } else {
        ruleObj.outbound = 'proxy';
      }

      if (r.domains && r.domains.length > 0) {
        const full: string[] = [];
        const domain: string[] = [];
        const keyword: string[] = [];
        const regex: string[] = [];
        const geosite: string[] = [];

        for (const d of r.domains) {
          if (d.startsWith('full:')) full.push(d.slice(5));
          else if (d.startsWith('domain:')) domain.push(d.slice(7));
          else if (d.startsWith('keyword:')) keyword.push(d.slice(8));
          else if (d.startsWith('regexp:')) regex.push(d.slice(7));
          else if (d.startsWith('geosite:')) geosite.push(d.slice(8));
          else domain.push(d);
        }

        if (full.length > 0) ruleObj.domain = full;
        if (domain.length > 0) ruleObj.domain_suffix = domain;
        if (keyword.length > 0) ruleObj.domain_keyword = keyword;
        if (regex.length > 0) ruleObj.domain_regex = regex;
        if (geosite.length > 0) {
          ruleObj.rule_set = ruleObj.rule_set || [];
          for (const g of geosite) {
            const tag = `geosite-${g}`;
            ruleObj.rule_set.push(tag);
            if (!ruleSets.some((rs) => rs.tag === tag)) {
              ruleSets.push({
                tag,
                type: 'remote',
                format: 'binary',
                url: `https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/${g}.srs`,
                download_detour: 'direct',
              });
            }
          }
        }
      }

      if (r.ip && r.ip.length > 0) {
        const cidrs: string[] = [];
        const geoip: string[] = [];
        for (const ip of r.ip) {
          if (ip.startsWith('geoip:')) geoip.push(ip.slice(6));
          else cidrs.push(ip);
        }
        if (cidrs.length > 0) ruleObj.ip_cidr = cidrs;
        if (geoip.length > 0) {
          ruleObj.rule_set = ruleObj.rule_set || [];
          for (const g of geoip) {
            const tag = `geoip-${g}`;
            ruleObj.rule_set.push(tag);
            if (!ruleSets.some((rs) => rs.tag === tag)) {
              ruleSets.push({
                tag,
                type: 'remote',
                format: 'binary',
                url: `https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/${g}.srs`,
                download_detour: 'direct',
              });
            }
          }
        }
      }

      if (r.port) {
        const ports = r.port.split(',').map((p) => p.trim()).filter(Boolean);
        const singlePorts: number[] = [];
        const portRanges: string[] = [];
        for (const p of ports) {
          if (p.includes(':')) portRanges.push(p);
          else if (!isNaN(Number(p))) singlePorts.push(Number(p));
        }
        if (singlePorts.length > 0) ruleObj.port = singlePorts;
        if (portRanges.length > 0) ruleObj.port_range = portRanges;
      }

      if (r.protocol) ruleObj.protocol = [r.protocol];
      if (r.network) ruleObj.network = [r.network];
      if (r.processName && r.processName.length > 0) ruleObj.process_name = r.processName;
      if (r.processPath && r.processPath.length > 0) ruleObj.process_path = r.processPath;

      routeRules.push(ruleObj);
    }

    // Default routing based on mode
    if (settings.routingMode === 'rule') {
      routeRules.push({
        rule_set: ['geosite-cn', 'geoip-cn'],
        outbound: 'direct',
      });
    }

    const finalOutbound = settings.routingMode === 'direct' ? 'direct' : 'proxy';

    const routeConfig: any = {
      default_domain_resolver: 'direct-dns',
      rules: routeRules,
      rule_set: ruleSets,
      final: finalOutbound,
      auto_detect_interface: true,
    };

    // 5. Root Configuration
    const rootConfig: Record<string, any> = {
      log: {
        level: settings.logLevel || 'info',
        timestamp: true,
      },
      dns: dnsConfig,
      inbounds,
      outbounds,
      route: routeConfig,
    };

    // Clash API for GUI stats/traffic tracking
    if (settings.clashApiEnabled) {
      rootConfig.experimental = {
        clash_api: {
          external_controller: `127.0.0.1:${settings.clashApiPort || 9090}`,
          external_ui: '',
          secret: settings.clashApiSecret || '',
        },
      };
    }

    return rootConfig;
  }

  private static parseDnsServer(tag: string, address: string, detour: string): any {
    if (!address) {
      return {
        tag,
        type: 'udp',
        server: '223.5.5.5',
        server_port: 53,
        detour,
      };
    }

    if (address.startsWith('https://')) {
      try {
        const url = new URL(address);
        return {
          tag,
          type: 'https',
          server: url.hostname,
          server_port: url.port ? parseInt(url.port, 10) : 443,
          path: url.pathname || '/dns-query',
          detour,
        };
      } catch {
        return {
          tag,
          type: 'https',
          server: '1.1.1.1',
          server_port: 443,
          path: '/dns-query',
          detour,
        };
      }
    }

    if (address.startsWith('tls://')) {
      try {
        const url = new URL(address);
        return {
          tag,
          type: 'tls',
          server: url.hostname,
          server_port: url.port ? parseInt(url.port, 10) : 853,
          detour,
        };
      } catch {
        return {
          tag,
          type: 'tls',
          server: '1.1.1.1',
          server_port: 853,
          detour,
        };
      }
    }

    if (address.startsWith('quic://')) {
      try {
        const url = new URL(address);
        return {
          tag,
          type: 'quic',
          server: url.hostname,
          server_port: url.port ? parseInt(url.port, 10) : 853,
          detour,
        };
      } catch {
        return {
          tag,
          type: 'quic',
          server: 'dns.adguard-dns.com',
          server_port: 853,
          detour,
        };
      }
    }

    if (address === 'local') {
      return {
        tag,
        type: 'local',
        detour,
      };
    }

    const cleaned = address.replace(/^udp:\/\//, '');
    const colonIdx = cleaned.indexOf(':');
    if (colonIdx !== -1) {
      return {
        tag,
        type: 'udp',
        server: cleaned.substring(0, colonIdx),
        server_port: parseInt(cleaned.substring(colonIdx + 1), 10) || 53,
        detour,
      };
    }

    return {
      tag,
      type: 'udp',
      server: cleaned || '223.5.5.5',
      server_port: 53,
      detour,
    };
  }

  private static buildNodeOutbound(node: ProxyNode): any | null {
    if (node.rawOutbound) {
      return {
        ...node.rawOutbound,
        tag: `node-${node.id}`,
      };
    }

    const tag = `node-${node.id}`;

    switch (node.type) {
      case 'vless': {
        const outbound: any = {
          type: 'vless',
          tag,
          server: node.server,
          server_port: node.port,
          uuid: node.uuid || '',
        };

        if (node.flow) outbound.flow = node.flow;

        if (node.tls || node.reality) {
          outbound.tls = {
            enabled: true,
            server_name: node.sni || node.server,
            insecure: node.insecure || false,
            utls: {
              enabled: true,
              fingerprint: node.fingerprint || 'chrome',
            },
          };

          if (node.alpn && node.alpn.length > 0) {
            outbound.tls.alpn = node.alpn;
          }

          if (node.reality) {
            outbound.tls.reality = {
              enabled: true,
              public_key: node.publicKey || '',
              short_id: node.shortId || '',
            };
          }
        }

        if (node.transport && node.transport !== 'tcp') {
          outbound.transport = {
            type: node.transport,
          };
          if (node.transportPath) outbound.transport.path = node.transportPath;
          if (node.transportHost) {
            if (node.transport === 'ws') {
              outbound.transport.headers = { Host: node.transportHost };
            } else if (node.transport === 'grpc') {
              outbound.transport.service_name = node.transportHost;
            }
          }
        }

        return outbound;
      }

      case 'vmess': {
        const outbound: any = {
          type: 'vmess',
          tag,
          server: node.server,
          server_port: node.port,
          uuid: node.uuid || '',
          security: node.method || 'auto',
          alter_id: node.alterId || 0,
        };

        if (node.tls) {
          outbound.tls = {
            enabled: true,
            server_name: node.sni || node.server,
            insecure: node.insecure || false,
          };
        }

        if (node.transport && node.transport !== 'tcp') {
          outbound.transport = {
            type: node.transport,
          };
          if (node.transportPath) outbound.transport.path = node.transportPath;
        }

        return outbound;
      }

      case 'trojan': {
        const outbound: any = {
          type: 'trojan',
          tag,
          server: node.server,
          server_port: node.port,
          password: node.password || '',
          tls: {
            enabled: true,
            server_name: node.sni || node.server,
            insecure: node.insecure || false,
          },
        };
        if (node.alpn) outbound.tls.alpn = node.alpn;
        return outbound;
      }

      case 'shadowsocks': {
        return {
          type: 'shadowsocks',
          tag,
          server: node.server,
          server_port: node.port,
          method: node.method || 'aes-256-gcm',
          password: node.password || '',
          plugin: node.obfs || undefined,
        };
      }

      case 'hysteria':
      case 'hysteria2': {
        const outbound: any = {
          type: 'hysteria2',
          tag,
          server: node.server,
          server_port: node.port,
          password: node.password || '',
          tls: {
            enabled: true,
            server_name: node.sni || node.server,
            insecure: node.insecure || false,
          },
        };
        if (node.upMbps) outbound.up_mbps = node.upMbps;
        if (node.downMbps) outbound.down_mbps = node.downMbps;
        if (node.obfs) {
          outbound.obfs = {
            type: 'salamander',
            password: node.obfs,
          };
        }
        return outbound;
      }

      case 'tuic': {
        return {
          type: 'tuic',
          tag,
          server: node.server,
          server_port: node.port,
          uuid: node.uuid || '',
          password: node.password || '',
          congestion_control: node.congestionControl || 'bbr',
          udp_relay_mode: 'native',
          tls: {
            enabled: true,
            server_name: node.sni || node.server,
            insecure: node.insecure || false,
          },
        };
      }

      case 'wireguard': {
        return {
          type: 'wireguard',
          tag,
          server: node.server,
          server_port: node.port,
          system_interface: false,
          local_address: node.localAddress ? [node.localAddress] : ['10.0.0.2/32'],
          private_key: node.privateKey || '',
          peer_public_key: node.peerPublicKey || '',
          pre_shared_key: node.presharedKey || undefined,
          mtu: node.mtu || 1420,
          reserved: node.reserved || undefined,
        };
      }

      case 'socks': {
        const outbound: any = {
          type: 'socks',
          tag,
          server: node.server,
          server_port: node.port,
          version: '5',
        };
        if (node.uuid || node.password) {
          outbound.username = node.uuid || '';
          outbound.password = node.password || '';
        }
        return outbound;
      }

      case 'http': {
        const outbound: any = {
          type: 'http',
          tag,
          server: node.server,
          server_port: node.port,
        };
        if (node.uuid || node.password) {
          outbound.username = node.uuid || '';
          outbound.password = node.password || '';
        }
        return outbound;
      }

      default:
        return null;
    }
  }
}
