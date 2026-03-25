# 插件系统与市场 — 功能规约

> 分支：4-plugin-system
> 创建日期：2026-03-25
> 状态：草稿

## 概述

插件系统与市场是 TerminalMind 的第四个里程碑。在 Phase 1–3 已交付核心骨架、SSH/文件传输与 AI 集成的基础上，本阶段目标为：将 Extension API 扩展为设计文档中的完整 10 个命名空间；为第三方扩展提供基于 Node.js `worker_threads` 的隔离宿主与受限 API 代理；实现声明式权限、`PermissionManager` 同步校验与首次异步授权；提供基于 GitHub 公共仓库（JSON 索引 + Release tarball）的轻量插件市场，以及应用内浏览、搜索、安装、卸载与更新流程；并配套插件脚手架 CLI（`terminalmind create-extension`）与开发者文档、示例。本阶段的核心价值在于在保持 CLI 优先与主进程稳定的前提下，让社区能以可控权限扩展终端、连接、AI、文件与流水线能力，且单插件崩溃不拖垮宿主。

## 用户场景

### 参与者

| 参与者 | 描述 |
|---|---|
| 终端用户 | 通过市场发现、安装、管理插件，并在授权对话框中理解权限范围 |
| 扩展开发者 | 使用脚手架与文档发布符合 manifest 的扩展包 |
| 安全敏感用户 | 依赖权限提示与运行时校验限制第三方能力边界 |

### 用户故事

#### US1：Extension API 完整（10 命名空间）（P1）

**作为**扩展开发者，**我想要**在 `activate` 中通过统一的 `TerminalMindAPI` 访问 `commands`、`terminal`、`connections`、`ai`、`fs`、`views`、`pipeline`、`events`、`config`、`window` 全部命名空间，**以便**实现与内置扩展同等表达力的功能组合。

**验收场景：**

1. **场景**：命名空间可用性与文档一致
   - **假设** 扩展 manifest 声明的 `entry` 已加载且扩展已激活
   - **当** 扩展代码访问任一命名空间上规约定义的方法
   - **则** 行为与 `contracts/extension-host.ts` 中契约一致（内置扩展在主进程侧为完整实现；Worker 扩展见 US2 的受限子集）

2. **场景**：权限与 API 调用联动
   - **假设** 某 API 需要 `terminal.execute` 等权限
   - **当** 扩展未获授权即调用对应方法
   - **则** 调用被拒绝并返回可识别错误；授权后调用成功（在实现能力范围内）

#### US2：Worker 隔离的 Extension Host（P1）

**作为**终端用户，**我想要**第三方扩展在独立 Worker 中运行，**以便**扩展崩溃或异常循环不影响主界面与内置服务。

**验收场景：**

1. **场景**：第三方与内置路径分离
   - **假设** 扩展来源标记为第三方（非内置包 id 列表）
   - **当** 宿主加载该扩展
   - **则** 扩展逻辑在 `Worker` 线程中执行，与 Main 进程内存隔离

2. **场景**：受限代理通信
   - **假设** Worker 内仅暴露 `ExtensionWorkerAPI`（MessagePort 代理）
   - **当** 扩展调用 API
   - **则** 请求经序列化消息到达 Main，由宿主校验权限后委派给真实服务

3. **场景**：Worker 崩溃恢复策略
   - **假设** Worker 因未捕获异常退出
   - **当** 宿主检测到 Worker 终止
   - **则** 扩展被标记为失败状态，UI 可提示；主应用保持可用，其他扩展不受影响

#### US3：权限系统（声明、提示、运行时校验）（P1）

**作为**终端用户，**我想要**在安装或首次使用敏感能力前看到清晰权限说明，并在运行中确信未授权操作无法执行，**以便**控制第三方扩展的可为范围。

**验收场景：**

1. **场景**：manifest 声明
   - **假设** `package.json` 的 `terminalmind.permissions` 列出若干 `Permission`
   - **当** 宿主解析 manifest
   - **则** 静态清单与运行时校验范围一致；缺失声明的敏感调用默认拒绝（策略见假设）

