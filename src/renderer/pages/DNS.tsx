import React, { useState } from 'react';
import { Globe, Server, Check, Zap, Save } from 'lucide-react';
import { DnsConfig } from '../../types';

interface DNSProps {
  dns: DnsConfig;
  onSaveDns: (dns: DnsConfig) => void;
}

export const DNS: React.FC<DNSProps> = ({ dns, onSaveDns }) => {
  const [formData, setFormData] = useState<DnsConfig>(dns);
  const [testDomain, setTestDomain] = useState('www.google.com');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveDns(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleTestDns = async () => {
    if (!testDomain) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      // Simulate DNS resolution check
      await new Promise((r) => setTimeout(r, 600));
      setTestResult(`解析成功: ${testDomain} -> 172.217.160.110 (延迟: 36ms)`);
    } catch {
      setTestResult('解析超时或失败');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSave} className="space-y-4">
        {/* 1. Header & DNS Mode */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              DNS 服务架构配置
            </h3>
            <p className="text-xs text-slate-400">
              配置安全防污染 DNS 解析服务，支持 DoH、DoT 及 FakeIP 虚拟池
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div
              onClick={() => setFormData({ ...formData, mode: 'standard' })}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                formData.mode === 'standard'
                  ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400'
              }`}
            >
              <div className="font-bold text-xs">标准真实 IP 模式 (Standard)</div>
              <div className="text-[11px] opacity-80 mt-1">
                远程安全 DNS 解析出真实 IP，连接时无需虚拟映射
              </div>
            </div>

            <div
              onClick={() => setFormData({ ...formData, mode: 'fakeip' })}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                formData.mode === 'fakeip'
                  ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400'
              }`}
            >
              <div className="font-bold text-xs">FakeIP 增强模式 (推荐)</div>
              <div className="text-[11px] opacity-80 mt-1">
                为域名瞬时分配 FakeIP，省去本地 DNS 往返延迟，极速首包建连
              </div>
            </div>
          </div>
        </div>

        {/* 2. DNS Servers */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4 text-xs">
          <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
            上游 DNS 服务器
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                远程代理 DNS (Remote DNS - 走节点代理)
              </label>
              <input
                type="text"
                required
                value={formData.remoteDns}
                onChange={(e) => setFormData({ ...formData, remoteDns: e.target.value })}
                placeholder="https://1.1.1.1/dns-query"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                常用: https://1.1.1.1/dns-query, https://dns.google/dns-query
              </span>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                国内直连 DNS (Direct DNS - 直连国内)
              </label>
              <input
                type="text"
                required
                value={formData.directDns}
                onChange={(e) => setFormData({ ...formData, directDns: e.target.value })}
                placeholder="223.5.5.5"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-blue-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                常用: 223.5.5.5 (阿里), 119.29.29.29 (腾讯)
              </span>
            </div>
          </div>

          {formData.mode === 'fakeip' && (
            <div className="pt-2">
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                FakeIP 虚拟网段 (IPv4 CIDR)
              </label>
              <input
                type="text"
                value={formData.fakeIpRange}
                onChange={(e) => setFormData({ ...formData, fakeIpRange: e.target.value })}
                placeholder="198.18.0.0/15"
                className="w-full sm:w-1/2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono focus:outline-none"
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                开启智能 DNS 分流
              </div>
              <div className="text-[11px] text-slate-400">
                自动匹配国内常用域名直连国内 DNS，防止 CDN 识别减速
              </div>
            </div>
            <input
              type="checkbox"
              checked={formData.enableDnsRouting}
              onChange={(e) =>
                setFormData({ ...formData, enableDnsRouting: e.target.checked })
              }
              className="w-4 h-4 rounded text-blue-600 focus:ring-0"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-3">
            {savedSuccess && (
              <span className="text-xs text-emerald-500 font-medium flex items-center space-x-1">
                <Check className="w-3.5 h-3.5" />
                <span>保存成功</span>
              </span>
            )}
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center space-x-1.5 shadow-sm shadow-blue-500/25"
            >
              <Save className="w-4 h-4" />
              <span>保存 DNS 配置</span>
            </button>
          </div>
        </div>
      </form>

      {/* 3. DNS Lookup Test Tool */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-3">
        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
          DNS 解析与连通性测试工具
        </h4>
        <div className="flex space-x-2">
          <input
            type="text"
            value={testDomain}
            onChange={(e) => setTestDomain(e.target.value)}
            placeholder="输入域名，例如: www.google.com"
            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-mono focus:outline-none"
          />
          <button
            onClick={handleTestDns}
            disabled={isTesting}
            className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-medium flex items-center space-x-1.5 transition-colors"
          >
            <Zap className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            <span>{isTesting ? '测试中...' : '测试解析'}</span>
          </button>
        </div>

        {testResult && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300">
            {testResult}
          </div>
        )}
      </div>
    </div>
  );
};
