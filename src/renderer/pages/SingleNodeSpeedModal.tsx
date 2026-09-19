import React, { useState, useRef } from 'react';
import {
  X,
  Play,
  Square,
  Zap,
  Globe,
  DownloadCloud,
  CheckCircle2,
  Activity,
  RotateCw,
  Server,
  Save,
  Check,
} from 'lucide-react';
import { ProxyNode } from '../../types';
import { detectRegion } from './Nodes';

interface SingleNodeSpeedModalProps {
  node: ProxyNode;
  isActive: boolean;
  onSelectNode: (id: string) => void;
  onSaveNodePing: (nodeId: string, ping: number) => void;
  onClose: () => void;
}

export const SingleNodeSpeedModal: React.FC<SingleNodeSpeedModalProps> = ({
  node,
  isActive,
  onSelectNode,
  onSaveNodePing,
  onClose,
}) => {
  const [tcpPing, setTcpPing] = useState<number | null>(node.ping !== undefined ? node.ping : null);
  const [httpLatency, setHttpLatency] = useState<number | null>(null);
  const [downloadSpeed, setDownloadSpeed] = useState<number | null>(null);

  const [isTestingTcp, setIsTestingTcp] = useState(false);
  const [isTestingHttp, setIsTestingHttp] = useState(false);
  const [isTestingDownload, setIsTestingDownload] = useState(false);
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const stopRequestedRef = useRef(false);
  const region = detectRegion(node.name, node.server);

  // 1. Single TCP ping test
  const handleTestTcp = async () => {
    if (!window.electronAPI || isTestingTcp) return;
    setIsTestingTcp(true);
    try {
      const res = await window.electronAPI.nodes.ping(node.server, node.port);
      setTcpPing(res.time);
    } catch {
      setTcpPing(-1);
    } finally {
      setIsTestingTcp(false);
    }
  };

  // 2. Single HTTP latency test
  const handleTestHttp = async () => {
    if (!window.electronAPI || isTestingHttp) return;
    setIsTestingHttp(true);
    try {
      const delay = await window.electronAPI.speedTest.testLatency(undefined, node.id);
      setHttpLatency(delay);
    } catch {
      setHttpLatency(-1);
    } finally {
      setIsTestingHttp(false);
    }
  };

  // 3. Single Download test
  const handleTestDownload = async () => {
    if (!window.electronAPI || isTestingDownload) return;
    setIsTestingDownload(true);
    try {
      const speed = await window.electronAPI.speedTest.testDownload(undefined, node.id);
      setDownloadSpeed(speed);
    } catch {
      setDownloadSpeed(0);
    } finally {
      setIsTestingDownload(false);
    }
  };

  // 4. Sequential full test
  const handleTestAll = async () => {
    if (!window.electronAPI || isTestingAll) return;
    setIsTestingAll(true);
    stopRequestedRef.current = false;

    // Step 1: TCP Ping
    setIsTestingTcp(true);
    let latestTcp = tcpPing;
    try {
      const res = await window.electronAPI.nodes.ping(node.server, node.port);
      latestTcp = res.time;
      setTcpPing(latestTcp);
    } catch {
      latestTcp = -1;
      setTcpPing(-1);
    } finally {
      setIsTestingTcp(false);
    }

    if (stopRequestedRef.current) {
      setIsTestingAll(false);
      return;
    }

    // Step 2: HTTP Latency
    setIsTestingHttp(true);
    try {
      const delay = await window.electronAPI.speedTest.testLatency(undefined, node.id);
      setHttpLatency(delay);
    } catch {
      setHttpLatency(-1);
    } finally {
      setIsTestingHttp(false);
    }

    if (stopRequestedRef.current) {
      setIsTestingAll(false);
      return;
    }

    // Step 3: Download Throughput
    setIsTestingDownload(true);
    try {
      const speed = await window.electronAPI.speedTest.testDownload(undefined, node.id);
      setDownloadSpeed(speed);
    } catch {
      setDownloadSpeed(0);
    } finally {
      setIsTestingDownload(false);
    }

    setIsTestingAll(false);
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    window.electronAPI?.speedTest.cancel();
    setIsTestingTcp(false);
    setIsTestingHttp(false);
    setIsTestingDownload(false);
    setIsTestingAll(false);
  };

  const handleSaveToNode = () => {
    const val = tcpPing !== null && tcpPing > 0 ? tcpPing : (httpLatency !== null ? httpLatency : -1);
    onSaveNodePing(node.id, val);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const isAnyRunning = isTestingTcp || isTestingHttp || isTestingDownload || isTestingAll;

  const formatSpeed = (bps: number | null): { value: string; unit: string; secondary?: string } => {
    if (bps === null) return { value: '-', unit: '' };
    if (bps <= 0) return { value: '0', unit: 'Mbps' };
    const mbps = bps / 1000000;
    const mbpsFormatted = mbps >= 10 ? mbps.toFixed(1) : mbps.toFixed(2);
    const mbytePerSec = (bps / 8000000).toFixed(2);
    return {
      value: mbpsFormatted,
      unit: 'Mbps',
      secondary: `${mbytePerSec} MB/s`,
    };
  };

  const speedData = formatSpeed(downloadSpeed);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200/90 dark:border-slate-800/90 shadow-2xl space-y-5 text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base" title={region.name}>{region.flag}</span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate max-w-[260px]">
                  {node.name}
                </h3>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                  {node.type}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">单节点网络与带宽专项诊断测速</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Node Connection Details Bar */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 truncate">
            <Server className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-mono text-slate-600 dark:text-slate-300 truncate">
              {node.server}:{node.port}
            </span>
          </div>
          <div className="shrink-0 flex items-center space-x-1.5">
            {isActive ? (
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                <span>当前使用中</span>
              </span>
            ) : (
              <button
                onClick={() => onSelectNode(node.id)}
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                设为当前节点
              </button>
            )}
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-3">
          {/* Card 1: TCP Ping */}
          <div className="p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                <Zap className="w-3 h-3 text-amber-500" />
                <span>TCP 延迟</span>
              </span>
              <button
                onClick={handleTestTcp}
                disabled={isAnyRunning}
                className="p-1 rounded-md text-slate-400 hover:text-blue-500 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-40"
                title="单独测试 TCP 延迟"
              >
                <RotateCw className={`w-3 h-3 ${isTestingTcp ? 'animate-spin text-blue-500' : ''}`} />
              </button>
            </div>

            <div className="py-1">
              {isTestingTcp ? (
                <div className="text-xs text-blue-500 animate-pulse font-medium">检测中...</div>
              ) : tcpPing !== null ? (
                tcpPing === -1 ? (
                  <div className="text-base font-bold text-rose-500">超时</div>
                ) : (
                  <div className="flex items-baseline space-x-1">
                    <span
                      className={`text-xl font-black ${
                        tcpPing < 200
                          ? 'text-emerald-500'
                          : tcpPing < 400
                          ? 'text-amber-500'
                          : 'text-rose-500'
                      }`}
                    >
                      {tcpPing}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">ms</span>
                  </div>
                )
              ) : (
                <div className="text-lg font-bold text-slate-300 dark:text-slate-600">-</div>
              )}
            </div>

            <div className="text-[10px] text-slate-400 leading-tight">直连握手时延</div>
          </div>

          {/* Card 2: HTTP Latency */}
          <div className="p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                <Globe className="w-3 h-3 text-blue-500" />
                <span>HTTP 延迟</span>
              </span>
              <button
                onClick={handleTestHttp}
                disabled={isAnyRunning}
                className="p-1 rounded-md text-slate-400 hover:text-blue-500 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-40"
                title="单独测试 HTTP 延迟"
              >
                <RotateCw className={`w-3 h-3 ${isTestingHttp ? 'animate-spin text-blue-500' : ''}`} />
              </button>
            </div>

            <div className="py-1">
              {isTestingHttp ? (
                <div className="text-xs text-blue-500 animate-pulse font-medium">请求中...</div>
              ) : httpLatency !== null ? (
                httpLatency === -1 ? (
                  <div className="text-base font-bold text-rose-500">超时</div>
                ) : (
                  <div className="flex items-baseline space-x-1">
                    <span
                      className={`text-xl font-black ${
                        httpLatency < 250
                          ? 'text-emerald-500'
                          : httpLatency < 500
                          ? 'text-amber-500'
                          : 'text-rose-500'
                      }`}
                    >
                      {httpLatency}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">ms</span>
                  </div>
                )
              ) : (
                <div className="text-lg font-bold text-slate-300 dark:text-slate-600">-</div>
              )}
            </div>

            <div className="text-[10px] text-slate-400 leading-tight">代理真实响应时延</div>
          </div>

          {/* Card 3: Download Speed */}
          <div className="p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                <DownloadCloud className="w-3 h-3 text-purple-500" />
                <span>下行吞吐</span>
              </span>
              <button
                onClick={handleTestDownload}
                disabled={isAnyRunning}
                className="p-1 rounded-md text-slate-400 hover:text-blue-500 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-40"
                title="单独测试下行速率"
              >
                <RotateCw className={`w-3 h-3 ${isTestingDownload ? 'animate-spin text-blue-500' : ''}`} />
              </button>
            </div>

            <div className="py-1">
              {isTestingDownload ? (
                <div className="text-xs text-purple-500 animate-pulse font-medium">测速中...</div>
              ) : downloadSpeed !== null ? (
                <div className="flex items-baseline space-x-1">
                  <span className="text-xl font-black text-purple-600 dark:text-purple-400">
                    {speedData.value}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400">{speedData.unit}</span>
                </div>
              ) : (
                <div className="text-lg font-bold text-slate-300 dark:text-slate-600">-</div>
              )}
            </div>

            <div className="text-[10px] text-slate-400 leading-tight">
              {speedData.secondary ? speedData.secondary : '5MB 采样测速'}
            </div>
          </div>
        </div>

        {/* Progress Bar when testing all */}
        {isAnyRunning && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                <span>
                  {isTestingTcp
                    ? '正在测试服务器 TCP 握手时延...'
                    : isTestingHttp
                    ? '正在测试真实 HTTP 代理响应...'
                    : '正在测试下行带宽速率...'}
                </span>
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-600 h-1.5 rounded-full animate-pulse w-full" />
            </div>
          </div>
        )}

        {/* Actions Footer */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            {!isActive ? (
              <button
                onClick={() => {
                  onSelectNode(node.id);
                  onClose();
                }}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium flex items-center space-x-1.5 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                <span>立即切换使用</span>
              </button>
            ) : (
              <button
                onClick={handleSaveToNode}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium flex items-center space-x-1.5 transition-colors"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">已保存</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-slate-400" />
                    <span>保存延迟结果</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {isAnyRunning ? (
              <button
                onClick={handleStop}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>停止</span>
              </button>
            ) : (
              <button
                onClick={handleTestAll}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm shadow-blue-500/25 transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>全面测速</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
