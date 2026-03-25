# SSH & 文件传输 — 任务清单

> 分支：2-ssh-file-transfer
> 创建日期：2026-03-25
> 总任务数：48

## 依赖图

```
Phase 1 初始化
  T001─T004 依赖安装 + 类型定义 + IPC 扩展 + API 扩充
    │
Phase 2 基础服务层
  ├─ T005─T008 SecretStore + HostKeyStore + ConnectionStore + 单元测试
  ├─ T009─T013 SSHService + SSHSession + 多跳 + 保活 + 单元测试
  └─ T014─T018 SFTPChannel + TransferQueue + 单元测试
    │
Phase 3 ext-ssh
  T019─T021 扩展注册 + IPC handler + 单元测试
    │
Phase 4 ext-sftp
  T022─T024 扩展注册 + IPC handler + 单元测试
    │
Phase 5 ext-connections
  T025─T027 扩展注册 + IPC handler + 单元测试
    │
Phase 6 GUI - 连接管理
  T028─T034 连接树 + 编辑器 + 搜索 + Sidebar 集成 + Zustand store + preload
    │
Phase 7 GUI - SSH 终端
  T035─T039 SSH TerminalView + 状态显示 + 重连 + 端口转发 + preload
    │
Phase 8 GUI - SFTP 文件浏览
  T040─T045 文件树 + 双面板 + 传输队列 + 拖拽上传 + preload
    │
最终阶段
  T046─T048 导入导出 + Main 入口集成 + 收尾
```

## Phase 1：初始化

**目标**：安装新依赖，扩展类型定义和 IPC 通道

- [x] T001 安装 ssh2 和 keytar 依赖 — `packages/services/package.json`
- [x] T002 扩展 EventPayloadMap 新增 SSH/SFTP/Connection 事件类型 — `packages/core/src/event-bus.ts`
- [x] T003 扩展 IPC 通道常量，新增 SSH/SFTP/Connection 通道 — `packages/api/src/ipc/channels.ts`
- [x] T004 扩展 IPC 类型定义，新增 SSH/SFTP/Connection 数据类型 — `packages/api/src/ipc/types.ts`

## Phase 2：基础服务层

**目标**：实现 SecretStore、HostKeyStore、ConnectionStore、SSHService、SFTPChannel、TransferQueue

**检查点**：所有基础服务可在纯 Node.js 环境独立运行和测试

### 连接配置管理

- [x] T005 [US4] 实现 ISecretStore（keytar wrapper + 降级方案）— `packages/services/src/connection/secret-store.ts`
- [x] T006 [US1] 实现 IHostKeyStore（known_hosts 文件读写）— `packages/services/src/ssh/host-key-store.ts`
- [x] T007 [US4] 实现 IConnectionStore（JSON 文件 CRUD + 敏感信息分离）— `packages/services/src/connection/connection-store.ts`
- [x] T008 [US4] ConnectionStore 单元测试 — `packages/services/src/connection/__tests__/connection-store.test.ts`

### SSH 服务

- [x] T009 [US1] 实现 ISSHService 核心（connect/disconnect/listSessions）— `packages/services/src/ssh/ssh-service.ts`
- [x] T010 [US1] 实现 ManagedSSHSession（shell/exec/sftp/disconnect）— `packages/services/src/ssh/ssh-session.ts`
- [x] T011 [US1] 实现 SSH 多跳跳板机连接逻辑 — `packages/services/src/ssh/ssh-service.ts`（扩展 connect 方法）
- [x] T012 [US1] 实现 SSH keepAlive 和断开检测 — `packages/services/src/ssh/ssh-session.ts`（事件处理）
- [x] T013 [US1] SSHService 单元测试（mock ssh2 Client）— `packages/services/src/ssh/__tests__/ssh-service.test.ts`

### SFTP 服务

- [x] T014 [US3] 实现 SFTPChannel（list/stat/mkdir/rmdir/unlink/rename）— `packages/services/src/sftp/sftp-channel.ts`
- [x] T015 [US3] 实现 SFTPChannel 文件传输（upload/download + 进度回调）— `packages/services/src/sftp/sftp-channel.ts`（扩展）
- [x] T016 [US3] 实现 ITransferQueue（排队/并发控制/进度追踪）— `packages/services/src/sftp/transfer-queue.ts`
- [x] T017 [US3] SFTPChannel 单元测试 — `packages/services/src/sftp/__tests__/sftp-channel.test.ts`
- [x] T018 [US3] TransferQueue 单元测试 — `packages/services/src/sftp/__tests__/transfer-queue.test.ts`

