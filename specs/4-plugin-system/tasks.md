# 插件系统与市场 — 任务清单

> 分支：4-plugin-system  
> 创建日期：2026-03-25  
> 总任务数：45

## 依赖图

```
Phase 1 初始化
  T001─T005 依赖/契约同步/IPC/Event
    │
Phase 2 Extension API 全命名空间
  T006─T016 terminal/connections/ai/fs/pipeline/config/window + commands/views/events 增强
    │
Phase 3 PermissionManager
  T017─T020 实现 + 持久化 + IPC + 测试
    │
Phase 4 Worker Extension Host
  T021─T026 Worker/bootstrap/协议/gateway/崩溃处理
    │
Phase 5 Marketplace + Registry
  T027─T032 RegistryClient/MarketplaceService/安装解压/哈希
    │
Phase 6 GUI 市场面板
  T033─T037 搜索/详情/安装卸载更新/进度
    │
Phase 7 GUI 权限与扩展管理
  T038─T041 提示框/授予撤销/已安装列表
    │
Phase 8 脚手架 CLI
  T042─T043 create-extension 模板与文档链接
    │
最终阶段
  T044─T045 集成/E2E/全量测试
```

## Phase 1：初始化

**目标**：依赖、类型基线、IPC / Event 扩展

- [ ] T001 评估并添加解压/哈希/semver 等依赖 — `packages/services/package.json`
- [ ] T002 将 `specs/4-plugin-system/contracts/*` 类型同步到 `packages/api` — `packages/api/src/extension-api.ts`、`packages/api/src/ipc/types.ts`
- [ ] T003 合并 `Phase4IpcChannels` / `Phase4IpcEventChannels` — `packages/api/src/ipc/channels.ts`
- [ ] T004 扩展 `EventPayloadMap` / `EventType`：`extension.*`、`permission.*`、`marketplace.*` — `packages/core/src/event-bus.ts`
- [ ] T005 [US1] 更新 `ExtensionManifest` 解析：`permissions`、`contributes` 全字段 — `packages/services/src/extension-host/` 或 manifest 模块

## Phase 2：Extension API 全命名空间

**目标**：`TerminalMindAPI` 十命名空间在内置路径可用并与服务层接线

- [ ] T006 [US1] `terminal` 命名空间：对接 `TerminalService`（创建/销毁/列表/输入/输出订阅/可选 execute）— `packages/services/src/extension-api/namespaces/terminal.ts`
- [ ] T007 [US1] `connections` 命名空间：对接 Connection Store（CRUD + 权限门禁）— `.../connections.ts`
- [ ] T008 [US1] `ai` 命名空间：对接 `AIProviderService`（complete/stream，可选 registerProvider）— `.../ai.ts`
- [ ] T009 [US1] `fs` 命名空间：本地 FS + 远程 URI 策略（读/写分权）— `.../fs.ts`
- [ ] T010 [US1] `pipeline` 命名空间：注册步骤、执行管道，对接 `PipelineEngine` — `.../pipeline.ts`
- [ ] T011 [US1] `config` 命名空间：键空间白名单，对接现有配置存储 — `.../config.ts`
- [ ] T012 [US1] `window` 命名空间：通知/quick pick 桥接 IPC 至 Renderer — `.../window.ts`
- [ ] T013 [US1] `views` 增强：panel、statusBar 贡献注册 — `.../views.ts`
- [ ] T014 [US1] `commands` / `events` 与内置扩展兼容增强（如需来源元数据）— `.../commands.ts`、`events.ts`
- [ ] T015 [US1] 构建 `TerminalMindAPI` 工厂：注入服务容器，供内置 ExtensionHost 使用 — `packages/services/src/extension-api/create-api.ts`
- [ ] T016 [US1] 内置扩展冒烟：任选一扩展调用新命名空间 API — `extensions/ext-connections` 或 `ext-terminal`

## Phase 3：PermissionManager 实现

**目标**：`check` 同步、`request` 异步授权、持久化

- [ ] T017 [US3] 实现 `IPermissionManager`（内存 + `permissions.json`）— `packages/services/src/permissions/permission-manager.ts`
- [ ] T018 [US3] `request` 与 IPC `PERMISSION_*` 配对：Main 挂起 Promise，Renderer 完成对话框 — `packages/app/src/main/`、`renderer/`
- [ ] T019 [US3] API 网关集成：敏感方法先 `check` 再委派 — `packages/services/src/extension-host/api-gateway.ts`
- [ ] T020 [US3] 单元测试：允许/拒绝/撤销路径 — `packages/services/src/permissions/__tests__/`