2. **场景**：首次 `request` 异步授权
   - **假设** 扩展尚未获得某权限的 grant
   - **当** 扩展（或代理层）调用 `permissionManager.request(extensionId, [...])`
   - **则** Renderer 展示授权 UI；用户允许后返回 `PermissionGrant`；拒绝则标记为未授权

3. **场景**：同步 `check`
   - **假设** 授权状态已持久化
   - **当** Main 侧任意网关调用 `permissionManager.check(extensionId, permission)`
   - **则** 同步返回布尔值，无阻塞 UI（除首次 request 流程外）

#### US4：插件市场 UI（P1）

**作为**终端用户，**我想要**在应用内搜索、查看详情、安装、卸载与更新插件，**以便**无需手动下载与解压。

**验收场景：**

1. **场景**：搜索与列表
   - **假设** Registry 索引可访问
   - **当** 用户输入关键词并搜索
   - **则** 展示 `RegistrySearchResult` 列表（名称、描述、版本、维护者等元数据）

2. **场景**：安装
   - **假设** 用户选择某条目并点击安装
   - **当** 下载 tarball 并校验完整性通过后解压到 `~/.terminalmind/extensions/<id>/`
   - **则** `InstalledExtension` 元数据写入；扩展可在下次启动或即时激活策略下可用（实现选定一种并文档化）

3. **场景**：卸载与更新
   - **假设** 插件已安装
   - **当** 用户执行卸载或检查更新
   - **则** 目录与元数据移除或更新到目标版本；依赖扩展的 UI 与命令注册一致失效或升级

#### US5：基于 GitHub 的 Registry（P1）

**作为**项目维护者，**我想要**用公开 GitHub 仓库托管扩展索引与发布 tarball，**以便**无需自建完整 npm 式注册表即可 MVP 分发。

**验收场景：**

1. **场景**：索引拉取
   - **假设** 仓库 `main`（或约定分支）上存在 `registry-index.json`（名称实现可配置）
   - **当** `IRegistryClient.fetchIndex()` 执行
   - **则** 解析为 `RegistryEntry[]` 或等价结构，失败时错误可展示

2. **场景**：Release tarball
   - **假设** 每个扩展版本对应 GitHub Release 上的 `.tgz` 资产
   - **当** 安装指定版本
   - **则** 客户端下载资产 URL、校验 `integrity`（如 `sha512`）后解压

3. **场景**：MVP 范围
   - **假设** 不做私有 Registry 认证
   - **当** 仅配置公共仓库 URL
   - **则** 功能可用；私有场景列为后续（排除项）

#### US6：插件开发者体验（P2）

**作为**扩展开发者，**我想要**脚手架、文档与示例仓库，**以便**快速创建符合 manifest 与 API 契约的项目。

**验收场景：**

1. **场景**：CLI 脚手架
   - **假设** 开发者安装 `terminalmind` CLI（或 monorepo 内 `pnpm exec`）
   - **当** 执行 `terminalmind create-extension my-ext`
   - **则** 生成含 `package.json`、`terminalmind` 字段、构建脚本与最小 `activate` 的工程

2. **场景**：文档与示例
   - **假设** 文档站点或仓库 `docs/extensions/` 存在
   - **当** 开发者查阅 API 与权限说明
   - **则** 与 `contracts/` 及本规约交叉引用一致

## 功能需求

