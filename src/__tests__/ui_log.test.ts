import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { LogManager } from '../main/log/LogManager';
import { Database } from '../main/db/Database';
import { detectRegion } from '../renderer/pages/Nodes';
import { ProxyNode } from '../types';

const TEST_DB_DIR = path.resolve(__dirname, 'temp_db_ui_log_test');

function cleanTestDir(): void {
  Database.resetInstance();
  if (fs.existsSync(TEST_DB_DIR)) {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  }
}

describe('LogManager System', () => {
  test('Records logs and strips ANSI escape codes', () => {
    const logger = LogManager.getInstance();
    const rawAnsi = '\u001b[32mINFO\u001b[0m[0000] router: rule matched [direct]';
    logger.addLog('info', rawAnsi, 'core');

    const logs = logger.getLogs();
    const last = logs[logs.length - 1];

    assert.ok(last, 'Log entry must exist');
    assert.equal(last.source, 'core');
    assert.equal(last.level, 'info');
    assert.equal(last.message, 'INFO[0000] router: rule matched [direct]');
    assert.ok(!last.message.includes('\u001b'), 'ANSI codes must be stripped');
  });

  test('Maintains log buffer and retrieves entries', () => {
    const logger = LogManager.getInstance();
    logger.addLog('warn', '测试警告信息', 'system');
    const logs = logger.getLogs();
    assert.ok(logs.some((l) => l.message === '测试警告信息' && l.source === 'system'));
  });
});

describe('Geographic Region Detection', () => {
  test('Accurately detects regions from node names and servers', () => {
    const hk = detectRegion('香港专线 01 | IPLC', 'hk.example.com');
    assert.equal(hk.id, 'hk');
    assert.equal(hk.flag, '🇭🇰');

    const jp = detectRegion('Japan Tokyo Premium', 'jp.example.com');
    assert.equal(jp.id, 'jp');
    assert.equal(jp.flag, '🇯🇵');

    const sg = detectRegion('新加坡 01 | 狮城', 'sg.example.com');
    assert.equal(sg.id, 'sg');
    assert.equal(sg.flag, '🇸🇬');

    const us = detectRegion('美国 硅谷 01 BGP', 'us.example.com');
    assert.equal(us.id, 'us');
    assert.equal(us.flag, '🇺🇸');

    const unknown = detectRegion('自定义节点', '192.168.1.1');
    assert.equal(unknown.id, 'other');
  });
});

describe('ProxyNode Speed Metrics Persistence', () => {
  beforeEach(() => {
    cleanTestDir();
  });

  afterEach(() => {
    cleanTestDir();
  });

  test('Persists httpLatency and downloadSpeed fields in Database', () => {
    const db = Database.getInstance(TEST_DB_DIR);
    const testNode: ProxyNode = {
      id: 'node-speed-1',
      name: '高速节点 01',
      type: 'vless',
      server: 'speed.example.com',
      port: 443,
      groupId: 'default',
      ping: 45,
      httpLatency: 88,
      downloadSpeed: 100000000, // 100 Mbps = 12.5 MB/s
      lastTested: Date.now(),
    };

    db.saveNodes([testNode]);
    db.flush();

    const loadedNodes = db.getNodes();
    assert.equal(loadedNodes.length, 1);
    assert.equal(loadedNodes[0].ping, 45);
    assert.equal(loadedNodes[0].httpLatency, 88);
    assert.equal(loadedNodes[0].downloadSpeed, 100000000);
  });
});
