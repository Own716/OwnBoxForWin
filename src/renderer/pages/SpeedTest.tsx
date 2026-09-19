import React, { useState } from 'react';
import {
  Zap,
  Play,
  Square,
  ArrowDown,
  ArrowUp,
  Activity,
  CheckCircle,
  Search,
  Check,
} from 'lucide-react';
import { ProxyNode } from '../../types';

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
  const [isRunning, setIsRunning] = useState(false);
  const [testRows, setTestRows] = useState<TestRow[]>(
    nodes.map((n) => ({
      node: n,
      tcpPing: n.ping && n.ping > 0 ? n.ping : undefined,
      status: 'idle',
    }))
  );
  const [searchQuery, setSearchQuery] = useState('');

  const handleStartTest = async () => {
    if (!window.electronAPI || isRunning) return;
    setIsRunning(true);

    const updatedRows = [...testRows];

    for (let i = 0; i < updatedRows.length; i++) {
      if (!isRunning && i > 0 && !isRunning) break;

      updatedRows[i].status = 'testing';
      setTestRows([...updatedRows]);

      try {
        const item = updatedRows[i].node;

        // 1. TCP Ping test
        const pingRes = await window.electronAPI.nodes.ping(item.server, item.port);
        updatedRows[i].tcpPing = pingRes.time;

        // 2. Latency test if requested
        if (testMode === 'latency' || testMode === 'full') {
          const lat = await window.electronAPI.speedTest.testLatency();
          updatedRows[i].httpLatency = lat > 0 ? lat : undefined;
        }

        // 3. Download speed test if requested
        if (testMode === 'download' || testMode === 'full') {
          const speed = await window.electronAPI.speedTest.testDownload();
          updatedRows[i].downloadSpeed = speed;
        }

        updatedRows[i].status = pingRes.time > 0 ? 'success' : 'timeout';
      } catch {
        updatedRows[i].status = 'error';
      }

      setTestRows([...updatedRows]);
    }

    // Save back updated ping to nodes database
    const savedNodes = nodes.map((n) => {
      const match = updatedRows.find((r) => r.node.id === n.id);
      return match && match.tcpPing !== undefined ? { ...n, ping: match.tcpPing } : n;
    });
    onSaveNodes(savedNodes);

    setIsRunning(false);
  };

  const handleStopTest = () => {
    setIsRunning(false);
    window.electronAPI?.speedTest.cancel();
  };

  const formatSpeed = (bps?: number): string => {
    if (!bps || bps <= 0) return '-';
    const mbps = bps / (1024 * 1024);
    return `${mbps.toFixed(1)} Mbps`;
  };

  const filteredRows = testRows.filter(
    (r) =>
      r.node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.node.server.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* 1. Test Controls Panel */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              网络测速中心 (Speed Test Engine)
            </h3>
            <p className="text-xs text-slate-400">
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
                onClick={handleStartTest}
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

      {/* 2. Results Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="过滤结果列表..."
              className="w-full pl-9 pr-4 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>
          <span className="text-xs text-slate-400">
            共 {filteredRows.length} 个节点
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800/80 text-slate-500 font-medium">
              <tr>
                <th className="py-3 px-4">节点名称</th>
                <th className="py-3 px-4">协议 / 服务器</th>
                <th className="py-3 px-4">TCP Ping</th>
                <th className="py-3 px-4">HTTP 延迟</th>
                <th className="py-3 px-4">下行速度</th>
                <th className="py-3 px-4">状态</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
              {filteredRows.map((row) => {
                const isSelected = row.node.id === activeNodeId;
                return (
                  <tr
                    key={row.node.id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                      isSelected ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-medium flex items-center space-x-2">
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
                              : row.tcpPing < 200
                              ? 'text-amber-500'
                              : 'text-red-500'
                          }`}
                        >
                          {row.tcpPing} ms
                        </span>
                      ) : row.tcpPing === -1 ? (
                        <span className="text-red-400">超时</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {row.httpLatency ? `${row.httpLatency} ms` : '-'}
                    </td>
                    <td className="py-3 px-4 font-medium text-blue-600 dark:text-blue-400">
                      {formatSpeed(row.downloadSpeed)}
                    </td>
                    <td className="py-3 px-4">
                      {row.status === 'testing' ? (
                        <span className="text-amber-500 animate-pulse flex items-center space-x-1">
                          <Activity className="w-3 h-3 animate-spin" />
                          <span>测试中</span>
                        </span>
                      ) : row.status === 'success' ? (
                        <span className="text-emerald-500 flex items-center space-x-1">
                          <CheckCircle className="w-3 h-3" />
                          <span>畅通</span>
                        </span>
                      ) : row.status === 'timeout' ? (
                        <span className="text-red-500">超时不可达</span>
                      ) : (
                        <span className="text-slate-400">未测试</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {!isSelected && (
                        <button
                          onClick={() => onSelectNode(row.node.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                        >
                          应用为活动节点
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
