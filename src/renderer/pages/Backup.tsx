import React, { useState } from 'react';
import {
  HardDrive,
  CloudUpload,
  CloudDownload,
  Check,
  RefreshCw,
  Save,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { AppSettings, WebDAVConfig } from '../../types';

interface BackupProps {
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onRefreshAllData: () => void;
}

export const Backup: React.FC<BackupProps> = ({
  settings,
  onUpdateSettings,
  onRefreshAllData,
}) => {
  const [webdavForm, setWebdavForm] = useState<WebDAVConfig>(
    settings.webdav || {
      serverUrl: '',
      username: '',
      password: '',
      remotePath: 'OwnBox',
      autoSync: false,
    }
  );

  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const handleExportLocal = async () => {
    if (!window.electronAPI) return;
    try {
      const data = await window.electronAPI.backup.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ownbox_backup_${Date.now()}.ownboxbackup`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`导出失败: ${e.message}`);
    }
  };

  const handleImportLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !window.electronAPI) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        await window.electronAPI.backup.importData(content);
        alert('配置恢复成功！');
        onRefreshAllData();
      } catch (err: any) {
        alert(`恢复失败: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveWebDAV = () => {
    onUpdateSettings({ webdav: webdavForm });
    alert('WebDAV 配置已保存');
  };

  const handleTestWebDAV = async () => {
    if (!webdavForm.serverUrl || !window.electronAPI) return;
    setIsTesting(true);
    setTestStatus(null);
    try {
      const res = await window.electronAPI.webdav.test(webdavForm);
      setTestStatus(res);
    } finally {
      setIsTesting(false);
    }
  };

  const handleWebDAVBackup = async () => {
    if (!window.electronAPI) return;
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const success = await window.electronAPI.webdav.backup();
      if (success) {
        setSyncStatus('云端备份上传成功！');
      } else {
        setSyncStatus('云端备份上传失败，请检查配置');
      }
    } catch (e: any) {
      setSyncStatus(`上传异常: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleWebDAVRestore = async () => {
    if (!window.electronAPI) return;
    if (!confirm('确定要从 WebDAV 云端下载并覆盖当前本地配置吗？')) return;
    setIsSyncing(true);
    try {
      const success = await window.electronAPI.webdav.restore();
      if (success) {
        alert('云端恢复成功！');
        onRefreshAllData();
      }
    } catch (e: any) {
      alert(`恢复失败: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Local Backup & Restore */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center space-x-2">
            <HardDrive className="w-4 h-4 text-blue-500" />
            <span>本地备份与迁移</span>
          </h3>
          <p className="text-xs text-slate-400">
            完整导出包含节点、分组、订阅、路由及设置的 .ownboxbackup 归档文件，无损跨平台迁移
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Export card */}
          <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                导出本地完整备份
              </div>
              <div className="text-[11px] text-slate-400">生成 .ownboxbackup 文件</div>
            </div>
            <button
              onClick={handleExportLocal}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center space-x-1.5 shadow-sm shadow-blue-500/25 transition-colors"
            >
              <CloudDownload className="w-4 h-4" />
              <span>立即导出</span>
            </button>
          </div>

          {/* Import card */}
          <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                从文件恢复配置
              </div>
              <div className="text-[11px] text-slate-400">
                支持 .ownboxbackup 及 Android JSON
              </div>
            </div>
            <label className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium flex items-center space-x-1.5 cursor-pointer transition-colors">
              <CloudUpload className="w-4 h-4 text-blue-500" />
              <span>选择文件</span>
              <input
                type="file"
                accept=".ownboxbackup,.json"
                onChange={handleImportLocal}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* 2. WebDAV Cloud Sync */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <CloudUpload className="w-4 h-4 text-emerald-500" />
              <span>WebDAV 云端同步与多端联动</span>
            </h3>
            <p className="text-xs text-slate-400">
              与坚果云、Nextcloud、Alist 等 WebDAV 服务器同步备份数据
            </p>
          </div>

          {settings.webdav?.lastSyncTime && (
            <span className="text-[11px] text-slate-400">
              上次同步: {new Date(settings.webdav.lastSyncTime).toLocaleString()}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              WebDAV 服务器地址 (Server URL)
            </label>
            <input
              type="url"
              value={webdavForm.serverUrl}
              onChange={(e) => setWebdavForm({ ...webdavForm, serverUrl: e.target.value })}
              placeholder="https://dav.jianguoyun.com/dav/"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              账号 (Username)
            </label>
            <input
              type="text"
              value={webdavForm.username}
              onChange={(e) => setWebdavForm({ ...webdavForm, username: e.target.value })}
              placeholder="WebDAV 用户名"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              密码 / 应用凭据 (Password)
            </label>
            <input
              type="password"
              value={webdavForm.password}
              onChange={(e) => setWebdavForm({ ...webdavForm, password: e.target.value })}
              placeholder="WebDAV 授权密码"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              远端存放目录
            </label>
            <input
              type="text"
              value={webdavForm.remotePath}
              onChange={(e) => setWebdavForm({ ...webdavForm, remotePath: e.target.value })}
              placeholder="OwnBox"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between sm:pt-6">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              自动同步到云端
            </span>
            <input
              type="checkbox"
              checked={webdavForm.autoSync}
              onChange={(e) => setWebdavForm({ ...webdavForm, autoSync: e.target.checked })}
              className="w-4 h-4 rounded text-blue-600 focus:ring-0"
            />
          </div>
        </div>

        {/* Action buttons & feedback */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleTestWebDAV}
              disabled={isTesting}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-200 flex items-center space-x-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? '连接中...' : '测试 WebDAV 连接'}</span>
            </button>

            {testStatus && (
              <span
                className={`text-xs font-medium flex items-center space-x-1 ${
                  testStatus.success ? 'text-emerald-500' : 'text-red-500'
                }`}
              >
                {testStatus.success ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                <span>{testStatus.message}</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSaveWebDAV}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 font-medium"
            >
              保存配置
            </button>
            <button
              type="button"
              onClick={handleWebDAVRestore}
              disabled={isSyncing}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-200"
            >
              从云端下载恢复
            </button>
            <button
              type="button"
              onClick={handleWebDAVBackup}
              disabled={isSyncing}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm shadow-blue-500/25"
            >
              {isSyncing ? '正在备份...' : '立即备份到云端'}
            </button>
          </div>
        </div>

        {syncStatus && (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium text-xs">
            {syncStatus}
          </div>
        )}
      </div>
    </div>
  );
};
