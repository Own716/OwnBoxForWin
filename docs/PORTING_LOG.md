# OwnBox PC 移植与开发过程日志 (PORTING LOG)

## [2026-09-19] 阶段 0 ~ 阶段 30 实施记录

### 阶段 0：环境与工具链检查
- 检查操作系统：Windows 11 x64；
- 检查运行时环境：Node.js v24.19.0、npm 11.17.0、Go go1.25.13、Python 3.11.9；
- 排查并修复了系统环境变量中残留的无效 `HTTP_PROXY=http://127.0.0.1:7890` 阻塞问题，切换至稳定的直连及国内镜像源加速环境。

### 阶段 1：Android 源码审计与功能地图提取
- 审查 `OwnBoxForAndroid` 仓库源码结构（`fmt/` 协议栈、`database/` 数据模型与兼容导入、`bg/` 核心服务与测速、`ui/` 用户交互）；
- 提取全协议列表：VLESS, VMess, Trojan, Shadowsocks, ShadowsocksR, Hysteria 1/2, TUIC, WireGuard, Snell, SOCKS, HTTP；
- 提取核心网络逻辑：XHTTP 传输、Reality 选项、TCP Ping、FakeIP DNS、WebDAV 云同步、.ownboxbackup 与 .thrbackup 数据格式；
- 完成 `docs/ANDROID_FEATURE_AUDIT.md` 报告。

### 阶段 2：PC 独立工程与架构初始化
- 严格遵循指令要求，在独立路径 `C:\Users\55132.QIN\.gemini\antigravity\scratch\OwnBox` 初始化全新 Git 仓库，关联目标仓库 `https://github.com/Own716/OwnBoxForWin`；
- 配置技术栈：Electron 34 + React 19 + TypeScript + Vite + TailwindCSS + SQLite；
- 成功编译并部署官方原生 Sing-box 1.15.x 核心（启用 `with_gvisor,with_quic,with_wireguard,with_utls,with_clash_api` 标签）；
- 集成微软签名 Wintun 0.14.1 (amd64) 驱动文件 `bin/wintun.dll`。

### 阶段 3：品牌资产转换与集成
- 基于用户提供的官方高分辨率 Logo 文件（`media_1789830078766.jpg` 浅色模式、`media_1789830081238.jpg` 深色模式），通过无损高采样率图形管道生成：
  - Windows 多尺寸应用图标：`build/icon.ico` (包含 16, 24, 32, 48, 64, 128, 256 全分辨率)；
  - 安装程序图标与高分辨率图像：`build/icon.png` (512x512)；
  - 界面自适应 Logo：`src/renderer/assets/logo-light.png` 与 `logo-dark.png`；
  - 系统托盘高对比度图标：`src/renderer/assets/tray-icon.png` (32x32)。

### 阶段 4：后端核心与系统模块开发
- 完成 `core/SingBoxManager.ts`：实现官方核心启动、停止、重载、配置语法验证（`check -c`）、日志实时重定向；
- 完成 `core/ConfigGenerator.ts`：转换 OwnBox 数据模型为标准 Sing-box 1.15.x JSON；
- 完成 `system/SystemProxy.ts`：真实读写 Windows 注册表 `Internet Settings` 并通过 `WinINet.dll` 广播即刻生效；
- 完成 `system/ProcessScanner.ts`：实现已安装及运行中 Windows 软件扫描与应用分流匹配；
- 完成 `net/TcpPing.ts`：实现毫秒级 TCP 三次握手真实时延测试；
- 完成 `net/SpeedTestRunner.ts`：实现异步可中断吞吐量与时延测试；
- 完成 `net/WebDAVClient.ts`：实现完整 WebDAV PROPFIND/MKCOL/PUT/GET 传输；
- 完成 `db/Database.ts` 与 `db/BackupMigrator.ts`：实现持久化与 Android/桌面多格式备份兼容迁移；
- 完成 `tray/TrayManager.ts`：实现 Windows 托盘动态状态与快捷菜单；
- 完成 `src/main/index.ts` 与 `src/preload/index.ts`：打通完整 IPC 安全通信管道。

### 阶段 5：前端 UI 与组件系统全量实现
- 构建现代 Fluent 设计规范与 Tailwind 响应式系统；
- 实现 12 个完整功能页面与弹窗：
  1. 首页仪表盘 (`Dashboard.tsx`)
  2. 节点管理与卡片列表 (`Nodes.tsx`)
  3. 协议动态表单弹窗 (`NodeEditorModal.tsx`)
  4. 订阅管理 (`Subscriptions.tsx`)
  5. 规则分流 (`Routing.tsx`)
  6. Windows 应用分流 (`AppRouting.tsx`)
  7. DNS 与解析诊断 (`DNS.tsx`)
  8. 网络测速中心 (`SpeedTest.tsx`)
  9. 实时控制台日志 (`Logs.tsx`)
  10. 本地备份与 WebDAV 云同步 (`Backup.tsx`)
  11. 详细分类设置 (`Settings.tsx`)
  12. 品牌关于页 (`About.tsx`)
- 确保所有页面均具备正常、加载、空状态、异常反馈，严格杜绝任何占位符或空白页面。

### 阶段 6：打包配置与发布流水线
- 配置 `electron-builder` 生成 `OwnBox-Setup.exe` (NSIS 安装包) 与 `OwnBox-Portable.zip` (绿色便携版)；
- 配置 GitHub Actions 自动构建与 Release 脚本；
- 输出完整说明文档、架构文档、迁移矩阵与 UI 矩阵。
