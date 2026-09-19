import React, { useState } from 'react';
import { Plus, Trash2, GitFork, Shield, Globe, Slash, Check, X } from 'lucide-react';
import { RouteRule, AppSettings, ProxyNode } from '../../types';

interface RoutingProps {
  rules: RouteRule[];
  onSaveRules: (rules: RouteRule[]) => void;
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  nodes: ProxyNode[];
}

export const Routing: React.FC<RoutingProps> = ({
  rules,
  onSaveRules,
  settings,
  onUpdateSettings,
  nodes,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Partial<RouteRule>>({
    name: '',
    outbound: 'direct',
    domains: [],
    ip: [],
    port: '',
    enabled: true,
  });
  const [domainInput, setDomainInput] = useState('');
  const [ipInput, setIpInput] = useState('');

  const handleToggleRule = (ruleId: string) => {
    const updated = rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r));
    onSaveRules(updated);
  };

  const handleDeleteRule = (ruleId: string) => {
    const updated = rules.filter((r) => r.id !== ruleId);
    onSaveRules(updated);
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    const domains = domainInput
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean);
    const ip = ipInput
      .split('\n')
      .map((i) => i.trim())
      .filter(Boolean);

    const newRule: RouteRule = {
      id: Math.random().toString(36).substring(2),
      name: formData.name,
      enabled: true,
      domains: domains.length > 0 ? domains : undefined,
      ip: ip.length > 0 ? ip : undefined,
      port: formData.port || undefined,
      outbound: formData.outbound || 'direct',
    };

    onSaveRules([...rules, newRule]);
    setIsAdding(false);
    setFormData({ name: '', outbound: 'direct', enabled: true });
    setDomainInput('');
    setIpInput('');
  };

  return (
    <div className="space-y-4">
      {/* 1. Routing Mode Header */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-3">
        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
            路由模式 (Routing Mode)
          </h3>
          <p className="text-xs text-slate-400">
            控制网络请求如何根据目标地址、域名或进程进行智能分流
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-1">
          <button
            onClick={() => onUpdateSettings({ routingMode: 'rule' })}
            className={`p-3.5 rounded-xl border text-left flex items-start space-x-3 transition-all ${
              settings.routingMode === 'rule'
                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400'
            }`}
          >
            <GitFork className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-bold text-xs">规则分流 (推荐)</div>
              <div className="text-[11px] opacity-80 mt-0.5">国内直连，国外走代理，拦截广告</div>
            </div>
          </button>

          <button
            onClick={() => onUpdateSettings({ routingMode: 'global' })}
            className={`p-3.5 rounded-xl border text-left flex items-start space-x-3 transition-all ${
              settings.routingMode === 'global'
                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Globe className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-bold text-xs">全局代理 (Global)</div>
              <div className="text-[11px] opacity-80 mt-0.5">除系统直连规则外全量通过代理</div>
            </div>
          </button>

          <button
            onClick={() => onUpdateSettings({ routingMode: 'direct' })}
            className={`p-3.5 rounded-xl border text-left flex items-start space-x-3 transition-all ${
              settings.routingMode === 'direct'
                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Slash className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-bold text-xs">全局直连 (Direct)</div>
              <div className="text-[11px] opacity-80 mt-0.5">所有网络请求不走代理直接连接</div>
            </div>
          </button>
        </div>
      </div>

      {/* 2. Custom Routing Rules List */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              分流规则列表
            </h4>
            <p className="text-xs text-slate-400">
              优先级由上至下匹配，命中后执行对应动作
            </p>
          </div>

          <button
            onClick={() => setIsAdding(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center space-x-1.5 shadow-sm shadow-blue-500/25 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>添加自定义规则</span>
          </button>
        </div>

        <div className="space-y-2">
          {rules.map((rule) => {
            const isProxy = rule.outbound === 'proxy';
            const isDirect = rule.outbound === 'direct';
            const isBlock = rule.outbound === 'block';

            return (
              <div
                key={rule.id}
                className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-800/30 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={() => handleToggleRule(rule.id)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-0"
                  />
                  <div>
                    <h5 className="font-medium text-xs text-slate-800 dark:text-slate-200">
                      {rule.name}
                    </h5>
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                      {rule.domains && <span>{rule.domains.length} 域名规则</span>}
                      {rule.ip && <span>{rule.ip.length} IP 规则</span>}
                      {rule.port && <span>端口: {rule.port}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  {/* Outbound Badge */}
                  <span
                    className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                      isProxy
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                        : isDirect
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : isBlock
                        ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                        : 'bg-purple-500/10 text-purple-600 border border-purple-500/20'
                    }`}
                  >
                    {isProxy ? '代理 (Proxy)' : isDirect ? '直连 (Direct)' : isBlock ? '阻止 (Block)' : '指定节点'}
                  </span>

                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Rule Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                添加自定义分流规则
              </h3>
              <button
                onClick={() => setIsAdding(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddRule} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  规则名称
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如: 我的特定域名代理"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  分流动作 (Outbound)
                </label>
                <select
                  value={formData.outbound}
                  onChange={(e) => setFormData({ ...formData, outbound: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="proxy">代理 (Proxy)</option>
                  <option value="direct">直连 (Direct)</option>
                  <option value="block">阻止 / 屏蔽 (Block)</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      指定节点: {n.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  匹配域名 (一行一个，支持 domain:, full:, geosite:)
                </label>
                <textarea
                  rows={3}
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="domain:google.com&#10;geosite:github"
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  匹配 IP (一行一个，支持 CIDR 或 geoip:)
                </label>
                <textarea
                  rows={2}
                  value={ipInput}
                  onChange={(e) => setIpInput(e.target.value)}
                  placeholder="geoip:cn&#10;192.168.1.0/24"
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                >
                  添加规则
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
