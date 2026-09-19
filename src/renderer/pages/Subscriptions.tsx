import React, { useState } from 'react';
import {
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Copy,
  Rss,
  Clock,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  X,
} from 'lucide-react';
import { Subscription } from '../../types';

interface SubscriptionsProps {
  subscriptions: Subscription[];
  onSaveSubscriptions: (subs: Subscription[]) => void;
  onRefreshNodes: () => void;
}

export const Subscriptions: React.FC<SubscriptionsProps> = ({
  subscriptions,
  onSaveSubscriptions,
  onRefreshNodes,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    autoUpdate: true,
    updateIntervalHours: 24,
  });

  const handleUpdate = async (id: string) => {
    if (!window.electronAPI) return;
    setUpdatingId(id);
    try {
      const success = await window.electronAPI.subscriptions.update(id);
      if (success) {
        onRefreshNodes();
        const all = await window.electronAPI.subscriptions.getAll();
        onSaveSubscriptions(all);
      } else {
        alert('更新订阅失败，请检查链接是否有效');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除此订阅源吗？')) {
      const updated = subscriptions.filter((s) => s.id !== id);
      onSaveSubscriptions(updated);
    }
  };

  const handleSaveSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.url) return;

    if (editingSub) {
      const updated = subscriptions.map((s) =>
        s.id === editingSub.id ? { ...s, ...formData } : s
      );
      onSaveSubscriptions(updated);
    } else {
      const newSub: Subscription = {
        id: Math.random().toString(36).substring(2),
        name: formData.name,
        url: formData.url,
        nodeCount: 0,
        lastUpdate: 0,
        autoUpdate: formData.autoUpdate,
        updateIntervalHours: formData.updateIntervalHours,
        status: 'idle',
      };
      onSaveSubscriptions([...subscriptions, newSub]);
    }

    setIsAdding(false);
    setEditingSub(null);
    setFormData({ name: '', url: '', autoUpdate: true, updateIntervalHours: 24 });
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
            订阅源管理
          </h3>
          <p className="text-xs text-slate-400">
            自动获取并更新机场节点、Base64 订阅与 Sing-box 远程规则
          </p>
        </div>

        <button
          onClick={() => {
            setEditingSub(null);
            setFormData({ name: '', url: '', autoUpdate: true, updateIntervalHours: 24 });
            setIsAdding(true);
          }}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center space-x-1.5 shadow-sm shadow-blue-500/25 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>添加订阅</span>
        </button>
      </div>

      {/* Subscriptions List */}
      {subscriptions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {subscriptions.map((sub) => {
            const isUpdating = updatingId === sub.id;
            return (
              <div
                key={sub.id}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                        <Rss className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                          {sub.name}
                        </h4>
                        <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                          <span>包含 {sub.nodeCount || 0} 个节点</span>
                          <span>·</span>
                          <span>
                            {sub.lastUpdate
                              ? new Date(sub.lastUpdate).toLocaleDateString()
                              : '从未更新'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center space-x-1 ${
                        sub.status === 'success'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : sub.status === 'error'
                          ? 'bg-red-500/10 text-red-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {sub.status === 'success' ? (
                        <>
                          <CheckCircle className="w-2.5 h-2.5" />
                          <span>正常</span>
                        </>
                      ) : sub.status === 'error' ? (
                        <>
                          <AlertCircle className="w-2.5 h-2.5" />
                          <span>异常</span>
                        </>
                      ) : (
                        <span>就绪</span>
                      )}
                    </span>
                  </div>

                  {/* URL */}
                  <p className="text-[11px] font-mono text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg mt-3 truncate">
                    {sub.url}
                  </p>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>
                      {sub.autoUpdate ? `每 ${sub.updateIntervalHours} 小时自动更新` : '手动更新'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleUpdate(sub.id)}
                      disabled={isUpdating}
                      className={`p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                        isUpdating ? 'opacity-50' : ''
                      }`}
                      title="立即更新订阅"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => {
                        setEditingSub(sub);
                        setFormData({
                          name: sub.name,
                          url: sub.url,
                          autoUpdate: sub.autoUpdate,
                          updateIntervalHours: sub.updateIntervalHours || 24,
                        });
                        setIsAdding(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="编辑订阅"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(sub.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="删除订阅"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <Rss className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
            暂无订阅链接
          </h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            添加机场或服务商提供的订阅链接，OwnBox 将自动下载所有节点并定期保持最新。
          </p>
          <div className="pt-2">
            <button
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
            >
              添加第一个订阅
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Subscription Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {editingSub ? '编辑订阅' : '添加新订阅'}
              </h3>
              <button
                onClick={() => setIsAdding(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSub} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  订阅名称
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如: 主力机场订阅"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  订阅链接 (URL)
                </label>
                <input
                  type="url"
                  required
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  开启自动更新
                </span>
                <input
                  type="checkbox"
                  checked={formData.autoUpdate}
                  onChange={(e) => setFormData({ ...formData, autoUpdate: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600"
                />
              </div>

              {formData.autoUpdate && (
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    更新周期 (小时)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={formData.updateIntervalHours}
                    onChange={(e) =>
                      setFormData({ ...formData, updateIntervalHours: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>
              )}

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
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
