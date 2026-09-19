import React, { useState } from 'react';
import {
  Plus,
  Search,
  Zap,
  Star,
  Edit2,
  Trash2,
  Share2,
  Check,
  Server,
  ArrowUpDown,
  Download,
  Copy,
} from 'lucide-react';
import { ProxyNode } from '../../types';
import { NodeEditorModal } from './NodeEditorModal';

interface NodesProps {
  nodes: ProxyNode[];
  activeNodeId: string;
  onSelectNode: (id: string) => void;
  onSaveNodes: (nodes: ProxyNode[]) => void;
}

export const Nodes: React.FC<NodesProps> = ({
  nodes,
  activeNodeId,
  onSelectNode,
  onSaveNodes,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [sortBy, setSortBy] = useState<'ping' | 'name' | 'type'>('ping');
  const [editingNode, setEditingNode] = useState<ProxyNode | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [isPinging, setIsPinging] = useState(false);

  // Extract unique groups
  const groups = ['all', ...Array.from(new Set(nodes.map((n) => n.groupId || 'default')))];

  // Filter & Sort
  const filteredNodes = nodes
    .filter((n) => {
      const matchSearch =
        n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.server.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchGroup = selectedGroup === 'all' || (n.groupId || 'default') === selectedGroup;
      return matchSearch && matchGroup;
    })
    .sort((a, b) => {
      if (sortBy === 'ping') {
        const pingA = a.ping && a.ping > 0 ? a.ping : 99999;
        const pingB = b.ping && b.ping > 0 ? b.ping : 99999;
        return pingA - pingB;
      }
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return a.type.localeCompare(b.type);
    });

  const handlePingNode = async (node: ProxyNode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) return;
    const res = await window.electronAPI.nodes.ping(node.server, node.port);
    const updated = nodes.map((n) => (n.id === node.id ? { ...n, ping: res.time } : n));
    onSaveNodes(updated);
  };

  const handleBatchPing = async () => {
    if (!window.electronAPI || isPinging) return;
    setIsPinging(true);
    const list = filteredNodes.map((n) => ({ id: n.id, host: n.server, port: n.port }));
    const resultsMap = await window.electronAPI.nodes.batchPing(list);
    const updated = nodes.map((n) => {
      const res = resultsMap.get(n.id);
      return res ? { ...n, ping: res.time } : n;
    });
    onSaveNodes(updated);
    setIsPinging(false);
  };

  const handleToggleStar = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = nodes.map((n) => (n.id === nodeId ? { ...n, starred: !n.starred } : n));
    onSaveNodes(updated);
  };

  const handleDeleteNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除此节点吗？')) {
      const updated = nodes.filter((n) => n.id !== nodeId);
      onSaveNodes(updated);
    }
  };

  const handleImportLinks = async () => {
    if (!importText.trim() || !window.electronAPI) return;
    const imported = await window.electronAPI.backup.importLinks(importText);
    if (imported && imported.length > 0) {
      alert(`成功导入 ${imported.length} 个节点！`);
      setImportText('');
      setShowImportModal(false);
      const all = await window.electronAPI.nodes.getAll();
      onSaveNodes(all);
    } else {
      alert('未识别到有效的节点链接');
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索节点名称、服务器或协议..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          {/* Sort Switch */}
          <button
            onClick={() =>
              setSortBy(sortBy === 'ping' ? 'name' : sortBy === 'name' ? 'type' : 'ping')
            }
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center space-x-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            title="切换排序"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <span>
              排序: {sortBy === 'ping' ? '延迟' : sortBy === 'name' ? '名称' : '协议'}
            </span>
          </button>

          {/* Batch Ping */}
          <button
            onClick={handleBatchPing}
            disabled={isPinging}
            className={`px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center space-x-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
              isPinging ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            <Zap className={`w-3.5 h-3.5 text-amber-500 ${isPinging ? 'animate-spin' : ''}`} />
            <span>{isPinging ? '测速中...' : '全部测速'}</span>
          </button>

          {/* Import Links */}
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center space-x-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-500" />
            <span>导入链接</span>
          </button>

          {/* Add Node */}
          <button
            onClick={() => {
              setEditingNode(null);
              setIsAdding(true);
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center space-x-1.5 shadow-sm shadow-blue-500/25 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>添加节点</span>
          </button>
        </div>
      </div>

      {/* 2. Group Tabs */}
      {groups.length > 1 && (
        <div className="flex items-center space-x-2 overflow-x-auto pb-1">
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGroup(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                selectedGroup === g
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {g === 'all' ? '全部节点' : g}
            </button>
          ))}
        </div>
      )}

      {/* 3. Node Cards Grid */}
      {filteredNodes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredNodes.map((node) => {
            const isSelected = node.id === activeNodeId;
            const hasPing = node.ping !== undefined && node.ping > 0;
            const isTimeout = node.ping === -1;

            return (
              <div
                key={node.id}
                onClick={() => onSelectNode(node.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer relative group flex flex-col justify-between ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 shadow-sm shadow-blue-500/10'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm'
                }`}
              >
                <div>
                  {/* Top row: Type badge, Name, Star */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        {node.type}
                      </span>
                      <h4 className="font-semibold text-xs text-slate-900 dark:text-slate-100 line-clamp-1">
                        {node.name}
                      </h4>
                    </div>

                    <button
                      onClick={(e) => handleToggleStar(node.id, e)}
                      className={`p-1 rounded-md transition-colors ${
                        node.starred
                          ? 'text-amber-500'
                          : 'text-slate-300 dark:text-slate-600 hover:text-slate-400'
                      }`}
                    >
                      <Star className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>

                  {/* Server & Port */}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-mono truncate">
                    {node.server}:{node.port}
                  </p>
                </div>

                {/* Bottom Row: Ping Badge, Active Indicator, Actions */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-center space-x-2">
                    {/* Ping status */}
                    <button
                      onClick={(e) => handlePingNode(node, e)}
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center space-x-1 transition-colors ${
                        hasPing
                          ? node.ping! < 100
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : node.ping! < 200
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                          : isTimeout
                          ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      <Zap className="w-2.5 h-2.5" />
                      <span>{hasPing ? `${node.ping} ms` : isTimeout ? '超时' : '测速'}</span>
                    </button>

                    {isSelected && (
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center space-x-0.5">
                        <Check className="w-3 h-3" />
                        <span>已选</span>
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingNode(node);
                      }}
                      className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="编辑节点"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteNode(node.id, e)}
                      className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="删除节点"
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
        /* Empty State */
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <Server className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
            暂无匹配的代理节点
          </h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            您可以点击“添加节点”手动配置，或通过“导入链接”批量导入 VLESS、VMess、Trojan、Shadowsocks 等节点。
          </p>
          <div className="pt-2 flex justify-center space-x-3">
            <button
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
            >
              添加第一个节点
            </button>
          </div>
        </div>
      )}

      {/* Node Editor Modal */}
      {(isAdding || editingNode) && (
        <NodeEditorModal
          node={editingNode}
          onClose={() => {
            setIsAdding(false);
            setEditingNode(null);
          }}
          onSave={(saved) => {
            if (editingNode) {
              const updated = nodes.map((n) => (n.id === saved.id ? saved : n));
              onSaveNodes(updated);
            } else {
              onSaveNodes([...nodes, saved]);
            }
          }}
        />
      )}

      {/* Import Links Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              批量导入节点链接
            </h3>
            <p className="text-xs text-slate-400">
              支持直接粘贴 vless://, vmess://, trojan://, ss://, hy2://, tuic:// 等格式，一行一个。
            </p>
            <textarea
              rows={6}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="vless://...&#10;vmess://...&#10;hysteria2://..."
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-mono focus:outline-none focus:border-blue-500"
            />
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                取消
              </button>
              <button
                onClick={handleImportLinks}
                className="px-5 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
              >
                开始解析并导入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
