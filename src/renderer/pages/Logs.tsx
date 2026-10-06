import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Trash2,
  Copy,
  Pause,
  Play,
  Search,
  Download,
  Filter,
  Check,
} from 'lucide-react';
import { LogEntry } from '../../types';

export const Logs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState<'all' | 'debug' | 'info' | 'warn' | 'error'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    // Load full historical logs immediately upon opening page
    if (window.electronAPI.logs?.getAll) {
      window.electronAPI.logs.getAll().then((saved) => {
        if (saved && saved.length > 0) {
          setLogs(saved);
        }
      }).catch(() => {});
    }

    // Subscribe to live log streaming
    const handleNewLog = (entry: LogEntry) => {
      setLogs((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].id === entry.id) {
          return prev;
        }
        return [...prev.slice(-999), entry];
      });
    };

    const unsubCore = window.electronAPI.core?.onLog?.(handleNewLog);
    const unsubLogs = window.electronAPI.logs?.onLogAdded?.(handleNewLog);

    return () => {
      unsubCore?.();
      unsubLogs?.();
    };
  }, []);

  const handleClear = async () => {
    setLogs([]);
    if (window.electronAPI?.logs?.clear) {
      await window.electronAPI.logs.clear();
    }
  };

  useEffect(() => {
    if (!isPaused) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isPaused]);

  const filteredLogs = logs.filter((log) => {
    const matchLevel = levelFilter === 'all' || log.level === levelFilter;
    const matchSearch =
      searchQuery === '' || log.message.toLowerCase().includes(searchQuery.toLowerCase());
    return matchLevel && matchSearch;
  });

  const handleCopy = () => {
    const text = filteredLogs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = async () => {
    if (window.electronAPI?.logs?.exportLogs) {
      const res = await window.electronAPI.logs.exportLogs();
      if (res.success && res.filePath) {
        alert(`日志已成功导出至:\n${res.filePath}`);
        return;
      } else if (res.error) {
        alert(`导出失败: ${res.error}`);
        return;
      }
    }
    const text = filteredLogs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ownbox_log_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 h-[calc(100vh-6.5rem)] flex flex-col">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索日志关键字..."
            className="w-full pl-9 pr-4 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none"
          />
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center space-x-2">
          {/* Level Filter */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
            {(['all', 'info', 'warn', 'error'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-all ${
                  levelFilter === lvl
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {lvl === 'all' ? '全部' : lvl}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium flex items-center space-x-1 ${
              isPaused ? 'text-amber-500' : 'text-slate-600 dark:text-slate-300'
            }`}
            title={isPaused ? '恢复自动滚动' : '暂停自动滚动'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleCopy}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="复制日志"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleExport}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="导出日志到文本文件"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleClear}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-red-500 transition-colors"
            title="清空当前日志"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal View */}
      <div className="flex-1 bg-slate-950 rounded-2xl border border-slate-800 p-4 font-mono text-xs overflow-y-auto space-y-1 select-text shadow-inner">
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log) => {
            const isErr = log.level === 'error';
            const isWarn = log.level === 'warn';
            return (
              <div key={log.id} className="flex items-start space-x-2 leading-relaxed">
                <span className="text-slate-500 select-none shrink-0 font-mono text-[11px]">
                  {log.timeFormatted || (log.timestamp ? log.timestamp.split('T')[1]?.replace('Z', '') : '')}
                </span>
                <span
                  className={`text-[9px] font-bold uppercase px-1 py-0.2 rounded select-none shrink-0 ${
                    log.source === 'core'
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : log.source === 'system'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : log.source === 'net'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                  }`}
                >
                  {log.source || 'app'}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase px-1 rounded select-none shrink-0 ${
                    isErr
                      ? 'bg-red-500/20 text-red-400'
                      : isWarn
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-blue-500/20 text-blue-400'
                  }`}
                >
                  {log.level}
                </span>
                <span
                  className={`flex-1 break-all ${
                    isErr
                      ? 'text-red-300'
                      : isWarn
                      ? 'text-amber-200'
                      : 'text-slate-300'
                  }`}
                >
                  {log.message}
                </span>
              </div>
            );
          })
        ) : (
          <div className="text-slate-600 text-center py-16">暂无匹配的日志记录</div>
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};
