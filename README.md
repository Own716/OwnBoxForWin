# OwnBox (Windows PC 客户端)

<p align="center">
  <img src="src/renderer/assets/logo-light.png" width="128" height="128" alt="OwnBox Logo">
  <br>
  <b>基于 Sing-box 官方原生核心打造的现代化 Windows 通用网络代理工具链与网络调试客户端</b>
  <br>
  <b>A Modern Universal Proxy Toolchain & Network Debugging Client for Windows PC</b>
</p>

<p align="center">
  <a href="https://github.com/Own716/OwnBoxForWin/releases"><img src="https://img.shields.io/badge/Release-v1.0.0-blue.svg?style=flat-square" alt="Version"></a>
  <a href="https://www.microsoft.com/windows"><img src="https://img.shields.io/badge/Platform-Windows%20x64-brightgreen.svg?style=flat-square" alt="Platform"></a>
  <a href="https://www.gnu.org/licenses/gpl-3.0"><img src="https://img.shields.io/badge/License-GPL--3.0-orange.svg?style=flat-square" alt="License"></a>
  <a href="https://t.me/OwnBoxs"><img src="https://img.shields.io/badge/Telegram-@OwnBoxs-2CA5E0.svg?logo=telegram&style=flat-square" alt="Telegram"></a>
</p>

---

## 📖 项目介绍 / Introduction

**OwnBox for Windows** 是专门面向 PC 桌面环境深度重构的原生通用网络代理与网络调试工具。以 Android 版 OwnBox 产品特性为功能基准，针对桌面大屏操作与 Windows 平台特性进行了全新原生架构设计。

软件基于官方原生 **Sing-box 1.15.x** 核心构建，原生集成微软签名 **Wintun 0.14.1** 网卡驱动，全面支持 VLESS（含 Reality 伪装与 XHTTP / SplitHTTP 传输）、VMess、Trojan、Shadowsocks、Hysteria 2、TUIC、WireGuard 等全协议栈，提供毫秒级 TCP 握手测速、Windows 进程应用级分流、防污染 FakeIP DNS 解析、WebDAV 云端多端同步与系统托盘快捷控制。

---

## 🚀 核心特性 / Features

* **现代桌面原生 UI**：无边框 Fluent 玻璃拟态设计，系统浅色 / 深色主题无缝切换，自适应官方深浅双色 Logo；
* **官方原生代理核心**：基于最新官方 Sing-box 原生二进制，集成 gVisor 高性能网络协议栈；
* **全协议栈与最新传输**：
  * 支持 **VLESS** (支持 `xtls-rprx-vision` 流控、Reality 伪装、gRPC / WebSocket 以及最新 **XHTTP** 传输)；
  * 支持 **VMess**, **Trojan**, **Shadowsocks**, **ShadowsocksR**；
  * 支持 **Hysteria 1 / 2** (含 Salamander 混淆)；
  * 支持 **TUIC v5** (原生 QUIC 拥塞控制)；
  * 支持 **WireGuard**、**Snell**、**SOCKS5**、**HTTP**；
* **双模式代理接管**：
  * **Windows 系统代理**：真实操纵注册表与 WinINet API，智能绕过局域网地址，即时生效；
  * **TUN 虚拟网卡**：基于 Wintun 0.14.1 驱动，全局透明接管所有软件网络流量，支持 DNS 劫持防护；
* **Windows 应用分流**：支持扫描本机运行中的应用进程，精准针对可执行程序 (.exe) 指定走代理、直连或阻止连接；
* **真实高精度网络测速**：
  * 原生 TCP Ping 三次握手精确时延检测；
  * HTTP URL 延迟测试与真实带宽吞吐测速；
* **安全防污染 DNS**：
  * 支持标准模式与 **FakeIP** (`198.18.0.0/15`) 极速首包响应模式；
  * 支持国内直连 DNS 与国外 DoH 加密代理 DNS 智能路由；
* **多端联动与备份**：
  * 引入 `.ownboxbackup` 纯净归档格式；
  * 完美向下兼容导入 Android 版 JSON 备份及桌面版 `.thrbackup` 归档；
  * 支持 WebDAV 云备份与双向同步；
* **系统托盘与便捷交互**：系统托盘常驻，支持动态连接状态显示与一键切换节点。

---

## 📥 发行版下载 / Download

请前往 GitHub Releases 官方发布页面获取经过编译的 Windows 正式版本：

👉 **[前往 GitHub Releases 官方发布页面](https://github.com/Own716/OwnBoxForWin/releases)**

| 安装包类型 | 文件名 | 适用场景 |
| :--- | :--- | :--- |
| **Windows 安装版** | `OwnBox-Setup.exe` | 推荐普通用户使用，自动创建开始菜单与桌面快捷方式，支持卸载 |
| **便携绿色版** | `OwnBox-Portable.zip` | 解压即用，适合存放在移动硬盘中随时携带使用 |

---

## 🛠 本地开发与构建 / Development & Build

### 依赖环境
* Node.js >= 20.0
* npm >= 10.0
* Go >= 1.22 (如需自行编译 Sing-box 核心)

### 编译步骤
```bash
# 1. 克隆代码仓库
git clone https://github.com/Own716/OwnBoxForWin.git
cd OwnBoxForWin

# 2. 安装前端与桌面依赖
npm install

# 3. 运行本地开发环境
npm run dev

# 4. 构建前端与主进程
npm run build

# 5. 打包生成 Windows 安装程序与绿色压缩包
npm run dist
```
构建产物将保存在 `release/` 目录中：
- `release/OwnBox-Setup.exe`
- `release/OwnBox-1.0.0-x64.zip`

---

## 📄 开源许可证 / License

本项目基于 [GNU General Public License v3.0 (GPL-3.0)](LICENSE) 协议开源。