## Phase 3：ext-ssh 内置扩展

**故事目标**：通过 Extension API 注册 SSH 相关命令和侧边栏视图
**独立测试标准**：ext-ssh 在纯 Node.js 环境中可激活并注册命令

- [x] T019 [US1] 创建 ext-ssh 扩展结构（package.json + tsconfig.json + src/index.ts）— `extensions/ext-ssh/`
- [x] T020 [US1] 实现 ext-ssh activate：注册 ssh.connect、ssh.disconnect、ssh.quick-connect 命令 — `extensions/ext-ssh/src/index.ts`
- [x] T021 [US1] ext-ssh 单元测试 — `extensions/ext-ssh/src/__tests__/index.test.ts`

## Phase 4：ext-sftp 内置扩展

**故事目标**：通过 Extension API 注册 SFTP 相关命令
**独立测试标准**：ext-sftp 在纯 Node.js 环境中可激活并注册命令

- [x] T022 [US3] 创建 ext-sftp 扩展结构 — `extensions/ext-sftp/`
- [x] T023 [US3] 实现 ext-sftp activate：注册 sftp.open、sftp.upload、sftp.download 命令 — `extensions/ext-sftp/src/index.ts`
- [x] T024 [US3] ext-sftp 单元测试 — `extensions/ext-sftp/src/__tests__/index.test.ts`

## Phase 5：ext-connections 内置扩展

**故事目标**：通过 Extension API 注册连接管理命令和侧边栏视图
**独立测试标准**：ext-connections 在纯 Node.js 环境中可激活并注册命令

- [x] T025 [US4] 创建 ext-connections 扩展结构 — `extensions/ext-connections/`
- [x] T026 [US4] 实现 ext-connections activate：注册 connections.create、connections.edit、connections.delete、connections.search 命令和 connections-tree 侧边栏视图 — `extensions/ext-connections/src/index.ts`
- [x] T027 [US4] ext-connections 单元测试 — `extensions/ext-connections/src/__tests__/index.test.ts`

## Phase 6：GUI — 连接管理

**故事目标**：侧边栏连接树视图、连接编辑器、搜索
**独立测试标准**：GUI 中可查看、创建、编辑、删除连接

- [x] T028 [US4] 创建 Zustand connection-store（连接列表、选中连接、搜索关键词）— `packages/app/src/renderer/src/stores/connection-store.ts`
- [x] T029 [US4] 实现 ConnectionTree 组件（分组树视图 + 状态图标）— `packages/app/src/renderer/src/components/connections/ConnectionTree.tsx`
- [x] T030 [US4] 实现 ConnectionEditor 组件（创建/编辑连接表单）— `packages/app/src/renderer/src/components/connections/ConnectionEditor.tsx`
- [x] T031 [US4] 实现连接搜索/过滤功能 — `packages/app/src/renderer/src/components/connections/ConnectionSearch.tsx`
- [x] T032 [US4] 集成 ConnectionTree 到 Sidebar（ActivityBar 连接图标 → Sidebar 展示连接树）— `packages/app/src/renderer/src/components/layout/Sidebar.tsx`（扩展）
- [x] T033 [US4] 扩展 preload API 新增 connections 方法 — `packages/app/src/preload/index.ts`（扩展）
- [x] T034 [US4] 注册 Connection 相关 IPC handlers — `packages/app/src/main/ipc-handlers.ts`（扩展）

## Phase 7：GUI — SSH 终端

**故事目标**：SSH 远程终端标签、连接状态、重连、端口转发
**独立测试标准**：GUI 中可连接 SSH 服务器并交互

