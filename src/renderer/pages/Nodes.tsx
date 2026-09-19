import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Search,
  Zap,
  Star,
  Edit2,
  Trash2,
  Check,
  Server,
  ArrowUpDown,
  Download,
  Copy,
  RotateCcw,
  ChevronDown,
  Filter,
  CheckCircle2,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { ProxyNode, Subscription } from '../../types';
import { NodeEditorModal } from './NodeEditorModal';

interface NodesProps {
  nodes: ProxyNode[];
  activeNodeId: string;
  onSelectNode: (id: string) => void;
  onSaveNodes: (nodes: ProxyNode[]) => void;
  subscriptions: Subscription[];
}

export interface RegionInfo {
  id: string;
  name: string;
  flag: string;
}

export function detectRegion(nodeName: string, server: string = ''): RegionInfo {
  const text = (nodeName + ' ' + server).toLowerCase();

  if (/hong\s*kong|hk|香港|港/i.test(text)) {
    return { id: 'hk', name: '香港', flag: '🇭🇰' };
  }
  if (/japan|jp|日本|东京|大阪/i.test(text)) {
    return { id: 'jp', name: '日本', flag: '🇯🇵' };
  }
  if (/singapore|sg|新加坡|狮城/i.test(text)) {
    return { id: 'sg', name: '新加坡', flag: '🇸🇬' };
  }
  if (/united\s*states|usa?|美|美国|洛杉矶|硅谷|西雅图|纽约|波特兰|达拉斯/i.test(text)) {
    return { id: 'us', name: '美国', flag: '🇺🇸' };
  }
  if (/taiwan|tw|台湾|台北|台中/i.test(text)) {
    return { id: 'tw', name: '台湾', flag: '🇹🇼' };
  }
  if (/korea|kr|韩国|首尔/i.test(text)) {
    return { id: 'kr', name: '韩国', flag: '🇰🇷' };
  }
  if (/united\s*kingdom|uk|gb|英国|伦敦/i.test(text)) {
    return { id: 'uk', name: '英国', flag: '🇬🇧' };
  }
  if (/germany|de|德国|法兰克福/i.test(text)) {
    return { id: 'de', name: '德国', flag: '🇩🇪' };
  }
  if (/canada|ca|加拿大/i.test(text)) {
    return { id: 'ca', name: '加拿大', flag: '🇨🇦' };
  }
  if (/australia|au|澳大利亚|悉尼/i.test(text)) {
    return { id: 'au', name: '澳大利亚', flag: '🇦🇺' };
  }
  if (/russia|ru|俄罗斯|莫斯科/i.test(text)) {
    return { id: 'ru', name: '俄罗斯', flag: '🇷🇺' };
  }
  return { id: 'other', name: '其它', flag: '🌐' };
}

