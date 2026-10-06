import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Play,
  Square,
  Activity,
  CheckCircle,
  Search,
  Check,
  RotateCcw,
  LayoutGrid,
  List,
  Download,
  Globe,
  Radio,
} from 'lucide-react';
import { ProxyNode } from '../../types';
import { detectRegion } from './Nodes';

interface SpeedTestProps {
  nodes: ProxyNode[];
  activeNodeId: string;
  onSelectNode: (id: string) => void;
  onSaveNodes: (nodes: ProxyNode[]) => void;
}

interface TestRow {
  node: ProxyNode;
  tcpPing?: number;
  httpLatency?: number;
  downloadSpeed?: number; // bits/s
  uploadSpeed?: number;
  status: 'idle' | 'testing' | 'success' | 'timeout' | 'error';
}

export const SpeedTest: React.FC<SpeedTestProps> = ({
  nodes,
  activeNodeId,
  onSelectNode,
  onSaveNodes,
}) => {
  const [testMode, setTestMode] = useState<'ping' | 'latency' | 'download' | 'full'>('ping');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
    return (localStorage.getItem('ownbox_speedtest_view') as 'table' | 'cards') || 'cards';
  });
  const [isRunning, setIsRunning] = useState(false);
  const stopRequestedRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [testRows, setTestRows] = useState<TestRow[]>(() =>
    nodes.map((n) => ({
      node: n,
      tcpPing: n.ping && n.ping > 0 ? n.ping : undefined,
      httpLatency: n.httpLatency && n.httpLatency > 0 ? n.httpLatency : undefined,
      downloadSpeed: n.downloadSpeed && n.downloadSpeed > 0 ? n.downloadSpeed : undefined,
      status: 'idle',
    }))
  );

  // Sync testRows when nodes list changes (only when not running test)
  useEffect(() => {
    if (isRunning) return;
    setTestRows((prev) =>
      nodes.map((n) => {
        const existing = prev.find((r) => r.node.id === n.id);
        return {
          node: n,
          tcpPing: existing?.tcpPing ?? (n.ping && n.ping > 0 ? n.ping : undefined),
          httpLatency: existing?.httpLatency ?? (n.httpLatency && n.httpLatency > 0 ? n.httpLatency : undefined),
          downloadSpeed: existing?.downloadSpeed ?? (n.downloadSpeed && n.downloadSpeed > 0 ? n.downloadSpeed : undefined),
          status: existing?.status || 'idle',
        };
      })
    );
  }, [nodes, isRunning]);

  const handleToggleView = (mode: 'table' | 'cards') => {
    setViewMode(mode);
    try {
      localStorage.setItem('ownbox_speedtest_view', mode);
    } catch {}
  };

  // Full speed test runner (batch accelerated for ping, sequential isolated for throughput)
  const handleStartTest = async () => {
    if (!window.electronAPI || isRunning) return;
    setIsRunning(true);
    stopRequestedRef.current = false;

    // Filtered targets if user is searching, or all rows
    const targets = (searchQuery.trim() ? filteredRows : testRows).map((r) => r);
    if (targets.length === 0) {
      setIsRunning(false);
      return;
    }

    const targetIds = new Set(targets.map((r) => r.node.id));

    // Reset status for targets
    setTestRows((prev) =>
      prev.map((r) => (targetIds.has(r.node.id) ? { ...r, status: 'testing' } : r))
    );

    // MODE 1: TCP PING (Parallel batch accelerated)
    if (testMode === 'ping') {
      const pingList = targets.map((r) => ({
        id: r.node.id,
        host: r.node.server,
        port: r.node.port,
      }));

      const batchSize = 10;
      for (let i = 0; i < pingList.length; i += batchSize) {
        if (stopRequestedRef.current) break;
        const chunk = pingList.slice(i, i + batchSize);
        const resultsMap = await window.electronAPI.nodes.batchPing(chunk);

        setTestRows((prev) =>
          prev.map((r) => {
            const res = resultsMap.get(r.node.id);
            if (res) {
              const ping = res.time;
              return {
                ...r,
                tcpPing: ping,
                status: ping > 0 ? 'success' : 'timeout',
              };
            }
            return r;
          })
        );
      }
    } else {
      // MODE 2, 3, 4: Latency / Download / Full progressive test
      for (let i = 0; i < targets.length; i++) {
        if (stopRequestedRef.current) break;

        const row = targets[i];
        const item = row.node;

        setTestRows((prev) =>
          prev.map((r) => (r.node.id === item.id ? { ...r, status: 'testing' } : r))
        );

        let tcpPing = row.tcpPing;
        let httpLatency = row.httpLatency;
        let downloadSpeed = row.downloadSpeed;

        try {
          // 1. TCP Ping first
          const pingRes = await window.electronAPI.nodes.ping(item.server, item.port);
          tcpPing = pingRes.time;
          const isPingReachable = typeof tcpPing === 'number' && tcpPing > 0;

          // 2. HTTP Latency test
          if (testMode === 'latency' || testMode === 'full') {
            if (isPingReachable) {
              const lat = await window.electronAPI.speedTest.testLatency(undefined, item.id);
              httpLatency = lat > 0 ? lat : undefined;
            } else {
              httpLatency = undefined;
            }
          }

          // 3. Download Throughput test (pass item.id to switch isolated speedtest-selector)
          if (testMode === 'download' || testMode === 'full') {
            if (isPingReachable) {
              const speed = await window.electronAPI.speedTest.testDownload(undefined, item.id);
              downloadSpeed = speed > 0 ? speed : undefined;
            } else {
              downloadSpeed = undefined;
            }
          }

          // Compute accurate status
          let isSuccess = false;
          if (testMode === 'download') {
            isSuccess = Boolean(downloadSpeed && downloadSpeed > 0);
          } else if (testMode === 'latency') {
            isSuccess = Boolean(httpLatency && httpLatency > 0);
          } else {
            isSuccess = Boolean(isPingReachable || (httpLatency && httpLatency > 0));
          }

          const finalStatus = isSuccess ? 'success' : 'timeout';

          // Update state reactively
          setTestRows((prev) =>
            prev.map((r) =>
              r.node.id === item.id
                ? {
                    ...r,
                    tcpPing,
                    httpLatency,
                    downloadSpeed,
                    status: finalStatus,
                  }
                : r
            )
          );
        } catch {
          setTestRows((prev) =>
            prev.map((r) => (r.node.id === item.id ? { ...r, status: 'error' } : r))
          );
        }
      }
    }

    // Persist all results back to database
    setTestRows((latestRows) => {
      const savedNodes = nodes.map((n) => {
        const match = latestRows.find((r) => r.node.id === n.id);
        if (match) {
          return {
            ...n,
            ping: match.tcpPing !== undefined ? match.tcpPing : n.ping,
            httpLatency: match.httpLatency !== undefined ? match.httpLatency : n.httpLatency,
            downloadSpeed: match.downloadSpeed !== undefined ? match.downloadSpeed : n.downloadSpeed,
            lastTested: Date.now(),
          };
        }
        return n;
      });
      onSaveNodes(savedNodes);
      return latestRows;
    });

    setIsRunning(false);
  };

  // Alias for compatibility
  const handleStartAllSpeedTest = handleStartTest;

  const handleStopTest = () => {
    stopRequestedRef.current = true;
    setIsRunning(false);
    window.electronAPI?.speedTest.cancel();
  };

  // Test single row
  const handleTestSingleRow = async (targetNode: ProxyNode) => {
    if (!window.electronAPI || isRunning) return;
    setTestRows((prev) =>
      prev.map((r) => (r.node.id === targetNode.id ? { ...r, status: 'testing' } : r))
    );

    try {
      const pingRes = await window.electronAPI.nodes.ping(targetNode.server, targetNode.port);
      const isReachable = pingRes.time > 0;
      let lat: number | undefined;
      let dl: number | undefined;

      if (isReachable) {
        if (testMode === 'latency' || testMode === 'full') {
          const l = await window.electronAPI.speedTest.testLatency(undefined, targetNode.id);
          lat = l > 0 ? l : undefined;
        }
        if (testMode === 'download' || testMode === 'full') {
          const s = await window.electronAPI.speedTest.testDownload(undefined, targetNode.id);
          dl = s > 0 ? s : undefined;
        }
      }

      const isSuccess = Boolean(isReachable || (lat && lat > 0) || (dl && dl > 0));

      setTestRows((prev) => {
        const updated = prev.map((r) =>
          r.node.id === targetNode.id
            ? {
                ...r,
                tcpPing: pingRes.time,
                httpLatency: lat,
                downloadSpeed: dl,
                status: isSuccess ? ('success' as const) : ('timeout' as const),
              }
            : r
        );

        const savedNodes = nodes.map((n) =>
          n.id === targetNode.id
            ? {
                ...n,
                ping: pingRes.time,
                httpLatency: lat !== undefined ? lat : n.httpLatency,
                downloadSpeed: dl !== undefined ? dl : n.downloadSpeed,
                lastTested: Date.now(),
              }
            : n
        );
        onSaveNodes(savedNodes);

        return updated;
      });
    } catch {
      setTestRows((prev) =>
        prev.map((r) => (r.node.id === targetNode.id ? { ...r, status: 'error' } : r))
      );
    }
  };

  const formatSpeed = (bps?: number): string => {
    if (!bps || bps <= 0) return '-';
    const mbps = bps / 1000000;
    const mbytePerSec = bps / 8000000;
    if (mbytePerSec >= 1) {
      return `${mbytePerSec.toFixed(1)} MB/s (${mbps.toFixed(1)} Mbps)`;
    }
    const kbps = bps / 1000;
    const kbytePerSec = bps / 8000;
    if (kbytePerSec >= 1) {
      return `${kbytePerSec.toFixed(0)} KB/s (${kbps.toFixed(0)} Kbps)`;
    }
    return `${kbps.toFixed(0)} Kbps`;
  };

  const formatSpeedShort = (bps?: number): string => {
    if (!bps || bps <= 0) return '-';
    const mbytePerSec = bps / 8000000;
    if (mbytePerSec >= 1) {
      return `${mbytePerSec.toFixed(1)} MB/s`;
    }
    const kbytePerSec = bps / 8000;
    return `${kbytePerSec.toFixed(0)} KB/s`;
  };

  const filteredRows = testRows.filter(
    (r) =>
      r.node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.node.server.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.node.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* 1. Test Controls Panel */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <Zap className="w-4 h-4 text-blue-500" />
              <span>网络测速中心 (Speed Test Engine)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              测试节点的真实 TCP 握手延迟、HTTP URL 响应及带宽吞吐能力
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {isRunning ? (
              <button
                onClick={handleStopTest}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center space-x-2 shadow-sm shadow-red-500/25 transition-colors"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>停止测速</span>
              </button>
            ) : (
              <button
                onClick={handleStartAllSpeedTest}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center space-x-2 shadow-sm shadow-blue-500/25 transition-colors"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>开始全面测试</span>
              </button>
            )}
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-2">
            测试类型:
          </span>
          {[
            { id: 'ping', label: 'TCP Ping 握手' },
            { id: 'latency', label: 'HTTP 延迟' },
            { id: 'download', label: '下载测速' },
            { id: 'full', label: '综合完整基准测试' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTestMode(t.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                testMode === t.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Results Toolbar (Search & View Toggle) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索节点名称、服务器或协议..."
            className="w-full pl-9 pr-4 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-xs text-slate-400">
            共 {filteredRows.length} 个节点
          </span>

          <div className="flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
            <button
              onClick={() => handleToggleView('cards')}
              className={`p-1.5 rounded-lg transition-colors flex items-center space-x-1 ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="卡片视图"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium hidden sm:inline">卡片</span>
            </button>
            <button
              onClick={() => handleToggleView('table')}
              className={`p-1.5 rounded-lg transition-colors flex items-center space-x-1 ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="表格视图"
            >
              <List className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium hidden sm:inline">列表</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Results Container: Cards or Table */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredRows.map((row) => {
            const isSelected = row.node.id === activeNodeId;
            const region = detectRegion(row.node.name, row.node.server);
            const hasPing = row.tcpPing !== undefined && row.tcpPing > 0;
            const isTimeout = row.tcpPing === -1 || row.status === 'timeout';

            return (
              <div
                key={row.node.id}
                className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 shadow-sm ring-1 ring-blue-500/30'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800/80 shadow-sm'
                }`}
              >
                <div>
                  {/* Top: Protocol, Flag, Name */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                        {row.node.type}
                      </span>
                      <span className="text-sm shrink-0" title={region.name}>
                        {region.flag}
                      </span>
                      <h4 className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate flex-1">
                        {row.node.name}
                      </h4>
                    </div>

                    {isSelected && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 font-semibold shrink-0">
                        活动
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 font-mono truncate">
                    {row.node.server}:{row.node.port}
                  </p>

                  {/* Metrics Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-3">
                    {/* TCP Ping Pill */}
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center space-x-1 ${
                        hasPing
                          ? row.tcpPing! < 100
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold'
                            : row.tcpPing! <= 250
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-medium'
                            : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 font-semibold'
                          : isTimeout
                          ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/25 font-medium'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Zap className="w-2.5 h-2.5" />
                      <span>{hasPing ? `${row.tcpPing} ms` : isTimeout ? '超时' : '未测'}</span>
                    </span>

                    {/* HTTP Latency Pill */}
                    {row.httpLatency !== undefined && row.httpLatency > 0 && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center space-x-1">
                        <span className="text-[9px] opacity-70">HTTP</span>
                        <span>{row.httpLatency} ms</span>
                      </span>
                    )}

                    {/* Download Bandwidth Pill */}
                    {row.downloadSpeed !== undefined && row.downloadSpeed > 0 && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center space-x-1">
                        <Download className="w-2.5 h-2.5" />
                        <span>{formatSpeedShort(row.downloadSpeed)}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Status and Actions */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/60 text-xs">
                  <div>
                    {row.status === 'testing' ? (
                      <span className="text-amber-500 font-medium animate-pulse flex items-center space-x-1 text-[11px]">
                        <Activity className="w-3 h-3 animate-spin" />
                        <span>测速中...</span>
                      </span>
                    ) : row.status === 'success' ? (
                      <span className="text-emerald-500 font-medium flex items-center space-x-1 text-[11px]">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>
                          畅通 ({row.httpLatency ? `${row.httpLatency}ms` : `${row.tcpPing}ms`})
                        </span>
                      </span>
                    ) : row.status === 'timeout' ? (
                      <span className="text-rose-500 text-[11px] font-medium">超时不可达</span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">就绪</span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => handleTestSingleRow(row.node)}
                      disabled={isRunning || row.status === 'testing'}
                      className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="单独测试此节点"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>

                    {!isSelected && (
                      <button
                        onClick={() => onSelectNode(row.node.id)}
                        className="px-2 py-1 rounded-lg text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        使用
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800/80 text-slate-500 font-medium">
                <tr>
                  <th className="py-3 px-4">节点名称</th>
                  <th className="py-3 px-4">协议 / 服务器</th>
                  <th className="py-3 px-4">TCP Ping</th>
                  <th className="py-3 px-4">HTTP 延迟</th>
                  <th className="py-3 px-4">下行速度</th>
                  <th className="py-3 px-4">测试状态</th>
                  <th className="py-3 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
                {filteredRows.map((row) => {
                  const isSelected = row.node.id === activeNodeId;
                  const region = detectRegion(row.node.name, row.node.server);
                  return (
                    <tr
                      key={row.node.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-medium flex items-center space-x-2">
                        <span>{region.flag}</span>
                        <span>{row.node.name}</span>
                        {isSelected && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 font-semibold">
                            当前
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                        <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 mr-2">
                          {row.node.type}
                        </span>
                        {row.node.server}:{row.node.port}
                      </td>
                      <td className="py-3 px-4">
                        {row.tcpPing !== undefined && row.tcpPing > 0 ? (
                          <span
                            className={`font-semibold ${
                              row.tcpPing < 100
                                ? 'text-emerald-500'
                                : row.tcpPing <= 250
                                ? 'text-amber-500'
                                : 'text-rose-500'
                            }`}
                          >
                            {row.tcpPing} ms
                          </span>
                        ) : row.tcpPing === -1 ? (
                          <span className="text-rose-400">超时</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {row.httpLatency ? `${row.httpLatency} ms` : '-'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-blue-600 dark:text-blue-400 font-mono">
                        {formatSpeed(row.downloadSpeed)}
                      </td>
                      <td className="py-3 px-4">
                        {row.status === 'testing' ? (
                          <span className="text-amber-500 animate-pulse flex items-center space-x-1">
                            <Activity className="w-3 h-3 animate-spin" />
                            <span>测试中</span>
                          </span>
                        ) : row.status === 'success' ? (
                          <span className="text-emerald-500 flex items-center space-x-1 font-medium">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>
                              畅通 ({row.httpLatency ? `${row.httpLatency}ms` : `${row.tcpPing}ms`})
                            </span>
                          </span>
                        ) : row.status === 'timeout' ? (
                          <span className="text-rose-500 font-medium">超时不可达</span>
                        ) : (
                          <span className="text-slate-400">未测试</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleTestSingleRow(row.node)}
                            disabled={isRunning || row.status === 'testing'}
                            className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="单独测速"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          {!isSelected && (
                            <button
                              onClick={() => onSelectNode(row.node.id)}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            >
                              使用
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