- [x] T035 [US1] 扩展 TabStore 支持 SSH 终端标签（区分本地/远程，记录 sshSessionId）— `packages/app/src/renderer/src/stores/tab-store.ts`（扩展）
- [x] T036 [US1][US5] 实现 SSH 终端连接流程（双击连接 → 认证 → 打开远程终端标签）— `packages/app/src/renderer/src/hooks/useSSHConnect.ts`
- [x] T037 [US1] 实现连接状态显示和断开重连 UI — `packages/app/src/renderer/src/components/ssh/SSHStatusIndicator.tsx`
- [x] T038 [US2] 实现端口转发管理 UI — `packages/app/src/renderer/src/components/ssh/PortForwardPanel.tsx`
- [x] T039 [US1] 扩展 preload API 新增 ssh 方法 + 注册 SSH IPC handlers — `packages/app/src/preload/index.ts` + `packages/app/src/main/ipc-handlers.ts`（扩展）

## Phase 8：GUI — SFTP 文件浏览

**故事目标**：SFTP 文件浏览器面板、传输队列
**独立测试标准**：GUI 中可浏览远程文件系统并传输文件

- [x] T040 [US3] 创建 Zustand transfer-store（传输任务列表、进度状态）— `packages/app/src/renderer/src/stores/transfer-store.ts`
- [x] T041 [US3] 实现 FileTree 组件（远程文件目录树，支持展开/折叠/选择）— `packages/app/src/renderer/src/components/sftp/FileTree.tsx`
- [x] T042 [US3] 实现 FileBrowser 双面板组件（本地 + 远程并排显示）— `packages/app/src/renderer/src/components/sftp/FileBrowser.tsx`
- [x] T043 [US3] 实现 TransferQueue 面板组件（传输列表 + 进度条 + 取消/重试）— `packages/app/src/renderer/src/components/sftp/TransferQueue.tsx`
- [x] T044 [US3] 集成 SFTP 面板到 Sidebar/PanelArea — `packages/app/src/renderer/src/components/layout/Sidebar.tsx`（扩展）
- [x] T045 [US3] 扩展 preload API 新增 sftp 方法 + 注册 SFTP IPC handlers — `packages/app/src/preload/index.ts` + `packages/app/src/main/ipc-handlers.ts`（扩展）

## 最终阶段：收尾与横切关注点

**目标**：导入导出、Main 入口集成、主题样式、StatusBar 更新

- [x] T046 [US4] 实现连接导入/导出 JSON 功能 — `packages/services/src/connection/connection-store.ts`（扩展 import/export 方法）
- [x] T047 集成所有新服务到 Main 入口（ServiceContainer 注册 SSHService、ConnectionStore、SecretStore、HostKeyStore；ExtensionHost 注册 ext-ssh、ext-sftp、ext-connections）— `packages/app/src/main/index.ts`（扩展）
- [x] T048 更新 StatusBar 显示 SSH 连接信息 + 更新 theme.css 新增组件样式 — `packages/app/src/renderer/src/components/layout/StatusBar.tsx` + `packages/app/src/renderer/src/styles/theme.css`（扩展）

## 并行执行建议

### 可并行组

| 组 | 任务 | 前置条件 |
|---|---|---|
| A | T005, T006 | T001-T004（初始化完成后）|
| B | T007-T008 | T005（SecretStore 就绪）|
| C | T009-T013 | T006（HostKeyStore 就绪）|
| D | T014-T018 | T009-T010（SSHService 就绪后 SFTP 可并行）|
| E | T019-T021, T022-T024, T025-T027 | Phase 2 服务层完成后，三个扩展可完全并行 |
| F | T028-T034 | T025-T027（ext-connections 就绪）|
| G | T035-T039 | T019-T021（ext-ssh 就绪）|
| H | T040-T045 | T022-T024（ext-sftp 就绪）|

### 关键路径

```
T001 → T003 → T009 → T010 → T014 → T019 → T035 → T047
```

## 实施策略

- **MVP 范围**：优先实现密码认证的 SSH 连接 + 基本 SFTP 文件浏览/传输 + 连接 CRUD。密钥认证、多跳、端口转发可在主路径完成后补充。
- **增量交付**：Phase 2 服务层完成后可通过单元测试验证核心功能；GUI 分三批交付（连接管理 → SSH 终端 → SFTP 面板）。
- **风险缓解**：ssh2 库是纯 JS 无原生模块依赖；keytar 是原生模块，需提供降级方案应对构建失败。