export const Nodes: React.FC<NodesProps> = ({
  nodes,
  activeNodeId,
  onSelectNode,
  onSaveNodes,
  subscriptions,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all'); // subscription group
  const [selectedRegion, setSelectedRegion] = useState('all'); // country / region
  const [sortBy, setSortByState] = useState<'default' | 'ping-asc' | 'ping-desc' | 'name-asc' | 'type' | 'starred'>(() => {
    const saved = localStorage.getItem('ownbox_node_sort_by');
    if (saved && ['default', 'ping-asc', 'ping-desc', 'name-asc', 'type', 'starred'].includes(saved)) {
      return saved as any;
    }
    return 'default';
  });

  const setSortBy = (val: 'default' | 'ping-asc' | 'ping-desc' | 'name-asc' | 'type' | 'starred') => {
    setSortByState(val);
    try {
      localStorage.setItem('ownbox_node_sort_by', val);
    } catch {
      // ignore
    }
  };

  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [editingNode, setEditingNode] = useState<ProxyNode | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [isPinging, setIsPinging] = useState(false);
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);

  const sortDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Subscription Groups mapping
  // Map internal groupId to human-readable subscription names
  const subGroupMap = new Map<string, string>();
  for (const s of subscriptions) {
    subGroupMap.set(s.id, s.name);
  }

  // Get distinct group IDs present in nodes
  const rawGroupIds = Array.from(new Set(nodes.map((n) => n.groupId || 'default')));
  const subGroups = [
    { id: 'all', name: '全部节点', count: nodes.length },
    ...rawGroupIds.map((gid) => {
      const name = subGroupMap.get(gid) || (gid === 'default' ? '自建/未分组' : gid);
      const count = nodes.filter((n) => (n.groupId || 'default') === gid).length;
      return { id: gid, name, count };
    }),
  ];

  // 2. Detect regions across nodes in the currently selected subscription group
  const nodesInCurrentSub = nodes.filter((n) =>
    selectedGroup === 'all' ? true : (n.groupId || 'default') === selectedGroup
  );

  const regionCounts = new Map<string, { count: number; name: string; flag: string }>();
  for (const n of nodesInCurrentSub) {
    const reg = detectRegion(n.name, n.server);
    const existing = regionCounts.get(reg.id);
    if (existing) {
      existing.count += 1;
    } else {
      regionCounts.set(reg.id, { count: 1, name: reg.name, flag: reg.flag });
    }
  }

  // Region tabs
  const regionTabs = [
    { id: 'all', name: '全部', flag: '🌐', count: nodesInCurrentSub.length },
    ...Array.from(regionCounts.entries()).map(([id, info]) => ({
      id,
      name: info.name,
      flag: info.flag,
      count: info.count,
    })),
  ];

  // 3. Filter & Sort
  const baseFiltered = nodes.filter((n) => {
    // Search
    const matchSearch =
      n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.server.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.type.toLowerCase().includes(searchQuery.toLowerCase());

    // Subscription Group filter
    const matchGroup = selectedGroup === 'all' || (n.groupId || 'default') === selectedGroup;

    // Region filter
    const reg = detectRegion(n.name, n.server);
    const matchRegion = selectedRegion === 'all' || reg.id === selectedRegion;

    return matchSearch && matchGroup && matchRegion;
  });

  const filteredNodes = sortBy === 'default'
    ? baseFiltered
    : [...baseFiltered].sort((a, b) => {
        if (sortBy === 'ping-asc') {
          const pingA = a.ping && a.ping > 0 ? a.ping : 999999;
          const pingB = b.ping && b.ping > 0 ? b.ping : 999999;
          return pingA - pingB;
        }
        if (sortBy === 'ping-desc') {
          const pingA = a.ping && a.ping > 0 ? a.ping : -1;
          const pingB = b.ping && b.ping > 0 ? b.ping : -1;
          return pingB - pingA;
        }
        if (sortBy === 'name-asc') {
          return a.name.localeCompare(b.name, 'zh-Hans-CN');
        }
        if (sortBy === 'type') {
          return a.type.localeCompare(b.type);
        }
        if (sortBy === 'starred') {
          const starA = a.starred ? 1 : 0;
          const starB = b.starred ? 1 : 0;
          return starB - starA;
        }
        return 0;
      });

  // Ping actions
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

  const handleClearPings = (e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = nodes.map((n) => ({ ...n, ping: undefined }));
    onSaveNodes(updated);
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

  const handleCopyLink = (node: ProxyNode, e: React.MouseEvent) => {
    e.stopPropagation();
    let url = '';
    const nameEnc = encodeURIComponent(node.name);

    if (node.type === 'vless') {
      const sec = node.reality ? 'reality' : node.tls ? 'tls' : 'none';
      const fp = node.fingerprint || 'chrome';
      const pbk = node.publicKey ? `&pbk=${node.publicKey}` : '';
      const sid = node.shortId ? `&sid=${node.shortId}` : '';
      const sni = node.sni ? `&sni=${node.sni}` : '';
      url = `vless://${node.uuid}@${node.server}:${node.port}?security=${sec}&fp=${fp}${pbk}${sid}${sni}#${nameEnc}`;
    } else if (node.type === 'vmess') {
      const vmessObj = {
        v: '2',
        ps: node.name,
        add: node.server,
        port: node.port,
        id: node.uuid,
        aid: node.alterId || 0,
        scy: node.method || 'auto',
        net: node.transport || 'tcp',
        type: 'none',
        tls: node.tls ? 'tls' : '',
        sni: node.sni || '',
      };
      url = `vmess://${btoa(JSON.stringify(vmessObj))}`;
    } else if (node.type === 'trojan') {
      url = `trojan://${node.password}@${node.server}:${node.port}?sni=${node.sni || node.server}#${nameEnc}`;
    } else if (node.type === 'shadowsocks') {
      const userinfo = btoa(`${node.method}:${node.password}`);
      url = `ss://${userinfo}@${node.server}:${node.port}#${nameEnc}`;
    } else if (node.type === 'hysteria2') {
      url = `hysteria2://${node.password}@${node.server}:${node.port}?sni=${node.sni || node.server}#${nameEnc}`;
    } else if (node.type === 'tuic') {
      url = `tuic://${node.uuid}:${node.password}@${node.server}:${node.port}?sni=${node.sni || node.server}#${nameEnc}`;
    }

    if (url) {
      navigator.clipboard.writeText(url);
      setCopiedNodeId(node.id);
      setTimeout(() => setCopiedNodeId(null), 1500);
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

  const sortLabels = {
    'default': '原始顺序',
    'ping-asc': '以延迟 (升序)',
    'ping-desc': '以延迟 (降序)',
    'name-asc': '以名称 (A-Z)',
    'type': '以协议排序',
    'starred': '以收藏优先',
  };

  return (
    <div className="space-y-4">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
        {/* Search Input */}
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

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {/* Sort Dropdown Window */}
          <div className="relative" ref={sortDropdownRef}>
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center space-x-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
              title="选择排序方式"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-blue-500" />
              <span>排序: {sortLabels[sortBy]}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu Window */}
            {showSortDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl py-1.5 z-40 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  选择排序方式
                </div>
                {[
                  { id: 'default', label: '默认原始顺序' },
                  { id: 'ping-asc', label: '以延迟排序 (低到高)' },
                  { id: 'ping-desc', label: '以延迟排序 (高到低)' },
                  { id: 'name-asc', label: '以名称排序 (A - Z)' },
                  { id: 'type', label: '以协议类型排序' },
                  { id: 'starred', label: '以星标收藏置顶' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSortBy(item.id as any);
                      setShowSortDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                      sortBy === item.id ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>{item.label}</span>
                    {sortBy === item.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Batch Ping Button */}
          <button
            onClick={handleBatchPing}
            disabled={isPinging}
            className={`px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center space-x-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
              isPinging ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            title="对当前显示节点进行全量 TCP Ping 延迟测速"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-500 ${isPinging ? 'animate-pulse' : ''}`} />
            <span>{isPinging ? '测速中...' : '全部测速'}</span>
          </button>

          {/* Reset Ping Button */}
          <button
            onClick={handleClearPings}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            title="清空延迟结果"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Import Links */}
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center space-x-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
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

      {/* 2. Dual-Level Filter Navigation Bar */}
      <div className="space-y-2">
        {/* Level 1: Subscription Groups Bar */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] font-medium text-slate-400 px-1 shrink-0 flex items-center space-x-1">
            <Server className="w-3 h-3" />
            <span>订阅分组:</span>
          </span>
          {subGroups.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                setSelectedGroup(g.id);
                setSelectedRegion('all'); // reset region on group switch
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all shrink-0 flex items-center space-x-1.5 ${
                selectedGroup === g.id
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span>{g.name}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                selectedGroup === g.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}>
                {g.count}
              </span>
            </button>
          ))}
        </div>

        {/* Level 2: Geographic Region Filter Bar */}
        {regionTabs.length > 1 && (
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-medium text-slate-400 px-1 shrink-0 flex items-center space-x-1">
              <Filter className="w-3 h-3" />
              <span>地域筛选:</span>
            </span>
            {regionTabs.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedRegion(r.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 flex items-center space-x-1.5 ${
                  selectedRegion === r.id
                    ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold shadow-sm'
                    : 'bg-slate-100/70 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <span>{r.flag}</span>
                <span>{r.name}</span>
                <span className="text-[10px] opacity-70">({r.count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. Node Cards Grid */}
      {filteredNodes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredNodes.map((node) => {
            const isSelected = node.id === activeNodeId;
            const hasPing = node.ping !== undefined && node.ping > 0;
            const isTimeout = node.ping === -1;
            const region = detectRegion(node.name, node.server);

            return (
              <div
                key={node.id}
                onClick={() => onSelectNode(node.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer relative group flex flex-col justify-between ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/25 shadow-sm shadow-blue-500/10 ring-1 ring-blue-500/30'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm'
                }`}
              >
                <div>
                  {/* Top row: Type badge, Country Flag, Name, Star */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                        {node.type}
                      </span>
                      <span className="text-sm shrink-0" title={region.name}>
                        {region.flag}
                      </span>
                      <h4 className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate flex-1">
                        {node.name}
                      </h4>
                    </div>

                    <button
                      onClick={(e) => handleToggleStar(node.id, e)}
                      className={`p-1 rounded-md transition-colors shrink-0 ${
                        node.starred
                          ? 'text-amber-500'
                          : 'text-slate-300 dark:text-slate-600 hover:text-slate-400'
                      }`}
                      title={node.starred ? '取消收藏' : '收藏此节点'}
                    >
                      <Star className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>

                  {/* Server & Port */}
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 font-mono truncate">
                    {node.server}:{node.port}
                  </p>
                </div>

                {/* Bottom Row: Ping Badge, Active Indicator, Actions */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-center space-x-2">
                    {/* Ping button / badge */}
                    <button
                      onClick={(e) => handlePingNode(node, e)}
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center space-x-1 transition-colors ${
                        hasPing
                          ? node.ping! < 250
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold'
                            : node.ping! < 450
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-medium'
                            : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 font-semibold'
                          : isTimeout
                          ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 font-semibold'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                      title="点击单节点测速"
                    >
                      <Zap className="w-2.5 h-2.5" />
                      <span>{hasPing ? `${node.ping} ms` : isTimeout ? '超时' : '测速'}</span>
                    </button>

                    {isSelected && (
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center space-x-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>已连接使用</span>
                      </span>
                    )}
                  </div>

                  {/* Action buttons (Copy link, Edit, Delete) */}
                  <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleCopyLink(node, e)}
                      className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="复制节点分享链接"
                    >
                      {copiedNodeId === node.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingNode(node);
                      }}
                      className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="编辑节点配置"
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
            {nodes.length === 0
              ? '当前尚未导入任何节点，您可以前往“订阅管理”导入机场订阅，或点击下方按钮手动添加。'
              : '当前筛选条件下没有找到节点，请尝试切换地域分组或清空搜索关键词。'}
          </p>
          <div className="pt-2 flex justify-center space-x-3">
            <button
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 shadow-sm shadow-blue-500/20"
            >
              手动添加节点
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-100"
            >
              从剪贴板导入链接
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
