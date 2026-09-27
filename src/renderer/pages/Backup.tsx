import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  CloudUpload,
  CloudDownload,
  Share2,
  Smartphone,
  Check,
  RefreshCw,
  Save,
  FileText,
  AlertCircle,
  AlertTriangle,
  Layers,
  ShieldCheck,
  X,
  CheckCircle2,
  Download,
  Upload,
  Settings as SettingsIcon,
  RotateCcw,
} from 'lucide-react';
import {
  AppSettings,
  WebDAVConfig,
  BackupCategories,
  BackupPreviewResult,
  BackupImportResult,
} from '../../types';

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
  // Category selection for Export
  const [exportCategories, setExportCategories] = useState<BackupCategories>({
    profiles: true,
    rules: true,
    settings: true,
  });

  // Category selection for Import Preview
  const [importCategories, setImportCategories] = useState<BackupCategories>({
    profiles: true,
    rules: true,
    settings: true,
  });

  // Local latest overwrite backup info
  const [localBackupInfo, setLocalBackupInfo] = useState<{
    exists: boolean;
    timestamp?: number;
    size?: number;
    filePath?: string;
  }>({ exists: false });

  // WebDAV state
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

  // Preview & Modal State
  const [pendingFileContent, setPendingFileContent] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');
  const [previewResult, setPreviewResult] = useState<BackupPreviewResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [isImporting, setIsImporting] = useState(false);

  // Status banners & feedback
  const [actionNotice, setActionNotice] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    details?: string;
  } | null>(null);

  useEffect(() => {
    loadLocalBackupInfo();
  }, []);

  const loadLocalBackupInfo = async () => {
    if (!window.electronAPI?.backup?.getLatestLocalBackupInfo) return;
    try {
      const info = await window.electronAPI.backup.getLatestLocalBackupInfo();
      setLocalBackupInfo(info);
    } catch {}
  };

  // Helper: Trigger file download in browser/Electron renderer
  const downloadFile = (dataStr: string, fileName: string, mimeType = 'application/json') => {
    const blob = new Blob([dataStr], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 1. Action: 分享 (Share)
  const handleShare = async () => {
    if (!window.electronAPI?.backup) return;
    try {
      const data = await window.electronAPI.backup.exportData(exportCategories);
      await navigator.clipboard.writeText(data);
      setActionNotice({
        type: 'success',
        message: '备份配置已成功复制到剪贴板！',
        details: '您可以直接将该文本内容发送给其他设备或通过微信/QQ等直接分享导入。',
      });
    } catch (e: any) {
      setActionNotice({
        type: 'error',
        message: `分享复制失败: ${e.message}`,
      });
    }
  };

  // 2. Action: 导出到文件 (Windows native .ownboxbackup)
  const handleExportWindows = async () => {
    if (!window.electronAPI?.backup) return;
    try {
      const data = await window.electronAPI.backup.exportData(exportCategories);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadFile(data, `OwnBox_Win_Backup_${timestamp}.ownboxbackup`);
      setActionNotice({
        type: 'success',
        message: 'Windows 桌面端备份文件已生成并下载。',
      });
    } catch (e: any) {
      setActionNotice({
        type: 'error',
        message: `导出失败: ${e.message}`,
      });
    }
  };

  // 3. Action: 导出为 Android 兼容备份 (.json)
  const handleExportAndroid = async () => {
    if (!window.electronAPI?.backup) return;
    try {
      const data = await window.electronAPI.backup.exportAndroid(exportCategories);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadFile(data, `OwnBox_backup_android_${timestamp}.json`);
      setActionNotice({
        type: 'success',
        message: 'Android 手机端兼容备份已成功生成！',
        details: '该文件符合 OwnBox 手机端原生 Base64 Parcel 规范，手机端可直接点击“从文件导入”无损恢复。',
      });
    } catch (e: any) {
      setActionNotice({
        type: 'error',
        message: `导出 Android 兼容备份失败: ${e.message}`,
      });
    }
  };

  // 4. Action: 选择文件准备导入并打开 Preview Modal
  const handleSelectImportFile = (e: React.ChangeEvent<HTMLInputElement>, isMobileSpecific = false) => {
    const file = e.target.files?.[0];
    if (!file || !window.electronAPI?.backup) return;

    setPendingFileName(file.name);
    setIsPreviewLoading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        setPendingFileContent(content);

        // Run dry-run preview in background
        const preview: BackupPreviewResult = await window.electronAPI.backup.previewImport(
          content,
          importCategories
        );
        setPreviewResult(preview);
        setPreviewModalOpen(true);
      } catch (err: any) {
        setActionNotice({
          type: 'error',
          message: `解析备份文件失败: ${err.message}`,
        });
      } finally {
        setIsPreviewLoading(false);
        // reset input value so re-selecting same file works
        e.target.value = '';
      }
    };

    reader.readAsText(file);
  };

  // 5. Action: Confirm Import inside Modal
  const handleConfirmImport = async () => {
    if (!pendingFileContent || !window.electronAPI?.backup) return;

    setIsImporting(true);
    try {
      const result: BackupImportResult = await window.electronAPI.backup.importWithTransaction(
        pendingFileContent,
        importCategories,
        importMode
      );

      setPreviewModalOpen(false);
      setPendingFileContent(null);
      setPreviewResult(null);

      setActionNotice({
        type: 'success',
        message: '🎉 备份数据导入成功！',
        details: `已成功应用：${result.importedCounts.nodes} 个节点，${result.importedCounts.groups} 个分组订阅，${result.importedCounts.rules} 条路由规则，${result.importedCounts.settings} 项设置配置。${
          result.snapshotPath ? `（已自动创建防灾快照）` : ''
        }`,
      });

      onRefreshAllData();
      loadLocalBackupInfo();
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        message: `导入失败并已自动回滚: ${err.message}`,
      });
    } finally {
      setIsImporting(false);
    }
  };

  // 6. Action: Local Overwrite Backup (OwnBox_latest.ownboxbackup)
  const handleCreateLocalBackup = async () => {
    if (!window.electronAPI?.backup) return;
    try {
      const res = await window.electronAPI.backup.createLocalBackup();
      if (res.success) {
        await loadLocalBackupInfo();
        setActionNotice({
          type: 'success',
          message: '本地最新覆盖备份 (OwnBox_latest.ownboxbackup) 已更新！',
          details: '系统已原子写入最新快照并自动留存上一次状态为 .bak 备份。',
        });
      }
    } catch (e: any) {
      setActionNotice({
        type: 'error',
        message: `创建本地备份失败: ${e.message}`,
      });
    }
  };

  const handleRestoreLocalBackup = async () => {
    if (!window.electronAPI?.backup) return;
    if (!confirm('确定要从本地最新备份 (OwnBox_latest.ownboxbackup) 覆盖还原当前全部配置吗？')) return;

    try {
      const res = await window.electronAPI.backup.restoreLocalBackup();
      if (res.success) {
        setActionNotice({
          type: 'success',
          message: '本地最新备份恢复成功！',
        });
        onRefreshAllData();
      }
    } catch (e: any) {
      setActionNotice({
        type: 'error',
        message: `本地备份恢复失败: ${e.message}`,
      });
    }
  };

  // 7. Action: WebDAV Handlers
  const handleSaveWebDAV = () => {
    onUpdateSettings({ webdav: webdavForm });
    setActionNotice({
      type: 'success',
      message: 'WebDAV 云端服务器配置已保存。',
    });
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
        setSyncStatus('云端备份上传成功！已同步至远端目录');
      } else {
        setSyncStatus('云端备份上传失败，请检查配置与网络');
      }
    } catch (e: any) {
      setSyncStatus(`上传异常: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleWebDAVRestore = async () => {
    if (!window.electronAPI) return;
    if (!confirm('确定要从 WebDAV 云端下载并恢复配置吗？系统将在导入前自动创建本地快照。')) return;
    setIsSyncing(true);
    try {
      const success = await window.electronAPI.webdav.restore();
      if (success) {
        setActionNotice({
          type: 'success',
          message: '云端备份恢复成功！',
        });
        onRefreshAllData();
      }
    } catch (e: any) {
      setActionNotice({
        type: 'error',
        message: `云端恢复失败: ${e.message}`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Top Banner Notice */}
      {actionNotice && (
        <div
          className={`p-4 rounded-2xl flex items-start justify-between border ${
            actionNotice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : actionNotice.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
              : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
          }`}
        >
          <div className="flex items-start space-x-3">
            {actionNotice.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
            ) : actionNotice.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
            )}
            <div>
              <div className="font-semibold text-xs">{actionNotice.message}</div>
              {actionNotice.details && (
                <div className="text-[11px] opacity-80 mt-1">{actionNotice.details}</div>
              )}
            </div>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Primary Action Hub: 4 Core Buttons */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <Layers className="w-5 h-5 text-blue-600" />
              <span>跨端备份、迁移与同步中心</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              打通 OwnBox Android 手机端与 Windows 桌面端备份体系，支持三项分类独立选择与安全合并
            </p>
          </div>

          {/* Export Category Toggles */}
          <div className="flex items-center space-x-3 text-xs bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <span className="text-slate-400 font-medium text-[11px]">导出分类:</span>
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="checkbox"
                checked={exportCategories.profiles}
                onChange={(e) =>
                  setExportCategories({ ...exportCategories, profiles: e.target.checked })
                }
                className="rounded text-blue-600 focus:ring-0 w-3.5 h-3.5"
              />
              <span className="text-slate-700 dark:text-slate-300">节点/分组</span>
            </label>
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="checkbox"
                checked={exportCategories.rules}
                onChange={(e) =>
                  setExportCategories({ ...exportCategories, rules: e.target.checked })
                }
                className="rounded text-blue-600 focus:ring-0 w-3.5 h-3.5"
              />
              <span className="text-slate-700 dark:text-slate-300">路由规则</span>
            </label>
            <label className="flex items-center space-x-1 cursor-pointer">
              <input
                type="checkbox"
                checked={exportCategories.settings}
                onChange={(e) =>
                  setExportCategories({ ...exportCategories, settings: e.target.checked })
                }
                className="rounded text-blue-600 focus:ring-0 w-3.5 h-3.5"
              />
              <span className="text-slate-700 dark:text-slate-300">设置项</span>
            </label>
          </div>
        </div>

        {/* The 4 Primary Action Buttons Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Button 1: 分享 (Share) */}
          <button
            onClick={handleShare}
            className="p-4 rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-gradient-to-br from-blue-50/60 to-indigo-50/30 dark:from-blue-950/20 dark:to-indigo-950/10 hover:border-blue-400 dark:hover:border-blue-700 transition-all text-left flex flex-col justify-between group shadow-sm"
          >
            <div className="flex items-center justify-between w-full mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/25 group-hover:scale-105 transition-transform">
                <Share2 className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                复制剪贴板
              </span>
            </div>
            <div>
              <div className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">
                分享备份配置
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                将选中的分类配置一键复制为格式化文本，便于即时分享或粘贴传输。
              </p>
            </div>
          </button>

          {/* Button 2: 导出到文件 (Export to File) */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all text-left flex flex-col justify-between group shadow-sm">
            <div className="flex items-center justify-between w-full mb-3">
              <div className="w-10 h-10 rounded-xl bg-slate-800 dark:bg-slate-700 text-white flex items-center justify-center shadow-md shadow-slate-600/25 group-hover:scale-105 transition-transform">
                <Download className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                .ownboxbackup
              </span>
            </div>
            <div>
              <div className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">
                导出到文件
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                保存为桌面端完整备份文件，便于离线储存和多台 PC 间迁移。
              </p>
              <button
                onClick={handleExportWindows}
                className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>保存桌面端文件</span>
              </button>
            </div>
          </div>

          {/* Button 3: 从文件导入 (Import from File) */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all text-left flex flex-col justify-between group shadow-sm">
            <div className="flex items-center justify-between w-full mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/25 group-hover:scale-105 transition-transform">
                <Upload className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                预检对比
              </span>
            </div>
            <div>
              <div className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">
                从文件导入
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                导入 .ownboxbackup 或通用备份文件，自动解析并弹窗确认变更明细。
              </p>
              <label className="w-full py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center justify-center space-x-1.5 cursor-pointer transition-colors shadow-sm shadow-emerald-500/20">
                <CloudUpload className="w-3.5 h-3.5" />
                <span>选择备份文件</span>
                <input
                  type="file"
                  accept=".ownboxbackup,.json,.zip"
                  onChange={(e) => handleSelectImportFile(e, false)}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Button 4: 从 OwnBox 手机端导入 (Import from Mobile) */}
          <div className="p-4 rounded-2xl border border-purple-200 dark:border-purple-900/50 bg-gradient-to-br from-purple-50/60 to-pink-50/30 dark:from-purple-950/20 dark:to-pink-950/10 hover:border-purple-400 dark:hover:border-purple-700 transition-all text-left flex flex-col justify-between group shadow-sm">
            <div className="flex items-center justify-between w-full mb-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-500/25 group-hover:scale-105 transition-transform">
                <Smartphone className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                手机端直连
              </span>
            </div>
            <div>
              <div className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1">
                从手机端导入
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                一键解码 OwnBox Android 导出的 Base64 Parcel 备份，智能映射节点与分组。
              </p>
              <label className="w-full py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium flex items-center justify-center space-x-1.5 cursor-pointer transition-colors shadow-sm shadow-purple-500/20">
                <Smartphone className="w-3.5 h-3.5" />
                <span>选择 Android 备份</span>
                <input
                  type="file"
                  accept=".json,.zip"
                  onChange={(e) => handleSelectImportFile(e, true)}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Android Compatible Export Feature Entry */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 flex items-center space-x-2">
                <span>导出为 Android 手机端兼容备份</span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 font-normal">
                  双向打通
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                自动将 Windows 节点的 Sing-box Outbound 配置和分组打包为 Android 原生 Base64 格式，手机端从文件导入即刻恢复
              </div>
            </div>
          </div>
          <button
            onClick={handleExportAndroid}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium flex items-center space-x-1.5 transition-colors flex-shrink-0 shadow-sm shadow-teal-500/25"
          >
            <Download className="w-4 h-4" />
            <span>导出 Android 备份 (.json)</span>
          </button>
        </div>
      </div>

      {/* 2. Local Latest Overwrite Backup Card */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <HardDrive className="w-4 h-4 text-indigo-500" />
              <span>本地自动覆盖备份 (OwnBox_latest.ownboxbackup)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              系统独立维护本地最新状态快照与 .bak 双保险副本，与手动导出文件严格分离
            </p>
          </div>

          {localBackupInfo.exists && localBackupInfo.timestamp && (
            <div className="text-right">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                最近保存: {new Date(localBackupInfo.timestamp).toLocaleString()}
              </span>
              {localBackupInfo.size && (
                <div className="text-[10px] text-slate-400">
                  文件大小: {(localBackupInfo.size / 1024).toFixed(1)} KB
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>
              {localBackupInfo.exists
                ? '本地最新备份就绪，可随时一键恢复到最近状态。'
                : '尚未生成本地覆盖备份，建议点击右侧按钮立即备份。'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {localBackupInfo.exists && (
              <button
                type="button"
                onClick={handleRestoreLocalBackup}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
                <span>从本地最新备份恢复</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCreateLocalBackup}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-sm shadow-indigo-500/25"
            >
              <Save className="w-3.5 h-3.5" />
              <span>立即更新本地最新备份</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. WebDAV Cloud Sync Card */}
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

      {/* 4. Dry-Run Import Preview Modal */}
      {previewModalOpen && previewResult && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    导入预检与变更确认 (Dry-Run Preview)
                  </h3>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    来源文件: <span className="font-mono">{pendingFileName}</span> (识别格式:{' '}
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {previewResult.format === 'ownbox_android'
                        ? 'OwnBox Android 手机端备份'
                        : previewResult.format === 'ownbox_windows'
                        ? 'OwnBox Windows 桌面端备份'
                        : previewResult.format === 'singbox_config'
                        ? 'Sing-box 原生配置'
                        : '通用配置'}
                    </span>
                    )
                  </div>
                </div>
              </div>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Category Selectors for this Import */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  导入分类选择:
                </span>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importCategories.profiles}
                      onChange={(e) =>
                        setImportCategories({ ...importCategories, profiles: e.target.checked })
                      }
                      className="rounded text-blue-600 focus:ring-0 w-4 h-4"
                    />
                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                      分组与节点 ({previewResult.counts.nodes.total})
                    </span>
                  </label>
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importCategories.rules}
                      onChange={(e) =>
                        setImportCategories({ ...importCategories, rules: e.target.checked })
                      }
                      className="rounded text-blue-600 focus:ring-0 w-4 h-4"
                    />
                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                      路由规则 ({previewResult.counts.rules.total})
                    </span>
                  </label>
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importCategories.settings}
                      onChange={(e) =>
                        setImportCategories({ ...importCategories, settings: e.target.checked })
                      }
                      className="rounded text-blue-600 focus:ring-0 w-4 h-4"
                    />
                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                      系统设置 ({previewResult.counts.settings.total})
                    </span>
                  </label>
                </div>
              </div>

              {/* Statistics Badges Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="text-slate-400 text-[11px] mb-1">节点变更</div>
                  <div className="text-base font-bold text-slate-800 dark:text-slate-100">
                    +{previewResult.counts.nodes.add} / ~{previewResult.counts.nodes.update}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    新增 {previewResult.counts.nodes.add}，更新 {previewResult.counts.nodes.update}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="text-slate-400 text-[11px] mb-1">分组/订阅变更</div>
                  <div className="text-base font-bold text-slate-800 dark:text-slate-100">
                    +{previewResult.counts.groups.add} / ~{previewResult.counts.groups.update}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    新增 {previewResult.counts.groups.add}，更新 {previewResult.counts.groups.update}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="text-slate-400 text-[11px] mb-1">路由规则变更</div>
                  <div className="text-base font-bold text-slate-800 dark:text-slate-100">
                    +{previewResult.counts.rules.add} / ~{previewResult.counts.rules.update}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    新增 {previewResult.counts.rules.add}，更新 {previewResult.counts.rules.update}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="text-slate-400 text-[11px] mb-1">设置变更项</div>
                  <div className="text-base font-bold text-slate-800 dark:text-slate-100">
                    {previewResult.counts.settings.changed} 项
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {previewResult.counts.settings.changed > 0 ? '将更新不同配置' : '配置一致'}
                  </div>
                </div>
              </div>

              {/* Warnings / Fallback alerts */}
              {previewResult.warnings && previewResult.warnings.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="font-semibold flex items-center space-x-1.5 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span>预检提示信息</span>
                  </div>
                  {previewResult.warnings.map((w, idx) => (
                    <div key={idx} className="text-[11px] opacity-90 pl-5">
                      • {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Mode Selector: Merge vs Replace */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80">
                <div>
                  <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                    导入合并模式
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {importMode === 'merge'
                      ? '安全增量合并：保留本地已有节点和规则，仅更新同名项或追加新项'
                      : '全量替换覆盖：清空所选分类下的旧数据，替换为导入数据（防误删保护已开启）'}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setImportMode('merge')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      importMode === 'merge'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    安全合并 (推荐)
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      importMode === 'replace'
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    覆盖替换
                  </button>
                </div>
              </div>

              {/* Item Previews List */}
              <div>
                <div className="font-semibold text-xs text-slate-700 dark:text-slate-300 mb-2">
                  变更明细预览 (前 20 条):
                </div>
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                  {previewResult.itemsPreview.slice(0, 20).map((item, index) => (
                    <div
                      key={index}
                      className="px-3 py-2 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/40"
                    >
                      <div className="flex items-center space-x-2 overflow-hidden">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            item.action === 'add'
                              ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                              : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                          }`}
                        >
                          {item.action === 'add' ? '新增' : '更新'}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {item.name}
                        </span>
                        <span className="text-[11px] text-slate-400 truncate">{item.detail}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 uppercase flex-shrink-0">
                        {item.type}
                      </span>
                    </div>
                  ))}
                  {previewResult.itemsPreview.length === 0 && (
                    <div className="p-4 text-center text-slate-400 text-xs">
                      没有可预览的变更项
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>导入执行前将自动生成 pre-import 防灾快照</span>
              </span>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  disabled={isImporting}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isImporting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-sm shadow-blue-500/25"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>正在原子导入并校验...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>确认导入并应用</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