| ID | 需求 | 优先级 | 验收标准 |
|---|---|---|---|
| FR-001 | 在 `packages/api`（或契约同步路径）定义完整 `TerminalMindAPI` 十命名空间类型，与 `contracts/extension-host.ts` 对齐 | P1 | 编译期可引用；内置扩展与 Worker 代理共享同一类型源 |
| FR-002 | `commands`：注册、执行、列举（与 Phase 1 行为兼容并支持扩展来源元数据若需要） | P1 | 单测覆盖注册冲突策略与执行错误 |
| FR-003 | `terminal`：创建/销毁/列表会话、resize、输入、订阅输出（能力边界与现有 `TerminalService` 对齐） | P1 | 无权限时拒绝 `terminal.execute` 相关路径 |
| FR-004 | `connections`：连接配置 CRUD（读写在权限 `connections.read` / `connections.write` 下门禁） | P1 | 与 Phase 2 Connection Store 行为一致 |
| FR-005 | `ai`：调用补全/流式（委托 `AIProviderService`）、注册额外 `AIProvider`（若本阶段支持） | P1 | `ai.invoke` 未授权时拒绝 |
| FR-006 | `fs`：本地与远程（SSH/SFTP）文件操作抽象，读写分权限 `fs.read` / `fs.write` | P1 | 路径穿越与过大文件策略在实现中固定并测试 |
| FR-007 | `views`：侧边栏/面板/状态栏项注册（扩展 Phase 1 `views` 能力至设计文档列出的贡献点） | P1 | GUI Shell 能渲染已注册贡献 |
| FR-008 | `pipeline`：注册 `PipelineStep`、组合与执行管道（与 Phase 3 `PipelineEngine` 集成） | P1 | 扩展可注册命名管道；执行走宿主实现 |
| FR-009 | `events`：订阅 `EventBus` 子集事件；事件类型与 `EventPayloadMap` 扩展一致 | P1 | 未授权敏感事件源时不可订阅或收到空操作（策略明确） |
| FR-010 | `config`：读写应用配置键空间（带白名单或前缀规则，防止覆盖安全键） | P1 | 越权键拒绝 |
| FR-011 | `window`：通知、对话框、quick pick 等（API 表面与 Electron 能力桥接，不暴露任意 Node） | P1 | Renderer 侧实现 UI；Main 协调 |
| FR-012 | 实现 `IPermissionManager`：`check` 同步、`request` 异步首次授权，持久化至 `permissions.json` | P1 | 集成测试：拒绝/允许路径 |
| FR-013 | manifest 扩展：`terminalmind.permissions`、`activationEvents`、`contributes` 全量字段（commands、views、menus、keybindings、configuration）解析 | P1 | 无效 manifest 拒绝加载并记录原因 |
| FR-014 | `IExtensionHost` 增强：安装路径扫描、`InstalledExtension` 生命周期（install → activate → deactivate → uninstall） | P1 | 内置扩展仍在 Main 全信任路径；第三方走 Worker |
| FR-015 | `IWorkerExtensionHost`：`Worker` 创建、MessagePort 配对、`ExtensionWorkerMessage` 协议分发 | P1 | Worker 崩溃不导致主进程退出 |
| FR-016 | `ExtensionWorkerAPI`：为 Worker 暴露的受限代理（方法集合为 `TerminalMindAPI` 子集 + 显式禁止能力列表） | P1 | 文档列出差异 |
| FR-017 | `IMarketplaceService`：`search`、`getDetails`、`install`、`uninstall`、`update` | P1 | 错误可映射到 UI 文案 |
| FR-018 | `IRegistryClient`：`fetchIndex`、`downloadTarball(url, expectedIntegrity)` | P1 | 哈希不一致时失败 |
| FR-019 | 市场 GUI：搜索框、结果列表、详情页、安装/卸载/更新按钮与进度/错误状态 | P1 | 手动验收清单见 `quickstart.md` |
| FR-020 | 权限提示 GUI：展示 `PermissionPrompt`（扩展名、权限列表、允许/拒绝）；与 `request()` 配对 | P1 | 拒绝后扩展收到可识别错误 |
| FR-021 | 扩展管理 GUI：已安装列表、启用/禁用、版本、打开日志（可选） | P2 | 禁用后不再激活 |
| FR-022 | CLI：`terminalmind create-extension` 生成模板与 README 片段 | P2 | 生成的包可 `pnpm build` 并通过最小 smoke |
| FR-023 | 开发者文档：manifest 字段、权限模型、Worker 限制、发布到 GitHub Release 的步骤 | P2 | 与规约互相链接 |
| FR-024 | IPC：Phase 4 通道定义于 `contracts/ipc-channels.ts`，preload 仅暴露封装方法 | P1 | Renderer 无直接 `require('fs')` |
| FR-025 | 测试：`PermissionManager`、Registry 客户端（Mock HTTP）、Worker 消息协议、市场服务核心路径单元测试 | P1 | `pnpm test` 相关套件通过 |

