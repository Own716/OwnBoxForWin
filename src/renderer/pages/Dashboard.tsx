import React, { useState, useEffect, useRef } from 'react';
import {
  Power,
  ArrowDown,
  ArrowUp,
  Activity,
  Clock,
  Shield,
  Layers,
  ChevronRight,
  Server,
  Zap,
} from 'lucide-react';
import { ProxyNode, TrafficStats, AppSettings } from '../../types';

interface DashboardProps {
  coreState: string;
  onToggleConnect: () => void;
  nodes: ProxyNode[];
  activeNodeId: string;
  onSelectNode: (id: string) => void;
  traffic: TrafficStats;
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onNavigate: (tab: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  coreState,
  onToggleConnect,
  nodes,
  activeNodeId,
  onSelectNode,
  traffic,
  settings,
  onUpdateSettings,
  onNavigate,
}) => {
  const isConnected = coreState === 'running';
  const isConnecting = coreState === 'starting' || coreState === 'stopping';
  const activeNode = nodes.find((n) => n.id === activeNodeId) || nodes[0];

  const [showNodeSelector, setShowNodeSelector] = useState(false);
  const [speedHistory, setSpeedHistory] = useState<number[]>(new Array(24).fill(0));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Update speed history
  useEffect(() => {
    setSpeedHistory((prev) => [...prev.slice(1), traffic.downloadSpeed || 0]);
  }, [traffic.downloadSpeed]);

  // Draw real-time traffic chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const maxSpeed = Math.max(...speedHistory, 1024 * 1024); // at least 1MB/s scale

    // Background gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
    grad.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    ctx.beginPath();
    const step = width / (speedHistory.length - 1);
    speedHistory.forEach((val, i) => {
      const x = i * step;
      const y = height - (val / maxSpeed) * (height - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Chart stroke line
    ctx.beginPath();
    speedHistory.forEach((val, i) => {
      const x = i * step;
      const y = height - (val / maxSpeed) * (height - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }, [speedHistory]);

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatSpeed = (bytesPerSec: number): string => {
    return `${formatBytes(bytesPerSec)}/s`;
  };

  const formatUptime = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-5">
      {/* 1. Primary Connection Control Card */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm relative overflow-hidden">
        {/* Glow effect when connected */}
        {isConnected && (
          <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center space-x-2.5">
              <span
                className={`w-3 h-3 rounded-full ${
                  isConnected
                    ? 'bg-emerald-500 shadow-md shadow-emerald-500/50'
                    : isConnecting
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-slate-400 dark:bg-slate-600'
                }`}
              />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {isConnected ? '已连接到安全代理' : isConnecting ? '正在处理中...' : '已断开代理连接'}
              </span>
            </div>

            {/* Selected Node Details */}
            <div
              onClick={() => setShowNodeSelector(true)}
              className="flex items-center space-x-3 p-2.5 -ml-2.5 rounded-xl hover:bg-slate-100/80 dark:hover:bg-slate-800/80 cursor-pointer transition-colors w-fit"
              title="点击快速切换节点"
            >
              <div className="h-9 px-2.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                {activeNode?.type || 'PROXY'}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                    {activeNode?.name || (nodes.length === 0 ? '暂无节点，请先导入订阅' : '请选择节点')}
                  </h3>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex items-center space-x-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {activeNode ? (
                    <>
                      <span>{activeNode.server}:{activeNode.port}</span>
                      {activeNode.ping !== undefined && activeNode.ping > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {activeNode.ping} ms
                        </span>
                      )}
                    </>
                  ) : (
                    <span
                      className="text-blue-500 hover:underline cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate('subscriptions');
                      }}
                    >
                      前往订阅管理导入节点 →
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Big Connect Button */}
          <button
            onClick={onToggleConnect}
            disabled={isConnecting}
            className={`px-8 py-4 rounded-2xl font-semibold text-sm flex items-center justify-center space-x-3 transition-all shadow-lg active:scale-98 ${
              isConnected
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/25'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/30'
            } ${isConnecting ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            <Power className={`w-5 h-5 ${isConnected ? 'animate-none' : ''}`} />
            <span>{isConnected ? '断开代理连接' : isConnecting ? '连接中...' : '立即连接代理'}</span>
          </button>
        </div>
      </div>

      {/* 2. Real-time Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">实时下行</span>
            <ArrowDown className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {formatSpeed(traffic.downloadSpeed)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            总量: {formatBytes(traffic.totalDownload)}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">实时上行</span>
            <ArrowUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {formatSpeed(traffic.uploadSpeed)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            总量: {formatBytes(traffic.totalUpload)}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">网络延迟</span>
            <Activity className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {isConnected ? `${activeNode?.ping || 48} ms` : '-'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            状态: {isConnected ? '网络畅通' : '空闲'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">连接时间</span>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {isConnected ? formatUptime(traffic.uptime) : '00:00:00'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            核心: Sing-box v1.15
          </div>
        </div>
      </div>

      {/* 3. Real-time Traffic Graph */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
              动态流量图谱
            </h4>
            <p className="text-xs text-slate-400">实时带宽下行监控曲线</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium border border-blue-500/20">
            {formatSpeed(traffic.downloadSpeed)}
          </span>
        </div>
        <div className="w-full h-32 rounded-xl bg-slate-50/50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/50 overflow-hidden flex items-center justify-center">
          <canvas ref={canvasRef} width={680} height={128} className="w-full h-full" />
        </div>
      </div>

      {/* 4. Quick Switches & Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* System Proxy Switch */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h5 className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                Windows 系统代理
              </h5>
              <p className="text-[11px] text-slate-400">设置系统 IE/WinINet 代理</p>
            </div>
          </div>
          <button
            onClick={() =>
              onUpdateSettings({ systemProxyEnabled: !settings.systemProxyEnabled })
            }
            className={`w-11 h-6 rounded-full transition-colors relative ${
              settings.systemProxyEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                settings.systemProxyEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* TUN Mode Switch */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h5 className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                TUN 模式 (虚拟网卡)
              </h5>
              <p className="text-[11px] text-slate-400">全局透明接管网络</p>
            </div>
          </div>
          <button
            onClick={() => onUpdateSettings({ tunEnabled: !settings.tunEnabled })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              settings.tunEnabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                settings.tunEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Speed Test Shortcut */}
        <div
          onClick={() => onNavigate('speedtest')}
          className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex items-center justify-between hover:border-blue-500/50 cursor-pointer transition-all group"
        >
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h5 className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                一键批量测速
              </h5>
              <p className="text-[11px] text-slate-400">快速测试各节点真连延迟</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
        </div>
      </div>

      {/* Node Selector Drawer Modal */}
      {showNodeSelector && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                <Server className="w-4 h-4 text-blue-500" />
                <span>选择当前代理节点</span>
              </h3>
              <button
                onClick={() => setShowNodeSelector(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-2 py-1"
              >
                关闭
              </button>
            </div>

            <div className="overflow-y-auto space-y-2 flex-1 pr-1">
              {nodes.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    onSelectNode(n.id);
                    setShowNodeSelector(false);
                  }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    n.id === activeNodeId
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20'
                      : 'border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="font-medium text-xs text-slate-800 dark:text-slate-200">
                      {n.name}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {n.type.toUpperCase()} · {n.server}:{n.port}
                    </div>
                  </div>
                  {n.ping !== undefined && n.ping > 0 && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {n.ping} ms
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
