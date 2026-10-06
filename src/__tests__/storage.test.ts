import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { Database } from '../main/db/Database';
import { CredentialSecurity } from '../main/security/CredentialSecurity';
import { ProxyNode } from '../types';

const TEST_DB_DIR = path.resolve(__dirname, 'temp_db_storage_test');

function cleanTestDir(): void {
  Database.resetInstance();
  if (fs.existsSync(TEST_DB_DIR)) {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  }
}

describe('CredentialSecurity', () => {
  test('Encrypts and decrypts strings correctly', () => {
    const raw = 'my-super-secret-password-1234!';
    const encrypted = CredentialSecurity.encrypt(raw);
    assert.ok(encrypted.startsWith('enc:'), 'Encrypted token must start with enc:');
    assert.ok(CredentialSecurity.isEncrypted(encrypted));

    const decrypted = CredentialSecurity.decrypt(encrypted);
    assert.equal(decrypted, raw, 'Decrypted string must match original raw string');
  });

  test('Backward compatibility: returns legacy unencrypted text as-is', () => {
    const legacy = 'plain-text-legacy-password';
    assert.equal(CredentialSecurity.isEncrypted(legacy), false);
    assert.equal(CredentialSecurity.decrypt(legacy), legacy);
  });
});

describe('Database Storage & Recovery', () => {
  beforeEach(() => {
    cleanTestDir();
  });

  afterEach(() => {
    cleanTestDir();
  });

  test('Initializes schema v2 and persists data in isolated directory', () => {
    const db = Database.getInstance(TEST_DB_DIR);
    const nodes: ProxyNode[] = [
      { id: 'test-1', name: 'Node 1', type: 'socks', server: '1.1.1.1', port: 1080, groupId: 'default' },
    ];
    db.saveNodes(nodes);
    db.setActiveNodeId('test-1');
    db.saveSettings({
      webdav: {
        serverUrl: 'https://dav.example.com',
        username: 'user1',
        password: 'mySecretWebDAVPassword',
        remotePath: 'OwnBox',
        autoSync: true,
      },
    });

    const dbFile = path.join(TEST_DB_DIR, 'ownbox.json');
    assert.ok(fs.existsSync(dbFile), 'Database file ownbox.json must exist');

    const raw = fs.readFileSync(dbFile, 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.schemaVersion, 2, 'Schema version must be 2');

    // Verify sensitive password is encrypted on disk
    assert.ok(
      parsed.settings.webdav.password.startsWith('enc:'),
      'WebDAV password must be encrypted on disk'
    );

    // Verify in-memory state provides decrypted password
    assert.equal(
      db.getSettings().webdav.password,
      'mySecretWebDAVPassword',
      'In-memory password must be decrypted'
    );
  });

  test('Debounced save coalesces rapid writes and flushes correctly', async () => {
    const db = Database.getInstance(TEST_DB_DIR);
    const nodes: ProxyNode[] = [
      { id: 'node-a', name: 'Node A', type: 'socks', server: '1.1.1.1', port: 1080, groupId: 'default' },
    ];
    db.saveNodes(nodes);

    // Rapid debounced writes (simulating high-frequency ping updates)
    for (let i = 1; i <= 5; i++) {
      nodes[0].ping = i * 10;
      db.saveDebounced(150);
    }

    // Flush explicitly ensures latest state is on disk immediately
    db.flush();

    const dbFile = path.join(TEST_DB_DIR, 'ownbox.json');
    const raw = fs.readFileSync(dbFile, 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.nodes[0].ping, 50, 'Latest debounced update must be written to disk');
  });

  test('Recovers from .bak when main db is corrupted JSON and leaves .corrupted archive', () => {
    const db = Database.getInstance(TEST_DB_DIR);
    const nodes: ProxyNode[] = [
      { id: 'good-node', name: 'Good Node', type: 'socks', server: '1.2.3.4', port: 1080, groupId: 'default' },
    ];
    db.saveNodes(nodes);
    db.flush();

    const dbFile = path.join(TEST_DB_DIR, 'ownbox.json');
    const bakFile = path.join(TEST_DB_DIR, 'ownbox.json.bak');
    assert.ok(fs.existsSync(bakFile), '.bak file must exist');

    // Corrupt the main db file with malformed JSON
    fs.writeFileSync(dbFile, 'INVALID_MALFORMED_JSON_CONTENT{{{', 'utf8');

    // Reinitialize Database instance to trigger load & recovery
    Database.resetInstance();
    const recoveredDb = Database.getInstance(TEST_DB_DIR);

    // Verify data recovered from .bak
    assert.equal(recoveredDb.getNodes().length, 1);
    assert.equal(recoveredDb.getNodes()[0].id, 'good-node');

    // Verify corrupted archive file was created
    const files = fs.readdirSync(TEST_DB_DIR);
    const corruptedArchives = files.filter((f) => f.includes('ownbox.json.corrupted.'));
    assert.ok(corruptedArchives.length > 0, 'Corrupted archive file must be created');
  });

  test('Recovers from .bak when main db file is zero bytes (sudden power loss)', () => {
    const db = Database.getInstance(TEST_DB_DIR);
    const nodes: ProxyNode[] = [
      { id: 'powerloss-node', name: 'Power Node', type: 'socks', server: '5.6.7.8', port: 1080, groupId: 'default' },
    ];
    db.saveNodes(nodes);
    db.flush();

    const dbFile = path.join(TEST_DB_DIR, 'ownbox.json');

    // Simulate sudden power loss right when file was truncated (0 bytes)
    fs.writeFileSync(dbFile, '', 'utf8');
    assert.equal(fs.statSync(dbFile).size, 0);

    // Reinitialize Database
    Database.resetInstance();
    const recoveredDb = Database.getInstance(TEST_DB_DIR);

    assert.equal(recoveredDb.getNodes().length, 1);
    assert.equal(recoveredDb.getNodes()[0].id, 'powerloss-node');
  });
});
