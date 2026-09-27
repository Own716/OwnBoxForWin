/**
 * BackupTransaction.ts
 * Executes atomic, transactional database updates with snapshotting and rollback.
 * Guarantees that unselected categories are untouched, and empty arrays never wipe existing data.
 */

import path from 'path';
import fs from 'fs';
import { Database } from '../Database';
import { BackupSnapshot } from './BackupSnapshot';
import {
  ProxyNode,
  Subscription,
  RouteRule,
  AppRule,
  DnsConfig,
  AppSettings,
  BackupCategories,
  BackupImportResult,
} from '../../../types';

export interface TransactionPayload {
  nodes?: ProxyNode[];
  subscriptions?: Subscription[];
  rules?: RouteRule[];
  appRules?: AppRule[];
  dns?: DnsConfig;
  settings?: Partial<AppSettings>;
}

export class BackupTransaction {
  /**
   * Executes atomic import transaction against Database.
   */
  public static execute(
    payload: TransactionPayload,
    categories: BackupCategories = { profiles: true, rules: true, settings: true },
    mode: 'merge' | 'replace' = 'merge'
  ): BackupImportResult {
    const db = Database.getInstance();

    // 1. Take safety pre-import snapshot
    let snapshotPath: string | undefined;
    try {
      snapshotPath = BackupSnapshot.createPreImportSnapshot();
    } catch (snapErr) {
      console.warn('Failed to take pre-import snapshot:', snapErr);
    }

    // 2. Capture baseline in-memory state for rollback
    const origNodes = [...db.getNodes()];
    const origSubs = [...db.getSubscriptions()];
    const origRules = [...db.getRules()];
    const origAppRules = [...db.getAppRules()];
    const origDns = { ...db.getDns() };
    const origSettings = { ...db.getSettings() };
    const origActiveId = db.getActiveNodeId();

    try {
      let finalNodes = origNodes;
      let finalSubs = origSubs;
      let finalRules = origRules;
      let finalAppRules = origAppRules;
      let finalDns = origDns;
      let finalSettings = origSettings;

      let importedGroupsCount = 0;
      let importedNodesCount = 0;
      let importedRulesCount = 0;
      let importedAppRulesCount = 0;
      let importedSettingsCount = 0;

      // Category 1: Profiles & Groups
      if (categories.profiles) {
        const incomingSubs = payload.subscriptions || [];
        const incomingNodes = payload.nodes || [];

        if (mode === 'replace') {
          // If replace mode, only replace if incoming is non-empty (anti-wipe protection)
          if (incomingNodes.length > 0) {
            finalNodes = incomingNodes;
            importedNodesCount = incomingNodes.length;
          }
          if (incomingSubs.length > 0) {
            finalSubs = incomingSubs;
            importedGroupsCount = incomingSubs.length;
          }
        } else {
          // Merge mode (default safe behavior)
          // Merge subscriptions
          const subMap = new Map<string, Subscription>();
          origSubs.forEach((s) => subMap.set(s.url || s.name, s));
          for (const s of incomingSubs) {
            const key = s.url || s.name;
            const existing = subMap.get(key);
            if (existing) {
              subMap.set(key, { ...existing, ...s, id: existing.id });
            } else {
              subMap.set(key, s);
              importedGroupsCount++;
            }
          }
          finalSubs = Array.from(subMap.values());

          // Merge nodes
          const nodeMap = new Map<string, ProxyNode>();
          origNodes.forEach((n) => nodeMap.set(`${n.type}-${n.server}-${n.port}`, n));
          for (const n of incomingNodes) {
            const key = `${n.type}-${n.server}-${n.port}`;
            const existing = nodeMap.get(key);
            if (existing) {
              nodeMap.set(key, { ...existing, ...n, id: existing.id });
            } else {
              nodeMap.set(key, n);
              importedNodesCount++;
            }
          }
          finalNodes = Array.from(nodeMap.values());
        }
      }

      // Category 2: Routing Rules
      if (categories.rules) {
        const incomingRules = payload.rules || [];
        const incomingAppRules = payload.appRules || [];

        if (mode === 'replace') {
          if (incomingRules.length > 0) {
            finalRules = incomingRules;
            importedRulesCount = incomingRules.length;
          }
          if (incomingAppRules.length > 0) {
            finalAppRules = incomingAppRules;
            importedAppRulesCount = incomingAppRules.length;
          }
        } else {
          // Merge rules
          const ruleMap = new Map<string, RouteRule>();
          origRules.forEach((r) => ruleMap.set(r.name, r));
          for (const r of incomingRules) {
            const existing = ruleMap.get(r.name);
            if (existing) {
              ruleMap.set(r.name, { ...existing, ...r, id: existing.id });
            } else {
              ruleMap.set(r.name, r);
              importedRulesCount++;
            }
          }
          finalRules = Array.from(ruleMap.values());

          // Merge app rules
          const appMap = new Map<string, AppRule>();
          origAppRules.forEach((a) => appMap.set(a.exePath.toLowerCase(), a));
          for (const a of incomingAppRules) {
            const key = a.exePath.toLowerCase();
            const existing = appMap.get(key);
            if (existing) {
              appMap.set(key, { ...existing, ...a, id: existing.id });
            } else {
              appMap.set(key, a);
              importedAppRulesCount++;
            }
          }
          finalAppRules = Array.from(appMap.values());
        }
      }

      // Category 3: Settings
      if (categories.settings) {
        if (payload.settings && Object.keys(payload.settings).length > 0) {
          finalSettings = {
            ...origSettings,
            ...payload.settings,
            // Preserve sensitive WebDAV credentials if not provided
            webdav: {
              ...origSettings.webdav,
              ...(payload.settings.webdav || {}),
            },
          };
          importedSettingsCount = Object.keys(payload.settings).length;
        }
        if (payload.dns) {
          finalDns = { ...origDns, ...payload.dns };
        }
      }

      // 3. Atomically write to disk via temporary file
      const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Roaming');
      const dataDir = path.join(appData, 'OwnBox');
      const dbPath = path.join(dataDir, 'ownbox.json');
      const tmpPath = `${dbPath}.tmp`;
      const bakPath = `${dbPath}.bak`;

      const newDbState = {
        activeNodeId: finalNodes.some((n) => n.id === origActiveId)
          ? origActiveId
          : finalNodes[0]?.id || '',
        nodes: finalNodes,
        subscriptions: finalSubs,
        rules: finalRules,
        appRules: finalAppRules,
        dns: finalDns,
        settings: finalSettings,
      };

      const jsonStr = JSON.stringify(newDbState, null, 2);
      fs.writeFileSync(tmpPath, jsonStr, 'utf8');

      if (fs.existsSync(dbPath)) {
        try {
          fs.copyFileSync(dbPath, bakPath);
        } catch {}
      }

      fs.renameSync(tmpPath, dbPath);

      // 4. Update in-memory Database instance
      db.saveNodes(finalNodes);
      db.saveSubscriptions(finalSubs);
      db.saveRules(finalRules);
      db.saveAppRules(finalAppRules);
      db.saveDns(finalDns);
      db.saveSettings(finalSettings);

      return {
        success: true,
        message: '数据导入并合并成功',
        snapshotPath,
        importedCounts: {
          groups: importedGroupsCount,
          nodes: importedNodesCount,
          rules: importedRulesCount,
          appRules: importedAppRulesCount,
          settings: importedSettingsCount,
        },
      };
    } catch (err: any) {
      // Rollback to original in-memory state
      db.saveNodes(origNodes);
      db.saveSubscriptions(origSubs);
      db.saveRules(origRules);
      db.saveAppRules(origAppRules);
      db.saveDns(origDns);
      db.saveSettings(origSettings);
      if (origActiveId) db.setActiveNodeId(origActiveId);

      throw new Error(`Transaction aborted, database rolled back: ${err.message}`);
    }
  }
}
