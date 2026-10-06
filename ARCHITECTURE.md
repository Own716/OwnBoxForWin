# OwnBox PC 架构设计文档 (ARCHITECTURE)

## 一、系统整体分层架构

```
┌────────────────────────────────────────────────────────┐
│                   OwnBox PC 客户端                     │
└────────────────────────────────────────────────────────┘
                           │
       ┌───────────────────┴───────────────────┐
       ▼                                       ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│  前端渲染层 (Renderer Layer) │    │   系统主进程层 (Main Layer)   │
│  React 19 + Vite + Tailwind  │    │      Node.js + Electron      │
├──────────────────────────────┤    ├──────────────────────────────┤
│ · 状态仪表盘 (Dashboard)     │    │ · Sing-box 核心生命周期控制  │
│ · 节点管理 (Nodes / Form)    │◄──►│ · Clash API 零断流热重载     │
│ · 订阅中心 (Subscriptions)   │    │ · Windows 注册表系统代理     │
│ · 规则分流与应用分流         │    │ · Wintun 虚拟网卡驱动适配    │
│ · DNS 配置与解析诊断         │    │ · 物理隔离网络测速引擎       │
│ · 测速基准中心 (SpeedTest)   │    │ · Windows DPAPI 凭据安全加密 │
│ · 实时核心纯净日志监控       │    │ · Schema v2 原子数据持久化   │
│ · Android 跨端双向无损备份   │    │ · WebDAV 云端备份传输引擎    │
│ · 基础与高级参数设置         │    │ · Windows 进程安全扫描适配器 │
│ · 品牌关于与版本检查         │    │ · 系统托盘与快捷菜单系统     │
└──────────────────────────────┘    └──────────────┬───────────────┘
                                                   │
                                                   ▼
                                    ┌──────────────────────────────┐
                                    │    底层驱动与原生服务层      │
                                    ├──────────────────────────────┤
                                    │ · 官方 Sing-box 1.15.x 核心  │
                                    │ · Wintun 0.14.1 (amd64) 驱动 │
                                    │ · Windows DPAPI / WinINet    │
                                    └──────────────────────────────┘
```

---

## 二、关键模块技术实现

### 1. 核心生命周期与零断流热重载 (`SingBoxManager` & `ProxySelectionService`)
- **零断流热切换**：通过 Sing-box 实验性 Clash API (`PUT 127.0.0.1:9090/proxies/proxy`) 直接热更新活跃节点出站，节点切换耗时低于 15ms，彻底杜绝传统方案重启核心引发的网络中断与页面刷新卡顿；
- **并发互斥控制**：引入异步 Promise 互斥锁 (`runWithMutex`)，杜绝启动与停止生命周期竞态；
- **双重主动就绪探测**：启动后主动发起 TCP Socket 端口连通性及 Clash API HTTP 探活，确保混合入站（Mixed Port）与 API 真正可工作后再将状态置为 `running`；
- **进程树优雅退出**：优先发送 `SIGINT` 信号促使 Sing-box 释放 Wintun 网卡与系统资源；1500ms 超时未退出时通过 Windows `taskkill /F /T /PID` 强制终止，严防后台僵尸残留。

### 2. 数据配置管道 (`ConfigGenerator`)
- 严格遵循 Sing-box 1.15.0 语法规范：
  - **XHTTP / SplitHTTP**：将应用层 `xhttp` 传输严密映射为核心原生支持的 `httpupgrade`（携带 `path`、`host` 及自定义头部参数）；
  - **gRPC 传输**：统一格式化为 `service_name`，剔除无效的 `path` 字段；
  - **Hysteria 1 vs Hysteria 2**：拆分独立适配器，生成各自专属的出站与 TLS 规范；
  - **物理隔离测速**：自动在配置根部注入 `speedtest-in` 回环入站端口与 `speedtest-selector` 策略组，完全独立于用户业务流量。

