# OwnBox PC 更新日志 (CHANGELOG)

## [1.0.0] - 2026-09-19 (正式发布版)

### ✨ 全新特性与架构
- **独立全新重写**：基于 Android 版 OwnBox 产品特性全新打造的原生 Windows 桌面客户端，全面采用 Electron 34 + React 19 + TypeScript + Vite + TailwindCSS 现代化技术栈；
- **官方原生 Sing-box 核心集成**：内置 Sing-box 官方 1.15.x 核心（启用 gVisor、QUIC、WireGuard、uTLS、Clash API），稳定低耗；
- **全协议栈与最新传输支持**：
  - 支持 VLESS（含 Reality 伪装与最新 XHTTP / SplitHTTP 传输协议）；
  - 支持 VMess, Trojan, Shadowsocks, ShadowsocksR, Hysteria, Hysteria 2, TUIC, WireGuard, Snell, SOCKS5, HTTP；
- **真实系统网络代理能力**：
  - Windows 系统代理：基于注册表与 WinINet API 原生实现无缝代理开启、局域网绕过与恢复；
  - Windows TUN 模式：原生集成微软认证签名 Wintun 0.14.1 (amd64) 驱动，实现 L3 级别全局透明代理；
- **Windows 应用分流**：支持一键扫描当前运行中进程及已安装应用，支持针对特定程序独立分配走代理、直连或阻止连接；
- **高精度网络测速**：
  - 真实高精度 TCP 三次握手延迟测试；
  - 动态 URL 延迟与下行/上行带宽吞吐实时测速；
- **安全防污染 DNS**：
  - 支持标准真实 IP 模式与 FakeIP (`198.18.0.0/15`) 双模式；
  - 智能分流解析：国内直连 223.5.5.5，国外加密走 DoH；
- **跨平台多端数据互通**：
  - 引入 `.ownboxbackup` 纯净归档格式；
  - 无缝兼容导入 Android 导出备份与桌面版 `.thrbackup` 归档；
  - 内置 WebDAV 云端备份与双向同步；
- **Windows 系统托盘与快捷控制**：集成托盘常驻、连接状态指示、一键切换节点与代理模式切换；
- **官方品牌自适应**：无损适配官方深浅双色 Logo，提供高品质多尺寸 Windows 图标 (`.ico` / `.png`)。
