import { contextBridge, ipcRenderer } from 'electron';
import { ProxyNode, Subscription, RouteRule, AppRule, DnsConfig, AppSettings } from '../types';

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
    validateConfig: () => ipcRenderer.invoke('core:validateConfig'),
    onStateChange: (callback: (state: string) => void) => {
      const sub = (_: any, state: string) => callback(state);
      ipcRenderer.on('core:stateChange', sub);
      return () => ipcRenderer.removeListener('core:stateChange', sub);
    },
    onLog: (callback: (log: any) => void) => {
      const sub = (_: any, log: any) => callback(log);
      ipcRenderer.on('core:log', sub);
      return () => ipcRenderer.removeListener('core:log', sub);
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
  },

  // Speed test
  speedTest: {
    testLatency: (url?: string) => ipcRenderer.invoke('speedtest:latency', url),
    testDownload: (url?: string) => ipcRenderer.invoke('speedtest:download', url),
    cancel: () => ipcRenderer.invoke('speedtest:cancel'),
  },

  // WebDAV
  webdav: {
    test: (config: any) => ipcRenderer.invoke('webdav:test', config),
    backup: () => ipcRenderer.invoke('webdav:backup'),
    restore: () => ipcRenderer.invoke('webdav:restore'),
  },

  // Backup & Restore
  backup: {
    exportData: (): Promise<string> => ipcRenderer.invoke('backup:export'),
    importData: (content: string) => ipcRenderer.invoke('backup:import', content),
    importLinks: (text: string): Promise<ProxyNode[]> => ipcRenderer.invoke('backup:importLinks', text),
  },

  // Settings
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    save: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', settings),
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
