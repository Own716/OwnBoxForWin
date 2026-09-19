import React, { useState, useEffect } from 'react';
import { Plus, Trash2, LayoutGrid, Check, X, RefreshCw, AppWindow } from 'lucide-react';
import { AppRule, InstalledAppInfo } from '../../types';

interface AppRoutingProps {
  appRules: AppRule[];
  onSaveAppRules: (rules: AppRule[]) => void;
}

export const AppRouting: React.FC<AppRoutingProps> = ({ appRules, onSaveAppRules }) => {
  const [runningApps, setRunningApps] = useState<InstalledAppInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [customAction, setCustomAction] = useState<'proxy' | 'direct' | 'block'>('proxy');

  const fetchRunningApps = async () => {
    if (!window.electronAPI) return;
    setIsScanning(true);
    try {
      const apps = await window.electronAPI.routing.getRunningApps();
      setRunningApps(apps);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    fetchRunningApps();
  }, []);

  const handleToggle = (id: string) => {
    const updated = appRules.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a));
    onSaveAppRules(updated);
  };

  const handleActionChange = (id: string, action: 'proxy' | 'direct' | 'block') => {
    const updated = appRules.map((a) => (a.id === id ? { ...a, action } : a));
    onSaveAppRules(updated);
  };

  const handleDelete = (id: string) => {
    const updated = appRules.filter((a) => a.id !== id);
    onSaveAppRules(updated);
  };

  const handleAddApp = (app: InstalledAppInfo) => {
    if (appRules.some((r) => r.exePath.toLowerCase() === app.exePath.toLowerCase())) {
      alert('该应用已在分流列表中');
      return;
    }
    const newRule: AppRule = {
      id: Math.random().toString(36).substring(2),
      name: app.name,
      exePath: app.exePath,
      action: 'proxy',
      enabled: true,
    };
    onSaveAppRules([...appRules, newRule]);
    setShowAddModal(false);
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName || !customPath) return;
    const newRule: AppRule = {
      id: Math.random().toString(36).substring(2),
      name: customName,
      exePath: customPath,
      action: customAction,
      enabled: true,
    };
    onSaveAppRules([...appRules, newRule]);
    setShowAddModal(false);
    setCustomName('');
    setCustomPath('');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
            Windows 应用分流
          </h3>
          <p className="text-xs text-slate-400">
            根据程序可执行文件 (.exe) 独立控制走代理、直连或阻止连接
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={fetchRunningApps}
            disabled={isScanning}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center space-x-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>扫描已运行软件</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center space-x-1.5 shadow-sm shadow-blue-500/25 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>添加应用</span>
          </button>
        </div>
      </div>

      {/* App Rules List */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-3">
        {appRules.length > 0 ? (
          <div className="space-y-2">
            {appRules.map((rule) => (
              <div
                key={rule.id}
                className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-800/30 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={() => handleToggle(rule.id)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-0"
                  />
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                    <AppWindow className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-medium text-xs text-slate-800 dark:text-slate-200">
                      {rule.name}
                    </h5>
                    <p className="text-[11px] font-mono text-slate-400 truncate max-w-md">
                      {rule.exePath}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  {/* Action Segmented Control */}
                  <div className="flex items-center p-0.5 rounded-lg bg-slate-200/60 dark:bg-slate-800 border border-slate-300/40 dark:border-slate-700 text-xs">
                    <button
                      onClick={() => handleActionChange(rule.id, 'proxy')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        rule.action === 'proxy'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      代理
                    </button>
                    <button
                      onClick={() => handleActionChange(rule.id, 'direct')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        rule.action === 'direct'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      直连
                    </button>
                    <button
                      onClick={() => handleActionChange(rule.id, 'block')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        rule.action === 'block'
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      阻止
                    </button>
                  </div>

                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs">
            暂无应用分流规则，点击“添加应用”即可将软件加入代理或直连白名单。
          </div>
        )}
      </div>

      {/* Add App Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                选择已检测到的应用程序
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick List */}
            <div className="overflow-y-auto space-y-1.5 flex-1 pr-1">
              {runningApps.map((app, i) => (
                <div
                  key={i}
                  onClick={() => handleAddApp(app)}
                  className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
                      <AppWindow className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {app.name}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate max-w-xs">
                        {app.exePath}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    添加
                  </span>
                </div>
              ))}
            </div>

            {/* Manual input */}
            <form onSubmit={handleAddCustom} className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                手动输入程序路径 (.exe)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="软件名称"
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <input
                  type="text"
                  required
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="程序名或完整路径 (例如: chrome.exe)"
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                确认手动添加
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
