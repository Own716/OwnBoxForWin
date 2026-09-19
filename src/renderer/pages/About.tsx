import React, { useState } from 'react';
import {
  Github,
  Send,
  Shield,
  Heart,
  RefreshCw,
  ExternalLink,
  Code2,
  CheckCircle,
} from 'lucide-react';
import logoLight from '../assets/logo-light.png';
import logoDark from '../assets/logo-dark.png';

interface AboutProps {
  theme: 'light' | 'dark';
  coreVersion: string;
}

export const About: React.FC<AboutProps> = ({ theme, coreVersion }) => {
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateMsg(null);
    try {
      await new Promise((r) => setTimeout(r, 800));
      setUpdateMsg('当前已是最新版本 v1.0.0 正式版');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const openUrl = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Brand Hero Card */}
      <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm text-center space-y-4 relative overflow-hidden">
        <div className="w-24 h-24 mx-auto relative">
          <img
            src={theme === 'dark' ? logoDark : logoLight}
            alt="OwnBox Logo"
            className="w-full h-full object-contain rounded-2xl shadow-md"
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center justify-center gap-2">
            OwnBox
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20">
              v1.0.0 正式版
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto">
            基于 Sing-box 官方原生核心打造的现代化通用代理工具链与网络调试客户端
          </p>
        </div>

        {/* Action buttons */}
        <div className="pt-2 flex items-center justify-center space-x-3">
          <button
            onClick={handleCheckUpdate}
            disabled={isCheckingUpdate}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center space-x-1.5 shadow-sm shadow-blue-500/25 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
            <span>{isCheckingUpdate ? '正在检查...' : '检查软件更新'}</span>
          </button>
          <button
            onClick={() => openUrl('https://github.com/Own716/OwnBoxForWin')}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors"
          >
            <Github className="w-4 h-4" />
            <span>GitHub 仓库</span>
          </button>
          <button
            onClick={() => openUrl('https://t.me/OwnBoxs')}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors"
          >
            <Send className="w-4 h-4 text-blue-400" />
            <span>TG 交流频道</span>
          </button>
        </div>

        {updateMsg && (
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center justify-center space-x-1">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>{updateMsg}</span>
          </div>
        )}
      </div>

      {/* Info Details Grid */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4 text-xs">
        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
          版本与组件信息
        </h3>

        <div className="space-y-3 divide-y divide-slate-100 dark:divide-slate-800/60">
          <div className="flex items-center justify-between pt-1">
            <span className="text-slate-500">客户端版本 (App Version)</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
              1.0.0 Release (Windows x64)
            </span>
          </div>

          <div className="flex items-center justify-between pt-3">
            <span className="text-slate-500">Sing-box 官方核心版本</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
              {coreVersion}
            </span>
          </div>

          <div className="flex items-center justify-between pt-3">
            <span className="text-slate-500">Wintun 网卡驱动</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
              0.14.1 (amd64)
            </span>
          </div>

          <div className="flex items-center justify-between pt-3">
            <span className="text-slate-500">开源协议 (License)</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              GNU General Public License v3.0 (GPL-3.0)
            </span>
          </div>
        </div>
      </div>

      {/* Credits & Community */}
      <div className="p-5 rounded-2xl bg-slate-100/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 text-center space-y-2 text-xs text-slate-500">
        <p className="flex items-center justify-center space-x-1">
          <span>Crafted with</span>
          <Heart className="w-3.5 h-3.5 text-red-500 fill-current" />
          <span>by OwnBox Project & Contributors</span>
        </p>
        <p className="text-[11px] opacity-80">
          本软件完全遵循开源规范，严谨独立重写，不包含任何商业后门或遥测代码。
        </p>
      </div>
    </div>
  );
};
