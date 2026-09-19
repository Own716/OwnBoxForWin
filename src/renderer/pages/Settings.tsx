import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Sliders,
  Shield,
  Layers,
  Cpu,
  Save,
  Check,
  RotateCcw,
  Code2,
  Copy,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  FileText,
  X,
  Sparkles,
} from 'lucide-react';
import { AppSettings } from '../../types';

interface SettingsProps {
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  coreVersion: string;
}

export const Settings: React.FC<SettingsProps> = ({
  settings,
  onUpdateSettings,
  coreVersion,
}) => {
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [activeCategory, setActiveCategory] = useState<'general' | 'proxy' | 'tun' | 'core'>('general');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [liveConfigText, setLiveConfigText] = useState('');
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [flushStatus, setFlushStatus] = useState<string | null>(null);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  useEffect(() => {
    if (window.electronAPI?.system?.isAdmin) {
      window.electronAPI.system.isAdmin().then(setIsAdmin);
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleViewLiveConfig = async () => {
    if (window.electronAPI?.core?.getLiveConfig) {
      const cfg = await window.electronAPI.core.getLiveConfig();
      setLiveConfigText(cfg);
      setShowConfigModal(true);
    }
  };

  const handleCopyLiveConfig = () => {
    navigator.clipboard.writeText(liveConfigText);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  const handleFlushDns = async () => {
    if (window.electronAPI?.system?.flushDns) {
      setFlushStatus('正在刷新...');
      const res = await window.electronAPI.system.flushDns();
      setFlushStatus(res.message);
      setTimeout(() => setFlushStatus(null), 3000);
    }
  };

  const handleResetDefaults = async () => {
    if (!confirm('确定要恢复出厂推荐设置吗？这将重置端口、DNS 与路由选项。')) return;
    if (window.electronAPI?.settings?.resetDefaults) {
      const def = await window.electronAPI.settings.resetDefaults();
      setFormData(def);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    }
  };

  const handleRelaunchAdmin = () => {
    if (window.electronAPI?.system?.relaunchAsAdmin) {
      window.electronAPI.system.relaunchAsAdmin();
    }
  };

  return (
    <div className="space-y-4">
      {/* Category Tabs */}
      <div className="flex items-center space-x-2 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-x-auto">
        {[
          { id: 'general', label: '常规设置', icon: <Sliders className="w-4 h-4" /> },
          { id: 'proxy', label: '入站与系统代理', icon: <Shield className="w-4 h-4" /> },
          { id: 'tun', label: 'TUN 虚拟网卡', icon: <Layers className="w-4 h-4" /> },
          { id: 'core', label: '核心与高级', icon: <Cpu className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveCategory(tab.id as any)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              activeCategory === tab.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-6 text-xs">
        {/* 1. General Category */}
        {activeCategory === 'general' && (
          <div className="space-y-4 divide-y divide-slate-100 dark:divide-slate-800/60">
            <div className="flex items-center justify-between pb-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">应用外观主题</h4>
                <p className="text-[11px] text-slate-400">选择跟随系统或强制浅色/深色主题</p>
              </div>
              <select
                value={formData.theme}
                onChange={(e) => setFormData({ ...formData, theme: e.target.value as any })}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                <option value="system">跟随系统 (System)</option>
                <option value="light">浅色模式 (Light)</option>
                <option value="dark">深色模式 (Dark)</option>
              </select>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">开机自动启动</h4>
                <p className="text-[11px] text-slate-400">Windows 登录后自动在后台启动 OwnBox</p>
              </div>
              <input
                type="checkbox"
                checked={formData.startOnBoot}
                onChange={(e) => setFormData({ ...formData, startOnBoot: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 focus:ring-0"
              />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">启动后自动连接代理</h4>
                <p className="text-[11px] text-slate-400">软件启动时自动加载并连接默认节点</p>
              </div>
              <input
                type="checkbox"
                checked={formData.autoConnectOnLaunch}
                onChange={(e) =>
                  setFormData({ ...formData, autoConnectOnLaunch: e.target.checked })
                }
                className="w-4 h-4 rounded text-blue-600 focus:ring-0"
              />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">关闭窗口时最小化到系统托盘</h4>
                <p className="text-[11px] text-slate-400">点击关闭按钮保持后台代理不中断</p>
              </div>
              <input
                type="checkbox"
                checked={formData.closeToTray}
                onChange={(e) => setFormData({ ...formData, closeToTray: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 focus:ring-0"
              />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">系统分流路由模式</h4>
                <p className="text-[11px] text-slate-400">控制本机网络访问国内外网站的分流行为</p>
              </div>
              <select
                value={formData.routingMode}
                onChange={(e) => setFormData({ ...formData, routingMode: e.target.value as any })}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                <option value="rule">规则分流 (绕过大陆与局域网)</option>
                <option value="global">全局代理 (所有流量走节点)</option>
                <option value="direct">全局直连 (不走任何代理)</option>
              </select>
            </div>
          </div>
        )}

        {/* 2. Proxy & Inbound */}
        {activeCategory === 'proxy' && (
          <div className="space-y-4 divide-y divide-slate-100 dark:divide-slate-800/60">
            <div className="flex items-center justify-between pb-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">本地混合监听端口 (Mixed Port)</h4>
                <p className="text-[11px] text-slate-400">同时兼容 HTTP(S) 与 SOCKS5 代理协议，修改后自动同步 Windows 注册表</p>
              </div>
              <input
                type="number"
                value={formData.mixedPort}
                onChange={(e) => setFormData({ ...formData, mixedPort: Number(e.target.value) })}
                className="w-28 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono text-center focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">允许局域网连接 (Allow LAN)</h4>
                <p className="text-[11px] text-slate-400">监听 0.0.0.0，供局域网内手机或其它设备共享代理</p>
              </div>
              <input
                type="checkbox"
                checked={formData.allowLan}
                onChange={(e) => setFormData({ ...formData, allowLan: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 focus:ring-0"
              />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">系统代理自动绕过局域网地址</h4>
                <p className="text-[11px] text-slate-400">自动跳过 127.*, 10.*, 192.168.*, 172.16.* 等私网地址</p>
              </div>
              <input
                type="checkbox"
                checked={formData.systemProxyBypassLan}
                onChange={(e) =>
                  setFormData({ ...formData, systemProxyBypassLan: e.target.checked })
                }
                className="w-4 h-4 rounded text-blue-600 focus:ring-0"
              />
            </div>

            <div className="py-3 space-y-2">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">自定义系统代理绕过名单 (Bypass List)</h4>
                <p className="text-[11px] text-slate-400">不经过系统代理的域名或 IP（以分号或换行分隔，例如: localhost; 127.*; *.lan; 192.168.*）</p>
              </div>
              <textarea
                rows={3}
                value={formData.customBypassList || ''}
                onChange={(e) => setFormData({ ...formData, customBypassList: e.target.value })}
                placeholder="例如: localhost; 127.*; 192.168.*; 10.*"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono text-xs focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* 3. TUN Category */}
        {activeCategory === 'tun' && (
          <div className="space-y-4 divide-y divide-slate-100 dark:divide-slate-800/60">
            {/* Admin Permission Status Banner */}
            <div className={`p-4 rounded-xl border flex items-center justify-between ${
              isAdmin
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
            }`}>
              <div className="flex items-center space-x-2.5">
                {isAdmin ? (
                  <Check className="w-5 h-5 shrink-0 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
                )}
                <div>
                  <h5 className="font-semibold text-xs">
                    {isAdmin ? '当前运行环境：Windows 管理员权限 (已就绪)' : '当前运行环境：标准普通用户权限'}
                  </h5>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    {isAdmin
                      ? '已满足 Wintun 驱动创建与网络适配器路由控制要求，TUN 虚拟网卡模式可稳定运行。'
                      : '系统代理模式可正常稳定使用。如需启用 TUN 全局网卡模式，请点击右侧以管理员提权。'}
                  </p>
                </div>
              </div>
              {!isAdmin && (
                <button
                  type="button"
                  onClick={handleRelaunchAdmin}
                  className="shrink-0 ml-3 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs flex items-center space-x-1 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>以管理员身份重启</span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">启用 TUN 虚拟网卡模式</h4>
                <p className="text-[11px] text-slate-400">接管本机全部 TCP/UDP 流量（在非管理员权限下将自动保护性降级为系统代理）</p>
              </div>
              <input
                type="checkbox"
                checked={formData.tunEnabled}
                onChange={(e) => setFormData({ ...formData, tunEnabled: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 focus:ring-0"
              />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">TUN 协议栈实现 (Stack)</h4>
                <p className="text-[11px] text-slate-400">推荐 System (原生 Wintun 驱动) 或 gVisor (纯用户态协议栈)</p>
              </div>
              <select
                value={formData.tunStack}
                onChange={(e) => setFormData({ ...formData, tunStack: e.target.value as any })}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                <option value="system">System (原生系统驱动，性能极佳)</option>
                <option value="gvisor">gVisor (高性能 Google 纯用户态)</option>
                <option value="mixed">Mixed (混合式协议栈)</option>
              </select>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">虚拟网卡 MTU</h4>
                <p className="text-[11px] text-slate-400">推荐 9000 (巨帧吞吐加速) 或 1500 (标准以太网)</p>
              </div>
              <input
                type="number"
                value={formData.tunMtu}
                onChange={(e) => setFormData({ ...formData, tunMtu: Number(e.target.value) })}
                className="w-28 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono text-center focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">自动设置全局默认路由 (Auto Route)</h4>
                <p className="text-[11px] text-slate-400">开启后接管本机全部无代理设置软件的网络流量</p>
              </div>
              <input
                type="checkbox"
                checked={formData.tunAutoRoute}
                onChange={(e) => setFormData({ ...formData, tunAutoRoute: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 focus:ring-0"
              />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">严格路由模式 (Strict Route)</h4>
                <p className="text-[11px] text-slate-400">杜绝路由环路与 DNS 泄露风险</p>
              </div>
              <input
                type="checkbox"
                checked={formData.tunStrictRoute}
                onChange={(e) => setFormData({ ...formData, tunStrictRoute: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 focus:ring-0"
              />
            </div>
          </div>
        )}

        {/* 4. Core Category */}
        {activeCategory === 'core' && (
          <div className="space-y-4 divide-y divide-slate-100 dark:divide-slate-800/60">
            <div className="flex items-start justify-between pb-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-2">
                  <span>Sing-box 官方核心版本</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-600 font-medium">原生真内核</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">官方发布原生集成：{coreVersion}</p>
                <div className="mt-2 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <p>• 编译环境：<span className="font-mono text-slate-600 dark:text-slate-300">Go 1.25.13 (windows/amd64)</span></p>
                  <p>• 内置特性标签：<span className="font-mono text-slate-600 dark:text-slate-300">with_gvisor, with_quic, with_wireguard, with_utls, with_clash_api</span></p>
                  <p>• 驱动支持：<span className="font-mono text-slate-600 dark:text-slate-300">Wintun 0.14.1 (高性能虚拟网卡驱动)</span></p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleViewLiveConfig}
                className="px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 font-medium text-xs flex items-center space-x-1.5 transition-colors"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>查看内核实时配置</span>
              </button>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">核心日志输出级别</h4>
                <p className="text-[11px] text-slate-400">控制控制台与日志视窗详细程度</p>
              </div>
              <select
                value={formData.logLevel}
                onChange={(e) => setFormData({ ...formData, logLevel: e.target.value as any })}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                <option value="warn">Warn (仅警告与错误)</option>
                <option value="info">Info (常规信息)</option>
                <option value="debug">Debug (调试详细)</option>
                <option value="trace">Trace (全链路堆栈)</option>
              </select>
            </div>

            {/* Speed Test Settings */}
            <div className="py-3 space-y-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">测速与延迟探测目标 URL</h4>
                <p className="text-[11px] text-slate-400">用于节点真实网络连通性与延迟探测的目标接口</p>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={formData.testUrl}
                  onChange={(e) => setFormData({ ...formData, testUrl: e.target.value })}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono text-xs focus:outline-none"
                />
              </div>
              <div className="flex items-center space-x-2">
                {[
                  { label: 'Cloudflare', url: 'http://cp.cloudflare.com/generate_204' },
                  { label: 'Google', url: 'https://www.google.com/generate_204' },
                  { label: 'Gstatic', url: 'http://www.gstatic.com/generate_204' },
                  { label: 'Apple', url: 'https://www.apple.com/library/test/success.html' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setFormData({ ...formData, testUrl: preset.url })}
                    className="px-2.5 py-1 rounded-md text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">延迟测试超时时间 (毫秒)</h4>
                <p className="text-[11px] text-slate-400">单节点测试超时时间 (1000 ~ 15000 ms)</p>
              </div>
              <input
                type="number"
                value={formData.testTimeoutMs}
                onChange={(e) => setFormData({ ...formData, testTimeoutMs: Number(e.target.value) })}
                className="w-28 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono text-center focus:outline-none"
              />
            </div>

            {/* DNS Tools */}
            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">刷新 Windows 系统 DNS 缓存</h4>
                <p className="text-[11px] text-slate-400">调用系统底层清空本机 DNS 缓存，解决解析异常与缓存污染</p>
              </div>
              <div className="flex items-center space-x-2">
                {flushStatus && (
                  <span className="text-xs text-emerald-500 font-medium">{flushStatus}</span>
                )}
                <button
                  type="button"
                  onClick={handleFlushDns}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-xs flex items-center space-x-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>刷新系统 DNS</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">Clash API 控制端口</h4>
                <p className="text-[11px] text-slate-400">供实时监控与流量抓包仪表盘通讯</p>
              </div>
              <input
                type="number"
                value={formData.clashApiPort}
                onChange={(e) =>
                  setFormData({ ...formData, clashApiPort: Number(e.target.value) })
                }
                className="w-28 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono text-center focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Form Footer */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setFormData(settings)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center space-x-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>放弃修改</span>
            </button>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 flex items-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>恢复推荐默认设置</span>
            </button>
          </div>

          <div className="flex items-center space-x-3">
            {savedSuccess && (
              <span className="text-xs text-emerald-500 font-medium flex items-center space-x-1">
                <Check className="w-3.5 h-3.5" />
                <span>设置已生效保存</span>
              </span>
            )}
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center space-x-1.5 shadow-sm shadow-blue-500/25 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>保存配置</span>
            </button>
          </div>
        </div>
      </form>

      {/* Inspect Live Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Code2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                  Sing-box 核心实时运行配置 (Live JSON)
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleCopyLiveConfig}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs flex items-center space-x-1 transition-colors"
                >
                  {copiedConfig ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedConfig ? '已复制' : '复制 JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-auto bg-slate-950 text-slate-200 font-mono text-xs leading-relaxed select-text">
              <pre className="whitespace-pre-wrap break-all">{liveConfigText}</pre>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between text-[11px] text-slate-500">
              <span>此配置为当前送入 Sing-box 1.15 原生内核执行的真实完整 JSON。</span>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
