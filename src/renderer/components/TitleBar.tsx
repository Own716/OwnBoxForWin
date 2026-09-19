import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import logoLight from '../assets/logo-light.png';
import logoDark from '../assets/logo-dark.png';

interface TitleBarProps {
  theme: 'light' | 'dark';
  coreState: string;
  activeNodeName?: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({ theme, coreState, activeNodeName }) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.window.isMaximized().then(setIsMaximized);
    }
  }, []);

  const handleMinimize = () => window.electronAPI?.window.minimize();
  const handleMaximize = () => {
    window.electronAPI?.window.maximize();
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => window.electronAPI?.window.close();

  const isConnected = coreState === 'running';

  return (
    <header
      className="h-10 w-full flex items-center justify-between px-3 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md select-none z-50 sticky top-0"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Brand & App Info */}
      <div className="flex items-center space-x-2.5">
        <img
          src={theme === 'dark' ? logoDark : logoLight}
          alt="OwnBox Logo"
          className="w-5 h-5 object-contain rounded-md shadow-sm"
        />
        <span className="font-semibold text-xs tracking-wide text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          OwnBox
          <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            v1.0.1 正式版
          </span>
        </span>

        {/* Live Status Pill */}
        <div className="hidden sm:flex items-center space-x-1.5 pl-3 border-l border-slate-200 dark:border-slate-800 text-[11px]">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                : 'bg-slate-400 dark:bg-slate-600'
            }`}
          />
          <span className="text-slate-500 dark:text-slate-400">
            {isConnected ? `已连接: ${activeNodeName || '默认节点'}` : '未连接代理'}
          </span>
        </div>
      </div>

      {/* Windows Window Controls */}
      <div
        className="flex items-center -mr-3 h-full"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <button
          onClick={handleMinimize}
          className="h-full px-3.5 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800/80 transition-colors"
          title="最小化"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full px-3.5 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800/80 transition-colors"
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
        </button>
        <button
          onClick={handleClose}
          className="h-full px-4 flex items-center justify-center text-slate-500 hover:text-white hover:bg-red-500 dark:hover:bg-red-600 transition-colors"
          title="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
