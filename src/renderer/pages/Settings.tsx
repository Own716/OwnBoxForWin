import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Sliders,
  Shield,
  Layers,
  Cpu,
  Save,
  Check,
  RotateCcw,
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
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
          </div>
        )}

        {/* 2. Proxy & Inbound */}
        {activeCategory === 'proxy' && (
          <div className="space-y-4 divide-y divide-slate-100 dark:divide-slate-800/60">
            <div className="flex items-center justify-between pb-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">本地混合监听端口 (Mixed Port)</h4>
                <p className="text-[11px] text-slate-400">同时兼容 HTTP(S) 与 SOCKS5 代理协议</p>
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
          </div>
        )}

        {/* 3. TUN Category */}
        {activeCategory === 'tun' && (
          <div className="space-y-4 divide-y divide-slate-100 dark:divide-slate-800/60">
            <div className="flex items-center justify-between pb-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">TUN 协议栈实现 (Stack)</h4>
                <p className="text-[11px] text-slate-400">推荐 System 或 GVisor 实现更稳定网络接管</p>
              </div>
              <select
                value={formData.tunStack}
                onChange={(e) => setFormData({ ...formData, tunStack: e.target.value as any })}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                <option value="system">System (原生系统驱动)</option>
                <option value="gvisor">gVisor (高性能纯用户态)</option>
                <option value="mixed">Mixed (混合式)</option>
              </select>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">虚拟网卡 MTU</h4>
                <p className="text-[11px] text-slate-400">推荐 9000 (巨帧加速) 或 1500</p>
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
                <p className="text-[11px] text-slate-400">开启后接管本机全部无代理软件流量</p>
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
              <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 font-mono font-medium text-xs">
                {coreVersion}
              </span>
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
          <button
            type="button"
            onClick={() => setFormData(settings)}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center space-x-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重置更改</span>
          </button>

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
    </div>
  );
};
