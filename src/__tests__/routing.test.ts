import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ConfigGenerator } from '../main/core/ConfigGenerator';
import { ProcessScanner } from '../main/system/ProcessScanner';
import { ProxyNode, RouteRule, AppRule, DnsConfig, AppSettings } from '../types';

const execFileAsync = promisify(execFile);

const defaultSettings: AppSettings = {
  theme: 'system',
  language: 'zh-CN',
  startOnBoot: false,
  startMinimized: false,
  autoConnectOnLaunch: false,
  closeToTray: true,
  mixedPort: 2080,
  allowLan: false,
  inboundAuth: false,
  systemProxyEnabled: false,
  systemProxyBypassLan: true,
  tunEnabled: false,
  tunStack: 'system',
  tunDevice: 'OwnBoxTun',
  tunMtu: 9000,
  tunStrictRoute: false,
  tunEndpointIndependentNat: true,
  tunIPv6: false,
  tunAutoRoute: true,
  logLevel: 'warn',
  dnsCache: true,
};

const sampleNode: ProxyNode = {
  id: 'node-test',
  name: 'Test Node',
  type: 'socks',
  server: '1.2.3.4',
  port: 1080,
  groupId: 'default',
};

describe('ProcessScanner', () => {
  test('Returns list containing preset applications', async () => {
    const apps = await ProcessScanner.getRunningProcesses();
    assert.ok(Array.isArray(apps), 'Result must be an array');
    assert.ok(apps.length >= ProcessScanner.PRESET_APPS.length, 'Must contain at least preset apps');

    const chrome = apps.find((a) => a.exePath.toLowerCase().includes('chrome.exe'));
    assert.ok(chrome, 'Chrome must be in scanned / preset apps');

    const telegram = apps.find((a) => a.exePath.toLowerCase().includes('telegram.exe'));
    assert.ok(telegram, 'Telegram must be in scanned / preset apps');
  });
});

describe('Routing and App Rules in ConfigGenerator', () => {
  test('Correctly formats app process routing rules (proxy, direct, reject)', () => {
    const appRules: AppRule[] = [
      { id: '1', name: 'Google Chrome', exePath: '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"', action: 'proxy', enabled: true },
      { id: '2', name: 'Steam Client', exePath: 'D:\\Games\\Steam\\steam.exe', action: 'direct', enabled: true },
      { id: '3', name: 'Blocked App', exePath: 'malware.exe', action: 'block', enabled: true },
      { id: '4', name: 'Disabled App', exePath: 'disabled.exe', action: 'proxy', enabled: false },
    ];

    const dns: DnsConfig = {
      mode: 'standard',
      remoteDns: 'https://1.1.1.1/dns-query',
      directDns: '223.5.5.5',
      fakeIpRange: '198.18.0.0/15',
      enableDnsRouting: true,
      servers: [],
    };

    const config = ConfigGenerator.generate('node-test', [sampleNode], [], appRules, dns, defaultSettings);
    const rules = config.route.rules;

    // 1. Chrome proxy rule
    const chromeRule = rules.find((r: any) => r.process_name && r.process_name.includes('chrome.exe'));
    assert.ok(chromeRule, 'Chrome rule must exist');
    assert.equal(chromeRule.outbound, 'proxy');

    // 2. Steam direct rule
    const steamRule = rules.find((r: any) => r.process_name && r.process_name.includes('steam.exe'));
    assert.ok(steamRule, 'Steam rule must exist');
    assert.equal(steamRule.outbound, 'direct');

    // 3. Blocked app reject rule
    const blockedRule = rules.find((r: any) => r.process_name && r.process_name.includes('malware.exe'));
    assert.ok(blockedRule, 'Blocked app rule must exist');
    assert.equal(blockedRule.action, 'reject');

    // 4. Disabled rule should not be included
    const disabledRule = rules.find((r: any) => r.process_name && r.process_name.includes('disabled.exe'));
    assert.equal(disabledRule, undefined, 'Disabled app rule must not be included');
  });

  test('Configures custom DNS servers and cache capacity in Sing-box', () => {
    const dns: DnsConfig = {
      mode: 'fakeip',
      remoteDns: 'https://1.1.1.1/dns-query',
      directDns: '223.5.5.5',
      fakeIpRange: '198.18.0.0/15',
      enableDnsRouting: true,
      servers: [
        { id: 'custom-1', tag: 'custom-dns', address: 'tls://8.8.8.8:853', detour: 'proxy' },
      ],
    };

    const config = ConfigGenerator.generate('node-test', [sampleNode], [], [], dns, defaultSettings);

    // Check DNS servers
    const customServer = config.dns.servers.find((s: any) => s.tag === 'custom-dns');
    assert.ok(customServer, 'Custom DNS server must be included');
    assert.equal(customServer.type, 'tls');
    assert.equal(customServer.server, '8.8.8.8');
    assert.equal(customServer.server_port, 853);
    assert.equal(customServer.detour, 'proxy');

    // Check FakeIP server
    const fakeIpServer = config.dns.servers.find((s: any) => s.tag === 'fakeip-dns');
    assert.ok(fakeIpServer, 'fakeip-dns server must be included');
    assert.equal(fakeIpServer.type, 'fakeip');

    // Check cache capacity
    assert.equal(config.dns.cache_capacity, 4096, 'DNS cache capacity must be set');
  });

  test('Validates app routing and custom DNS config with real sing-box.exe check', async () => {
    const appRules: AppRule[] = [
      { id: '1', name: 'Google Chrome', exePath: 'chrome.exe', action: 'proxy', enabled: true },
      { id: '2', name: 'Steam Client', exePath: 'steam.exe', action: 'direct', enabled: true },
      { id: '3', name: 'Blocked App', exePath: 'malware.exe', action: 'block', enabled: true },
    ];

    const dns: DnsConfig = {
      mode: 'fakeip',
      remoteDns: 'https://1.1.1.1/dns-query',
      directDns: '223.5.5.5',
      fakeIpRange: '198.18.0.0/15',
      enableDnsRouting: true,
      servers: [
        { id: 'custom-1', tag: 'custom-dns', address: 'tls://8.8.8.8:853', detour: 'proxy' },
      ],
    };

    const config = ConfigGenerator.generate('node-test', [sampleNode], [], appRules, dns, defaultSettings);
    const tempConfigPath = path.resolve(__dirname, 'temp_routing_test_config.json');
    fs.writeFileSync(tempConfigPath, JSON.stringify(config, null, 2), 'utf-8');

    const singBoxExe = path.resolve(__dirname, '../../bin/sing-box.exe');
    try {
      await execFileAsync(singBoxExe, ['check', '-c', tempConfigPath]);
      assert.ok(true, 'sing-box check succeeded for app routing and DNS');
    } finally {
      if (fs.existsSync(tempConfigPath)) {
        fs.unlinkSync(tempConfigPath);
      }
    }
  });
});
