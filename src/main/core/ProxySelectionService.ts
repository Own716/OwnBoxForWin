import http from 'http';
import { Database } from '../db/Database';
import { SingBoxManager } from './SingBoxManager';
import { TrayManager } from '../tray/TrayManager';
import { LogManager } from '../log/LogManager';

export class ProxySelectionService {
  /**
   * Gets currently active node ID from database state
   */
  public static getActiveNodeId(): string {
    return Database.getInstance().getActiveNodeId();
  }

  /**
   * Set active proxy node with zero-downtime Clash API hot-switching when core is running.
   */
  public static async selectNode(nodeId: string): Promise<{ success: boolean; hotSwitched: boolean; error?: string }> {
    const db = Database.getInstance();
    const nodes = db.getNodes();
    const target = nodes.find((n) => n.id === nodeId);

    if (!target) {
      return { success: false, hotSwitched: false, error: `节点不存在 (ID: ${nodeId})` };
    }

    // 1. Persist to database state
    db.setActiveNodeId(nodeId);

    const core = SingBoxManager.getInstance();
    if (core.getState() !== 'running') {
      TrayManager.getInstance().updateMenu();
      return { success: true, hotSwitched: false };
    }

    // 2. Core is running: Attempt instantaneous hot-switch via Clash API selector
    const settings = db.getSettings();
    const port = settings.clashApiPort || 9090;
    const secret = settings.clashApiSecret;
    const tag = `node-${nodeId}`;

    const switched = await this.putClashSelector(port, 'proxy', tag, secret);
    if (switched) {
      LogManager.getInstance().addLog(
        'info',
        `已热切换活跃节点 -> ${target.name} (${target.type.toUpperCase()}) [零断流热重载]`,
        'core'
      );
      TrayManager.getInstance().updateMenu();
      return { success: true, hotSwitched: true };
    }

    // 3. Fallback: if hot-switch failed (e.g. selector not ready or node tag mismatch), gracefully reload core
    LogManager.getInstance().addLog(
      'warn',
      `Clash API 热切换未就绪，执行核心安全重载以切换至节点: ${target.name}`,
      'core'
    );

    try {
      // Dynamic import to avoid circular dependency
      const { ConfigGenerator } = await import('./ConfigGenerator');
      const config = ConfigGenerator.generate(
        nodeId,
        nodes,
        db.getRules(),
        db.getAppRules(),
        db.getDns(),
        settings
      );
      const restarted = await core.start(config);
      TrayManager.getInstance().updateMenu();
      return { success: restarted, hotSwitched: false };
    } catch (e: any) {
      LogManager.getInstance().addLog('error', `切换节点失败: ${e.message}`, 'core');
      return { success: false, hotSwitched: false, error: e.message };
    }
  }

  private static putClashSelector(
    port: number,
    selectorTag: string,
    targetTag: string,
    secret?: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const payload = JSON.stringify({ name: targetTag });
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(payload)),
        };
        if (secret) {
          headers['Authorization'] = `Bearer ${secret}`;
        }

        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: `/proxies/${encodeURIComponent(selectorTag)}`,
            method: 'PUT',
            headers,
            timeout: 2500,
          },
          (res) => {
            resolve(res.statusCode === 204 || res.statusCode === 200);
          }
        );

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });

        req.write(payload);
        req.end();
      } catch {
        resolve(false);
      }
    });
  }
}
