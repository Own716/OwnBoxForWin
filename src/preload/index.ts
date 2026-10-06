import { contextBridge, ipcRenderer } from 'electron';
import { ProxyNode, Subscription, RouteRule, AppRule, DnsConfig, AppSettings, LogEntry } from '../types';

export const api = {
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

  // Sing-box core control
  core: {
    start: () => ipcRenderer.invoke('core:start'),
    stop: () => ipcRenderer.invoke('core:stop'),
    restart: () => ipcRenderer.invoke('core:restart'),
    getState: () => ipcRenderer.invoke('core:getState'),
    getVersion: () => ipcRenderer.invoke('core:getVersion'),
    getLiveConfig: (): Promise<string> => ipcRenderer.invoke('core:getLiveConfig'),
    validateConfig: () => ipcRenderer.invoke('core:validateConfig'),
    onStateChange: (callback: (state: string) => void) => {
      const sub = (_: any, state: string) => callback(state);
      ipcRenderer.on('core:stateChange', sub);
      return () => ipcRenderer.removeListener('core:stateChange', sub);
    },
    onLog: (callback: (log: LogEntry) => void) => {
      const sub = (_: any, log: any) => callback(log);
      ipcRenderer.on('core:log', sub);
      ipcRenderer.on('log:added', sub);
      return () => {
        ipcRenderer.removeListener('core:log', sub);
        ipcRenderer.removeListener('log:added', sub);
      };
    },
    onTraffic: (callback: (traffic: any) => void) => {
      const sub = (_: any, t: any) => callback(t);
      ipcRenderer.on('core:traffic', sub);
      return () => ipcRenderer.removeListener('core:traffic', sub);
    },
  },

  // Nodes management
  nodes: {
    getAll: (): Promise<ProxyNode[]> => ipcRenderer.invoke('nodes:getAll'),
    save: (nodes: ProxyNode[]) => ipcRenderer.invoke('nodes:save', nodes),
    getActiveId: (): Promise<string> => ipcRenderer.invoke('nodes:getActiveId'),
    setActiveId: (id: string) => ipcRenderer.invoke('nodes:setActiveId', id),
    ping: (host: string, port: number) => ipcRenderer.invoke('nodes:ping', host, port),
    batchPing: (nodes: { id: string; host: string; port: number }[]) =>
      ipcRenderer.invoke('nodes:batchPing', nodes),
  },

  // Subscriptions
  subscriptions: {
    getAll: (): Promise<Subscription[]> => ipcRenderer.invoke('subs:getAll'),
    save: (subs: Subscription[]) => ipcRenderer.invoke('subs:save', subs),
    update: (id: string) => ipcRenderer.invoke('subs:update', id),
  },

  // Routing
  routing: {
    getRules: (): Promise<RouteRule[]> => ipcRenderer.invoke('routing:getRules'),
    saveRules: (rules: RouteRule[]) => ipcRenderer.invoke('routing:saveRules', rules),
    getAppRules: (): Promise<AppRule[]> => ipcRenderer.invoke('routing:getAppRules'),
    saveAppRules: (rules: AppRule[]) => ipcRenderer.invoke('routing:saveAppRules', rules),
    getRunningApps: () => ipcRenderer.invoke('routing:getRunningApps'),
  },

  // DNS
  dns: {
    get: (): Promise<DnsConfig> => ipcRenderer.invoke('dns:get'),
    save: (dns: DnsConfig) => ipcRenderer.invoke('dns:save', dns),
    testResolve: (
      domain: string
    ): Promise<{ success: boolean; ip?: string; allIps?: string[]; latency?: number; error?: string }> =>
      ipcRenderer.invoke('dns:testResolve', domain),
  },

  // Logs
  logs: {
    getAll: (): Promise<LogEntry[]> => ipcRenderer.invoke('log:getAll'),
    clear: (): Promise<void> => ipcRenderer.invoke('log:clear'),
    exportLogs: (): Promise<{ success: boolean; filePath?: string; error?: string }> =>
      ipcRenderer.invoke('log:export'),
    onLogAdded: (callback: (log: LogEntry) => void) => {
      const sub = (_: any, log: any) => callback(log);
      ipcRenderer.on('log:added', sub);
      ipcRenderer.on('core:log', sub);
      return () => {
        ipcRenderer.removeListener('log:added', sub);
        ipcRenderer.removeListener('core:log', sub);
      };
    },
  },

  // Speed test
  speedTest: {
    testLatency: (url?: string, nodeId?: string): Promise<number> =>
      ipcRenderer.invoke('speedtest:latency', url, nodeId),
    testDownload: (url?: string, nodeId?: string): Promise<number> =>
      ipcRenderer.invoke('speedtest:download', url, nodeId),
    cancel: (nodeId?: string): Promise<void> => ipcRenderer.invoke('speedtest:cancel', nodeId),
  },

  // WebDAV
  webdav: {
    test: (config: any) => ipcRenderer.invoke('webdav:test', config),
    backup: () => ipcRenderer.invoke('webdav:backup'),
    restore: () => ipcRenderer.invoke('webdav:restore'),
  },

  // Backup & Restore
  backup: {
    exportData: (categories?: any): Promise<string> => ipcRenderer.invoke('backup:export', categories),
    exportAndroid: (categories?: any): Promise<string> => ipcRenderer.invoke('backup:exportAndroid', categories),
    previewImport: (content: string, categories?: any): Promise<any> =>
      ipcRenderer.invoke('backup:previewImport', content, categories),
    importWithTransaction: (content: string, categories?: any, mode?: 'merge' | 'replace'): Promise<any> =>
      ipcRenderer.invoke('backup:importWithTransaction', content, categories, mode),
    createLocalBackup: (): Promise<{ success: boolean; filePath: string }> =>
      ipcRenderer.invoke('backup:createLocalBackup'),
    restoreLocalBackup: (): Promise<any> => ipcRenderer.invoke('backup:restoreLocalBackup'),
    getLatestLocalBackupInfo: (): Promise<{ exists: boolean; timestamp?: number; size?: number; filePath?: string }> =>
      ipcRenderer.invoke('backup:getLatestLocalBackupInfo'),
    importData: (content: string) => ipcRenderer.invoke('backup:import', content),
    importLinks: (text: string): Promise<ProxyNode[]> => ipcRenderer.invoke('backup:importLinks', text),
  },

  // Settings
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    save: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', settings),
    resetDefaults: (): Promise<AppSettings> => ipcRenderer.invoke('settings:resetDefaults'),
  },

  // System
  system: {
    openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('system:openExternal', url),
    isAdmin: (): Promise<boolean> => ipcRenderer.invoke('system:isAdmin'),
    relaunchAsAdmin: (): Promise<void> => ipcRenderer.invoke('system:relaunchAsAdmin'),
    flushDns: (): Promise<{ success: boolean; message: string }> => ipcRenderer.invoke('system:flushDns'),
    getAppVersion: (): Promise<string> => ipcRenderer.invoke('system:getAppVersion'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