## 成功标准

| 标准 | 指标 | 目标值 |
|---|---|---|
| 隔离性 | 第三方扩展 Worker 强制崩溃（测试钩子）后主窗口仍响应 | 100% 用例通过 |
| 权限正确性 | 未声明且未授权敏感权限的 API 调用 | 100% 拒绝 |
| 市场可用性 | 从搜索到安装成功（公开测试索引） | 单用户 ≤ 5 分钟（网络正常） |
| 完整性 | tarball `integrity` 不匹配时 | 安装失败并提示，不写半包 |
| API 完备性 | 设计文档 10 命名空间方法在契约中有定义且内置路径可调用 | 100% 覆盖清单 |
| 开发者上手 | 新开发者按 quickstart 完成首个扩展构建 | ≤ 30 分钟（不含网络下载） |

## 范围边界

### 包含

- 完整 Extension API 类型与内置宿主实现接线
- Worker 隔离宿主、MessagePort 代理、`ExtensionWorkerMessage` 协议
- `PermissionManager`、manifest `permissions`、`permissions.json` 持久化
- GitHub 托管的 JSON 索引 + Release tarball 安装管线
- 应用内市场 UI、权限对话框、扩展管理基础 UI
- `terminalmind create-extension` 脚手架与开发者文档、示例引用
- Phase 4 IPC / Event 扩展（见 `data-model.md`）

### 排除

- 完整私有 npm Registry、组织级包权限与计费
- WebAssembly 沙箱或 V8 isolate（本阶段仅 `worker_threads`）
- 扩展代码签名与公证（可作为后续硬ening）
- 热更新主应用二进制
- 任意网络出站（未授予 `network.outbound` 时默认禁止扩展侧 fetch 代理）

## 边界情况

- **索引不可用**：离线提示、指数缓存 TTL、上次成功索引降级
- **下载中断**：临时文件清理；重试策略；用户取消
- **磁盘空间不足**：安装前检查 `~/.terminalmind/extensions/` 可用空间（尽力而为）
- **manifest 与包内容不一致**：entry 路径缺失、版本字段冲突 → 拒绝激活
- **重复安装**：同 id 不同版本 → 明确升级或并行策略（MVP 建议单槽位版本）
- **权限降级**：用户撤销某权限 → 后续 `check` 为 false；已运行扩展需处理异步拒绝
- **主进程与 Worker 消息乱序**：请求 id 关联、超时与取消
- **恶意 tarball**：除哈希外，解压路径必须限制在扩展目录（防 zip slip）
- **内置扩展误标为第三方**：维护内置 id 白名单，禁止进入 Worker 路径

## 依赖

- Phase 1：`ExtensionHost` 雏形、`TerminalMindAPI` 子集、GUI Shell、IPC Bridge
- Phase 2：`Connection` 存储与 SSH/SFTP 服务抽象
- Phase 3：`AIProviderService`、`PipelineEngine`、事件与 IPC 模式
- Node.js/Electron 运行时支持 `worker_threads` 与 MessageChannel
- 公网 HTTPS 访问 GitHub（raw、API 或 Release 资产 URL）

## 假设

- MVP Registry 使用单一可配置的公开 GitHub 仓库；索引 JSON 格式版本化（`indexVersion`）
- `Permission` 枚举与设计文档 §5.5 一致：`terminal.execute`、`connections.read`、`connections.write`、`fs.read`、`fs.write`、`ai.invoke`、`network.outbound`
- `check()` 仅读取缓存/持久化状态；首次授权必须通过 `request()` 触发 UI
- 英文技术标识符（接口名、文件路径、IPC 通道名）与仓库 `contracts/` 保持一致；本规约正文为简体中文
