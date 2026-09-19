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
│ · 节点管理 (Nodes / Form)    │◄──►│ · Windows 注册表系统代理     │
│ · 订阅中心 (Subscriptions)   │    │ · Wintun 虚拟网卡驱动适配    │
│ · 规则分流与应用分流         │    │ · TCP Ping / 吞吐测速引擎    │
│ · DNS 配置与解析诊断         │    │ · WebDAV 云端备份传输客户端  │
│ · 测速基准中心 (SpeedTest)   │    │ · SQLite 本地状态持久化引擎  │
│ · 实时核心日志监控           │    │ · Windows 系统托盘与快捷菜单 │
│ · 本地/云端备份与数据迁移    │    │ · 进程安全 IPC 通信调度管道  │
│ · 基础与高级参数设置         │    └──────────────┬───────────────┘
│ · 品牌关于与版本检查         │                   │
└──────────────────────────────┘                   ▼
                                    ┌──────────────────────────────┐
                                    │    底层驱动与原生服务层      │
                                    ├──────────────────────────────┤
                                    │ · 官方 Sing-box 1.15.x 核心  │
                                    │ · Wintun 0.14.1 (amd64)      │
                                    │ · WinINet Windows 网络系统   │
                                    └──────────────────────────────┘
```

---

## 二、关键模块技术实现

### 1. 核心生命周期管理器 (`SingBoxManager`)
- 进程隔离：使用子进程形式运行 `sing-box.exe run -c <configPath>`，设置 `windowsHide: true` 避免黑框弹出；
- 预检机制：在调用 `start` 之前，通过 `sing-box.exe check` 进行配置语法自检，防止因语法错误导致崩溃；
- 异常回收：注册 `app.on('before-quit')`、`SIGINT`、`SIGTERM`，采用 Windows `taskkill /F /T /PID` 树状杀死进程，确保退出时不残留孤儿核心。

### 2. Windows 系统代理管理器 (`SystemProxy`)
- 基于原生 Windows 注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`；
- 开启系统代理：写入 `ProxyEnable=1`，`ProxyServer=127.0.0.1:2080`，`ProxyOverride=<local>;localhost;127.*;10.*;192.168.*`；
- 广播生效：通过加载 `wininet.dll` 触发 `InternetSetOption` 选项 37/39，令所有浏览器与 Windows 网络应用即刻生效无需重启；
- 关闭恢复：写入 `ProxyEnable=0` 并再次广播，恢复系统纯净直连。

### 3. TUN 虚拟网卡驱动 (`TunManager`)
- 集成官方微软签名认证的 `wintun.dll` (amd64 驱动)；
- 配合 Sing-box 原生 TUN 入站：
  - Interface Name: `OwnBoxTun`
  - MTU: `9000` 巨帧（优化本地虚拟吞吐率）
  - Stack: `system` / `gvisor`
  - 自动接管默认路由并开启 DNS 劫持防护。

### 4. 数据配置管道 (`ConfigGenerator`)
- 遵循严谨的 OwnBox 数据模型转换流程：
  `OwnBox Model` -> `Validator` -> `Config Generator` -> `Sing-box JSON`
- 确保所有协议字段（VLESS Reality, VMess, Trojan, Shadowsocks, Hysteria 2, TUIC, WireGuard）均完全对齐 Sing-box 1.15 规范。

### 5. 高性能网络测速 (`TcpPing` & `SpeedTestRunner`)
- TCP Ping：基于真实 TCP Socket 进行三次握手，准确捕获网络建立延时（精准至 1ms）；
- 吞吐测速：基于流式数据块分片计算传输速率，支持随时取消与安全超时退出。

### 6. 数据迁移与多端兼容 (`BackupMigrator`)
- 原生格式：`.ownboxbackup` 纯净 JSON 格式；
- 兼容导入：
  - 原 Android 客户端导出的 JSON 备份格式；
  - 桌面版 `.thrbackup` 归档文件；
  - 通用 Base64、Clash YAML、Sing-box JSON 及标准协议链接（`vless://`, `vmess://`, `trojan://`, `ss://`, `hysteria2://`, `tuic://`）。