### 3. 物理隔离网络测速架构 (`SpeedTestRunner` & `TcpPing`)
- **管道隔离**：测速入站端口固定为 `mixedPort + 1`，出站路由绑定 `speedtest-selector`。进行下行测速时仅动态切换该测试策略组，不接触用户主力代理选择器；
- **随时即时取消**：基于 Node.js `AbortController` 机制，支持针对特定节点或全量测速任务随时销毁底层 HTTP Request / TCP Socket；
- **批量高并发 TCP Ping**：采用非阻塞 Socket 并发池（默认 10 并发），50+ 节点延迟测速可在 1~2 秒内快速完成。

### 4. 数据安全与存储层重构 (`Database` & `CredentialSecurity`)
- **硬件级 DPAPI 凭据加密**：基于 Electron `safeStorage` 调用 Windows 数据保护 API（DPAPI），将敏感密码加密为 `enc:dpapi:<base64>` 存储。提供安全 Base64 兜底 (`enc:b64:`) 并向下兼容老版本明文；
- **Schema v2 原子化写入**：
  - 数据写入时先写入 `.tmp` 临时文件，校验成功后原子替换主数据库并更新 `.bak` 镜像备份；
  - 遇到断电导致的文件损坏或 0 字节文件，自动提取 `.bak` 备份自愈，并将损坏副本安全归档至 `.corrupted.<timestamp>`；
- **防抖合并刷盘**：常规保存通过 300ms 防抖合并写入 (`saveDebounced`)，应用退出时调用 `flush()` 保证数据零丢失。

### 5. 跨端无损备份与事务回滚 (`BackupService` & `BackupMigrator`)
- **免修改 Android 架构打通**：在 Windows 端纯原生实现 Android 专用的 `AndroidParcel` 与 `KryoBuffer` 二进制解析器，无缝解析与生成与 Android 完全一致的备份结构；
- **全格式自动嗅探**：通过特征识别引擎，自动辨识 `.ownboxbackup`、Android 备份、桌面 `.thrbackup` 与节点链接；
- **分类按需备份/恢复**：支持针对节点、分流规则、系统设置独立选择性导出与导入；
- **防空清空与事务保护**：导入前自动创建磁盘快照还原点；若导入文件解析为空或发生异常，立即触发安全回滚，严防误清空本地节点与规则。

### 6. Windows 系统代理与所有权追踪 (`SystemProxy`)
- **参数化安全执行**：废除 cmd / 字符串命令拼接，使用安全参数化 `spawn('reg.exe', [...])` 杜绝路径空格异常与命令注入；
- **所有权状态追踪**：维护 `proxy_ownership.json` 记录 OwnBox 开启代理时的原始网络快照与修改状态；
- **异常残留自愈**：软件启动时检测是否存在上次非正常退出的代理遗留，发现即自动清除；退出时根据所有权比对按需还原用户原始代理，避免外部代理被恶意篡改。

### 7. Windows 进程扫描与应用分流 (`ProcessScanner`)
- **非阻塞安全扫描**：通过参数化执行 PowerShell 脚本（`windowsHide: true`）捕获当前桌面运行中的可执行程序，内设 4 秒超时熔断；
- **权限安全容错**：处理系统保护进程（如 csrss / System）的权限拒绝异常，防止因单一行程失败导致整体中断；
- **通用进程名路由**：提取可执行程序基准文件名，统一格式化为 Sing-box 的 `process_name: [procName]`，彻底解决不同盘符及安装路径导致的匹配失败。

### 8. 端到端纯净日志系统 (`LogManager`)
- **ANSI 控制符清洗**：实时捕获并正则剥离 Sing-box 核心的原生 ANSI 彩色代码（`\x1b[...]`），杜绝终端控制符乱码与文件膨胀；
- **双通道广播机制**：同时广播 `core:log` 与 `log:added`，前端通过 Preload 多路复用订阅；
- **非阻塞队列与事件循环保护**：日志写入采用异步队列缓冲刷盘，定时器显式标记 `.unref()`，保证宿主进程能够平稳退出。
