# OwnBox Android → PC 功能迁移矩阵 (PORTING MATRIX)

| Android 功能 | Android 源码实现 | PC 设计方案 | PC 实现模块 | 对应 UI 页面 | 测试验证方式 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **VLESS 协议** | `fmt/v2ray/StandardV2RayBean.java` | Sing-box VLESS 出站配置生成 | `src/main/core/ConfigGenerator.ts` | 节点列表 / 节点详情 | 真实核心加载连接与 TCP 握手 | DONE |
| **VMess 协议** | `fmt/v2ray/VMessBean.java` | Sing-box VMess 出站生成 | `src/main/core/ConfigGenerator.ts` | 节点列表 / 节点编辑 | 真实核心出站语法校验 | DONE |
| **Trojan 协议** | `fmt/trojan/TrojanBean.java` | Sing-box Trojan 出站生成 | `src/main/core/ConfigGenerator.ts` | 节点列表 / 节点编辑 | 真实核心出站语法校验 | DONE |
| **Shadowsocks** | `fmt/shadowsocks/ShadowsocksBean.java` | Sing-box SS 出站生成 | `src/main/core/ConfigGenerator.ts` | 节点列表 / 节点编辑 | 密码加密与端口转发测试 | DONE |
| **ShadowsocksR** | `fmt/shadowsocksr/ShadowsocksRBean.java`| Sing-box SSR 出站生成 | `src/main/core/ConfigGenerator.ts` | 节点列表 / 节点编辑 | 语法校验与连接握手 | DONE |
| **Hysteria 1/2**| `fmt/hysteria/HysteriaBean.java` | Sing-box Hysteria2 出站生成 | `src/main/core/ConfigGenerator.ts` | 节点列表 / 节点编辑 | UDP 握手与带宽限制校验 | DONE |
| **TUIC 协议** | `fmt/tuic/TuicBean.java` | Sing-box TUIC 出站生成 | `src/main/core/ConfigGenerator.ts` | 节点列表 / 节点编辑 | QUIC 握手与拥塞算法校验 | DONE |
| **WireGuard** | `fmt/wireguard/WireGuardBean.java` | Sing-box WireGuard Endpoint | `src/main/core/ConfigGenerator.ts` | 节点列表 / 节点编辑 | 密钥与对等节点参数校验 | DONE |
| **Reality 伪装**| `fmt/v2ray/XhttpExtraConverter.kt` | Sing-box Reality TLS 选项配置 | `src/main/core/ConfigGenerator.ts` | 节点编辑 / 协议选项 | 握手参数与公钥校验 | DONE |
| **XHTTP 传输** | `fmt/v2ray/XhttpExtraConverter.kt` | Sing-box xhttp 传输封装 | `src/main/core/ConfigGenerator.ts` | 节点编辑 / 传输选项 | 配置生成与路径测试 | DONE |
| **核心管理** | `bg/BaseService.kt` | 官方原生 Sing-box 进程控制 | `src/main/core/SingBoxManager.ts` | 首页控制 / 设置中心 | 启动/停止/退出真实回收 | DONE |
| **系统代理** | `VpnService` 虚拟网卡 | Windows 注册表 IE 代理修改 | `src/main/system/SystemProxy.ts` | 首页开关 / 设置页 | 注册表键值查询与 WinINet 广播 | PLATFORM_EQUIVALENT |
| **TUN 模式** | `VpnService` 虚拟接口 | Wintun 0.14.1 虚拟网卡接管 | `src/main/core/SingBoxManager.ts` | 首页开关 / TUN 设置页 | 虚拟适配器加载测试 | PLATFORM_EQUIVALENT |
| **分流路由** | `database/RuleEntity.kt` | Sing-box 动态规则链生成 | `src/main/core/ConfigGenerator.ts` | 路由配置页 | 规则匹配与行为测试 | DONE |
| **应用分流** | `assets/proxy_packagename.txt` | Windows 进程与可执行路径分流 | `src/main/system/ProcessScanner.ts` | 应用分流页 | 进程扫描与规则分流匹配 | PLATFORM_EQUIVALENT |
| **DNS 与 FakeIP**| `SingBoxOptionsUtil.kt` | 远程 DoH + 国内直连 + FakeIP | `src/main/core/ConfigGenerator.ts` | DNS 设置页 | 域名查询与解析测试 | DONE |
| **TCP Ping** | `TCPPing.kt` | 原生 Node.js TCP 握手时延 | `src/main/net/TcpPing.ts` | 节点列表 / 测速中心 | 毫秒级真实响应测试 | DONE |
| **吞吐测速** | `bg/proto/SpeedTestRunner.kt` | 异步 HTTP 下载吞吐率测试 | `src/main/net/SpeedTestRunner.ts` | 测速中心 | 真实带宽数据流测量 | DONE |
| **订阅解析** | `group/GroupManager.kt` | 多协议 URL / Base64 解析 | `src/main/db/BackupMigrator.ts` | 订阅管理页 | 订阅抓取与批量导入测试 | DONE |
| **WebDAV 备份** | `ui/BackupFragment.kt` | 原生 HTTP PROPFIND/MKCOL/PUT | `src/main/net/WebDAVClient.ts` | 备份与同步页 | 真实云端上传下载测试 | DONE |
| **本地备份** | `utils/BackupHelper.kt` | `.ownboxbackup` 纯净归档格式 | `src/main/db/BackupMigrator.ts` | 备份与同步页 | 导入导出一致性测试 | DONE |
| **系统托盘** | Android Quick Tile / 磁贴 | Windows 系统托盘与右键菜单 | `src/main/tray/TrayManager.ts` | 系统托盘 | 托盘图标、点击响应与快捷切换 | PLATFORM_EQUIVALENT |
| **桌面小组件** | Android Widget 桌面小部件 | 首页核心控制仪表盘 | `src/renderer/pages/Dashboard.tsx` | 首页仪表盘 | 实时速率与连接状态卡片 | PLATFORM_EQUIVALENT |
| **实时流量图** | Android 悬浮窗速率 | 动态 Canvas 实时带宽图谱 | `src/renderer/pages/Dashboard.tsx` | 首页仪表盘 | 曲线帧率与数据平滑度 | DONE |
| **实时日志** | Logcat 抓取 | 核心标准流重定向与视窗查看 | `src/main/core/SingBoxManager.ts` | 实时日志页 | 日志流过滤与导出测试 | DONE |
