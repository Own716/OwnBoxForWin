# OwnBox Android 源码功能全量审计报告 (ANDROID FEATURE AUDIT)

本报告基于对原 Android 仓库源码 (`https://github.com/Own716/OwnBoxForAndroid`) 的全量代码审计，梳理产品功能、协议支持、核心逻辑及业务数据结构，作为 PC 端原生独立重写的设计基准。

---

## 一、协议与代理能力审计

原 Android 客户端基于 Sing-box 深度定制，在 `io.nekohasekai.sagernet.fmt` 及 `moe.matsuri.nb4a.proxy` 中支持如下全量协议：

| 协议 | 审计源码位置 | 关键参数与特性 | PC 端对应实现 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **VLESS** | `fmt/v2ray/StandardV2RayBean.java` | UUID, Flow (`xtls-rprx-vision`), TLS, Reality, XHTTP, gRPC, WS | `core/ConfigGenerator.ts` 原生构造 | DONE |
| **VMess** | `fmt/v2ray/VMessBean.java` | UUID, AlterId, Security (auto/chacha/aes), WS/gRPC | `core/ConfigGenerator.ts` 原生构造 | DONE |
| **Trojan** | `fmt/trojan/TrojanBean.java` | Password, SNI, ALPN, TLS | `core/ConfigGenerator.ts` 原生构造 | DONE |
| **Shadowsocks** | `fmt/shadowsocks/ShadowsocksBean.java` | Server, Port, Method, Password, Plugin (obfs/v2ray) | `core/ConfigGenerator.ts` 原生构造 | DONE |
| **ShadowsocksR** | `fmt/shadowsocksr/ShadowsocksRBean.java` | Server, Port, Method, Password, Obfs, Protocol | `core/ConfigGenerator.ts` 原生构造 | DONE |
| **Hysteria 1/2** | `fmt/hysteria/HysteriaBean.java` | Password/Auth, Up/Down Mbps, Obfs Salamander, TLS | `core/ConfigGenerator.ts` 原生构造 | DONE |
| **TUIC** | `fmt/tuic/TuicBean.java` | UUID, Password, Congestion Control (BBR/Cubic), UDP Relay | `core/ConfigGenerator.ts` 原生构造 | DONE |
| **WireGuard** | `fmt/wireguard/WireGuardBean.java` | PrivateKey, Peer PublicKey, Local Address, MTU, Reserved | `core/ConfigGenerator.ts` 原生构造 | DONE |
| **Snell** | `fmt/snell/SnellBean.java` | PSK, Version, Obfs | `core/ConfigGenerator.ts` 原生构造 | DONE |
| **SOCKS5 / HTTP** | `fmt/socks/SOCKSBean.java`, `fmt/http/HttpBean.java` | Auth User/Pass | `core/ConfigGenerator.ts` 原生构造 | DONE |

---

## 二、底层核心与系统代理能力审计

1. **Sing-box 核心生命周期管理**：
   - Android 实现：`bg/BaseService.kt`、`bg/GuardedProcessPool.kt` 通过 JNI / Gomobile 封装 `libcore` 控制核心。
   - PC 原生实现：`core/SingBoxManager.ts` 通过官方原生 `sing-box.exe` 独立子进程管理，集成启动、停止、重载、配置语法检查（`sing-box check`）、日志管道重定向与退出回收。

2. **系统代理接管**：
   - Android 实现：VPNService 虚拟接口。
   - PC 原生实现：
     - 系统代理：`system/SystemProxy.ts` 读写 Windows 注册表 `Internet Settings` 并通过 WinINet API 广播即时生效。
     - TUN 虚拟网卡：集成官方 `wintun.dll` (amd64)，配合 Sing-box TUN 入站实现全局 L3 流量透明拦截。

3. **路由分流与规则体系**：
   - 规则匹配类型：Domain (full, suffix, keyword, regex), IP CIDR, GeoIP, GeoSite, Port, Source Port, Protocol, Process Name。
   - PC 独占扩展：支持 Windows 可执行文件完整路径 (`process_path`) 与进程名 (`process_name`) 双重匹配。

4. **DNS 架构**：
   - 支持 Standard（真实 IP 返回）与 FakeIP（`198.18.0.0/15` 虚拟网段）双模式。
   - 支持国内直连 DNS（223.5.5.5 等）与国外加密安全 DNS（1.1.1.1 DoH）智能分流。

---

## 三、网络测速与工具链审计

1. **TCP Ping**：
   - Android 实现：基于底层 Socket 握手测试连接时延。
   - PC 原生实现：`net/TcpPing.ts` 高精度真实三次握手时延测量，精准识别 `success`, `timeout`, `refused`, `dns_error`。
2. **下载与吞吐测速**：
   - Android 实现：`SpeedTestRunner.kt`。
   - PC 原生实现：`net/SpeedTestRunner.ts`，支持指定 URL 测速、限时统计、中断取消与测速历史记录。

---

## 四、备份与云端存储审计

1. **数据模型与格式**：
   - Android 格式：`utils/BackupHelper.kt` 导出的包含 `proxies`, `groups`, `rules`, `settings` 的 JSON。
   - 桌面历史格式：`ThroneDesktopBackupImporter.kt` 解析的 `.thrbackup` (QDataStream + SQLite)。
   - PC 原生格式：`.ownboxbackup` 纯净 JSON 架构，内含 `schema_version`, `nodes`, `subscriptions`, `routing`, `dns`, `settings`, `webdav`。
2. **WebDAV 云同步**：
   - 支持 PROPFIND 路径探测、MKCOL 自动创建远程 `OwnBox` 目录、PUT 覆盖备份、GET 拉取恢复。PC 端基于 `net/WebDAVClient.ts` 原生实现。

---

## 五、UI 与产品交互审计

Android 版底部导航和手机弹窗无法直接照搬到 PC。PC 版按照专业网络桌面工具要求全新重构：
- 采用无边框 Fluent 玻璃质感容器，自适应 1200x760 分辨率；
- 整合 12 个独立完备的功能页面（首页仪表盘、节点、节点编辑、订阅、路由、应用分流、DNS、测速、日志、备份、设置、关于）；
- 完全融入用户上传的官方深浅色自适应 Logo。
