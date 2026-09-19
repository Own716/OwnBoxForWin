import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, NavTab } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Nodes } from './pages/Nodes';
import { Subscriptions } from './pages/Subscriptions';
import { Routing } from './pages/Routing';
import { AppRouting } from './pages/AppRouting';
import { DNS } from './pages/DNS';
import { SpeedTest } from './pages/SpeedTest';
import { Logs } from './pages/Logs';
import { Backup } from './pages/Backup';
import { Settings } from './pages/Settings';
import { About } from './pages/About';
import {
  ProxyNode,
  Subscription,
  RouteRule,
  AppRule,
  DnsConfig,
  AppSettings,
  TrafficStats,
} from '../types';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [coreState, setCoreState] = useState<string>('stopped');
  const [coreVersion, setCoreVersion] = useState<string>('1.15.0');
  const [nodes, setNodes] = useState<ProxyNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string>('');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [rules, setRules] = useState<RouteRule[]>([]);
  const [appRules, setAppRules] = useState<AppRule[]>([]);
  const [dns, setDns] = useState<DnsConfig>({
    mode: 'standard',
    remoteDns: 'https://1.1.1.1/dns-query',
    directDns: '223.5.5.5',
    fakeIpRange: '198.18.0.0/15',
    enableDnsRouting: true,
    servers: [],
  });
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'dark',
    language: 'zh-CN',
    startOnBoot: false,
    startMinimized: false,
    autoConnectOnLaunch: false,
    closeToTray: true,
    mixedPort: 2080,
    allowLan: false,
    inboundAuth: false,
    systemProxyEnabled: true,
    systemProxyBypassLan: true,
    tunEnabled: false,
    tunMtu: 9000,
    tunStack: 'system',
    tunAutoRoute: true,
    tunStrictRoute: false,
    tunDnsHijack: true,
    tunIPv6: false,
    routingMode: 'rule',
    logLevel: 'info',
    clashApiEnabled: true,
    clashApiPort: 9090,
    testUrl: 'http://cp.cloudflare.com/generate_204',
    testTimeoutMs: 5000,
    testConcurrent: 8,
    webdav: {
      serverUrl: '',
      username: '',
      password: '',
      remotePath: 'OwnBox',
      autoSync: false,
    },
  });

  const [traffic, setTraffic] = useState<TrafficStats>({
    downloadSpeed: 0,
    uploadSpeed: 0,
    totalDownload: 0,
    totalUpload: 0,
    latency: 48,
    uptime: 0,
    activeConnections: 0,
  });

  // Load initial data
  const loadAllData = async () => {
    if (!window.electronAPI) return;
    try {
      const [
        loadedNodes,
        loadedActiveId,
        loadedSubs,
        loadedRules,
        loadedAppRules,
        loadedDns,
        loadedSettings,
        loadedState,
        loadedVer,
      ] = await Promise.all([
        window.electronAPI.nodes.getAll(),
        window.electronAPI.nodes.getActiveId(),
        window.electronAPI.subscriptions.getAll(),
        window.electronAPI.routing.getRules(),
        window.electronAPI.routing.getAppRules(),
        window.electronAPI.dns.get(),
        window.electronAPI.settings.get(),
        window.electronAPI.core.getState(),
        window.electronAPI.core.getVersion(),
      ]);

      if (loadedNodes) setNodes(loadedNodes);
      if (loadedActiveId) setActiveNodeId(loadedActiveId);
      if (loadedSubs) setSubscriptions(loadedSubs);
      if (loadedRules) setRules(loadedRules);
      if (loadedAppRules) setAppRules(loadedAppRules);
      if (loadedDns) setDns(loadedDns);
      if (loadedSettings) setSettings(loadedSettings);
      if (loadedState) setCoreState(loadedState);
      if (loadedVer) setCoreVersion(loadedVer);
    } catch (e) {
      console.error('Error loading initial data:', e);
    }
  };

  useEffect(() => {
    loadAllData();

    if (window.electronAPI) {
      const unsubState = window.electronAPI.core.onStateChange((state) => {
        setCoreState(state);
      });
      const unsubTraffic = window.electronAPI.core.onTraffic((t) => {
        setTraffic(t);
      });

      return () => {
        unsubState();
        unsubTraffic();
      };
    }
  }, []);

  // Theme effect
  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Connect Toggle
  const handleToggleConnect = async () => {
    if (!window.electronAPI) return;
    if (coreState === 'running') {
      await window.electronAPI.core.stop();
    } else {
      await window.electronAPI.core.start();
    }
  };

  // Node select
  const handleSelectNode = async (id: string) => {
    setActiveNodeId(id);
    if (window.electronAPI) {
      await window.electronAPI.nodes.setActiveId(id);
    }
  };

  // Save Nodes
  const handleSaveNodes = async (newNodes: ProxyNode[]) => {
    setNodes(newNodes);
    if (window.electronAPI) {
      await window.electronAPI.nodes.save(newNodes);
    }
  };

  // Save Subscriptions
  const handleSaveSubscriptions = async (newSubs: Subscription[]) => {
    setSubscriptions(newSubs);
    if (window.electronAPI) {
      await window.electronAPI.subscriptions.save(newSubs);
    }
  };

  // Save Routing Rules
  const handleSaveRules = async (newRules: RouteRule[]) => {
    setRules(newRules);
    if (window.electronAPI) {
      await window.electronAPI.routing.saveRules(newRules);
    }
  };

  // Save App Rules
  const handleSaveAppRules = async (newRules: AppRule[]) => {
    setAppRules(newRules);
    if (window.electronAPI) {
      await window.electronAPI.routing.saveAppRules(newRules);
    }
  };

  // Save DNS
  const handleSaveDns = async (newDns: DnsConfig) => {
    setDns(newDns);
    if (window.electronAPI) {
      await window.electronAPI.dns.save(newDns);
    }
  };

  // Update Settings
  const handleUpdateSettings = async (partial: Partial<AppSettings>) => {
    const merged = { ...settings, ...partial };
    setSettings(merged);
    if (window.electronAPI) {
      await window.electronAPI.settings.save(merged);
    }
  };

  const activeNode = nodes.find((n) => n.id === activeNodeId) || nodes[0];

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-100/70 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
      {/* 1. Window TitleBar */}
      <TitleBar
        theme={isDark ? 'dark' : 'light'}
        coreState={coreState}
        activeNodeName={activeNode?.name}
      />

      {/* 2. Workspace Body: Sidebar + Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          theme={isDark ? 'dark' : 'light'}
          coreState={coreState}
          activeNodeName={activeNode?.name}
          latency={activeNode?.ping}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto">
            {currentTab === 'dashboard' && (
              <Dashboard
                coreState={coreState}
                onToggleConnect={handleToggleConnect}
                nodes={nodes}
                activeNodeId={activeNodeId}
                onSelectNode={handleSelectNode}
                traffic={traffic}
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                onNavigate={setCurrentTab}
              />
            )}

            {currentTab === 'nodes' && (
              <Nodes
                nodes={nodes}
                activeNodeId={activeNodeId}
                onSelectNode={handleSelectNode}
                onSaveNodes={handleSaveNodes}
              />
            )}

            {currentTab === 'subscriptions' && (
              <Subscriptions
                subscriptions={subscriptions}
                onSaveSubscriptions={handleSaveSubscriptions}
                onRefreshNodes={loadAllData}
              />
            )}

            {currentTab === 'routing' && (
              <Routing
                rules={rules}
                onSaveRules={handleSaveRules}
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                nodes={nodes}
              />
            )}

            {currentTab === 'app-routing' && (
              <AppRouting appRules={appRules} onSaveAppRules={handleSaveAppRules} />
            )}

            {currentTab === 'dns' && <DNS dns={dns} onSaveDns={handleSaveDns} />}

            {currentTab === 'speedtest' && (
              <SpeedTest
                nodes={nodes}
                activeNodeId={activeNodeId}
                onSelectNode={handleSelectNode}
                onSaveNodes={handleSaveNodes}
              />
            )}

            {currentTab === 'logs' && <Logs />}

            {currentTab === 'backup' && (
              <Backup
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                onRefreshAllData={loadAllData}
              />
            )}

            {currentTab === 'settings' && (
              <Settings
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                coreVersion={coreVersion}
              />
            )}

            {currentTab === 'about' && (
              <About theme={isDark ? 'dark' : 'light'} coreVersion={coreVersion} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
