# 插件系统与市场 — 实现计划

> 分支：4-plugin-system  
> 创建日期：2026-03-25  
> 状态：草稿

## 技术上下文

### 技术栈

| 领域 | 选型 | 理由 |
|---|---|---|
| 扩展隔离 | Node.js `worker_threads` | MVP 内置于 Node/Electron，线程级隔离，满足「崩溃不拖垮宿主」目标 |
| 跨边界通信 | `MessageChannel` / `MessagePort` + JSON 可克隆载荷 | 与 Worker 模型一致，便于请求-响应与订阅模式 |
| 权限 | `PermissionManager`（Main）+ Renderer 对话框 | `check` 同步；`request` 走 IPC 唤起 UI |
| Registry | GitHub 静态 JSON + Release tarball | 免 npm 式后端；HTTPS + `integrity` 校验 |
| 市场 UI | React + 现有 Shell / 侧边栏 | 与 Phase 1–3 GUI 模式一致 |
| 脚手架 | Node CLI（`terminalmind` 子命令） | 与 monorepo 工具链统一，可 `pnpm` 链接 |

### 依赖项

- Phase 1–3 已合并能力：`TerminalService`、Connection 存储、AI、Pipeline、IPC、EventBus
- 解压与哈希：`tar`/`zlib` 或 `tar-fs` 类库（实现阶段选定）；`crypto` 内置
- 可选：`semver` 用于版本比较

### 章程检查

| 原则 | 合规状态 | 说明 |
|---|---|---|
| P1: Unix 命令哲学 | ✅ | Registry 客户端、市场服务、Extension Host、Permission 分层 |
| P2: CLI 优先 | ✅ | 脚手架与核心逻辑可独立测试；GUI 通过 IPC |
| P3: 平台无关核心 | ✅ | 协议与类型在 `packages/api` 同步；平台差异在 Electron 适配层 |
| P4: 可组合管道化 | ✅ | `pipeline` 命名空间对接 Phase 3 引擎 |
| P5: 插件平等可扩展 | ✅ | 内置与第三方分路径，API 类型统一 |
| P6: CLI 单元测试纪律 | ✅ | Permission、Registry、消息协议、市场服务可脱离 Electron 测 |
| P7: 类型安全与不可变数据 | ✅ | 契约广泛使用 `readonly` |

### 关卡评估

- [x] 所有原则检查通过（无 ❌）
- [x] 所有 NEEDS CLARIFICATION 已解决（以规约假设为准）
- [x] 技术栈选型已确认

## Phase 0：研究

### 研究任务

1. Electron 下 Worker 入口路径与 asar 外解压策略  
2. MessagePort 协议设计与流式 API 映射  
3. GitHub Release 资产 URL 稳定性与索引缓存  
4. 权限 UX 文案与 VS Code / Android 模式对照  
5. 扩展生命周期与 Windows 文件锁处理  
6. tarball 完整性校验与 zip slip 防护  

### 研究结果

输出至 `research.md`。

## Phase 1：设计与契约

### 数据模型

输出至 `data-model.md`。核心实体：

- `ExtensionManifest`、`InstalledExtension`、`PermissionGrant`、`PermissionPrompt`  
- `RegistryEntry` / `RegistrySearchResult`、`ExtensionWorkerMessage`  
- 存储路径与 `EventPayloadMap` 扩展  

### 接口契约

输出至 `contracts/`：

- `extension-host.ts` — `IExtensionHost`、`IWorkerExtensionHost`、`IPermissionManager`、`TerminalMindAPI`、`ExtensionWorkerAPI`、消息协议  
- `marketplace.ts` — `IMarketplaceService`、`IRegistryClient`、搜索/详情 DTO  
- `ipc-channels.ts` — Phase 4 IPC 与事件通道  

### 快速启动

输出至 `quickstart.md`。

## Phase 2：任务分解

输出至 `tasks.md`。