## Phase 4：Worker Extension Host

**目标**：第三方扩展 Worker 化与协议稳定

- [ ] T021 [US2] 实现 `IWorkerExtensionHost.spawnWorker` / `terminateWorker` — `worker-extension-host.ts`
- [ ] T022 [US2] `worker-bootstrap`：接收 `MessagePort`，构造 `ExtensionWorkerAPI` 代理桩 — `worker-bootstrap.ts`
- [ ] T023 [US2] `ExtensionWorkerMessage` 编解码与 `callId` 超时 — `api-gateway.ts`
- [ ] T024 [US2] 内置扩展白名单：builtin 永不进入 Worker — `extension-host.ts`
- [ ] T025 [US2] Worker 崩溃检测与 `extension.workerCrashed` 事件 — `worker-extension-host.ts`
- [ ] T026 [US2] 集成测试：Mock Worker 发 `api.invoke` 验证权限拒绝 — `packages/services/src/extension-host/__tests__/`

## Phase 5：Marketplace Service + Registry Client

**目标**：GitHub 索引 + tarball 安装

- [ ] T027 [US5] 实现 `IRegistryClient.fetchIndex`（ETag 缓存）— `registry-client.ts`
- [ ] T028 [US5] 实现 `downloadTarball` + `sha512` 校验 — `registry-client.ts`
- [ ] T029 [US4] 实现 `IMarketplaceService.search/getDetails` — `marketplace-service.ts`
- [ ] T030 [US4] 实现 `install/uninstall/update`：解压至 `~/.terminalmind/extensions/`、zip slip 防护 — `marketplace-service.ts`
- [ ] T031 [US4] 更新 `installed.json` 与 ExtensionHost 刷新钩子 — `marketplace-service.ts`、`extension-host.ts`
- [ ] T032 [US5] 单元测试：Mock fetch 索引与错误哈希 — `packages/services/src/marketplace/__tests__/`

## Phase 6：GUI — 市场面板

**目标**：搜索、安装、卸载、更新

- [ ] T033 [US4] `MarketplacePanel`：搜索框、结果列表、空/错状态 — `renderer/.../MarketplacePanel.tsx`
- [ ] T034 [US4] `ExtensionDetailsView`：版本选择、README/Markdown（可选）— `ExtensionDetailsView.tsx`
- [ ] T035 [US4] preload 暴露 `marketplace.*` IPC — `packages/app/src/preload/index.ts`
- [ ] T036 [US4] Main 注册 `MARKETPLACE_*` handlers — `ipc-handlers.ts`
- [ ] T037 [US4] 订阅 `MARKETPLACE_INSTALL_PROGRESS` 更新进度条 — `MarketplacePanel.tsx`

## Phase 7：GUI — 权限提示与扩展管理

**目标**：授权对话框与已安装列表

- [ ] T038 [US3] `PermissionPromptModal`：展示 `PermissionPrompt`、允许/拒绝 — `renderer/.../PermissionPromptModal.tsx`
- [ ] T039 [US3] IPC：`PERMISSION_PROMPT` / `PERMISSION_PROMPT_RESULT` 往返 — `preload`、`ipc-handlers.ts`
- [ ] T040 [US4] 已安装扩展列表：启用/禁用、卸载、检查更新 — `InstalledExtensionsPanel.tsx`（路径可调整）
- [ ] T041 [P2] 扩展管理：打开扩展目录、复制日志（可选）— 同上或设置页

## Phase 8：插件脚手架 CLI

**目标**：`terminalmind create-extension`

- [ ] T042 [US6] 实现 CLI 模板（`package.json`、`terminalmind` 字段、`src/index.ts`、构建脚本）— `tools/cli/create-extension.ts`
- [ ] T043 [US6] 开发者文档：manifest、权限、发布到 GitHub Release — `docs/extensions/README.md`（或仓库约定路径）

## 最终阶段：集成与测试

- [ ] T044 应用启动：注册 `RegistryClient`、`MarketplaceService`、`WorkerExtensionHost` — `packages/app/src/main/index.ts` 或 bootstrap
- [ ] T045 E2E 或集成测试：安装测试包 → 激活 → 权限允许/拒绝；`pnpm test` 全绿 — `packages/app/e2e/` 或 services 集成测试
