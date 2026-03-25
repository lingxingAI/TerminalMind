# SSH & 文件传输 — 实现计划

> 分支：2-ssh-file-transfer
> 创建日期：2026-03-25
> 状态：草稿

## 技术上下文

### 技术栈

| 领域 | 选型 | 理由 |
|---|---|---|
| SSH 客户端 | ssh2 (Node.js) | 章程 MUST 约束，纯 JS 实现的 SSH2 客户端 |
| 密钥存储 | keytar | 跨平台系统 Keychain 访问（macOS Keychain / Windows Credential Manager / Linux libsecret） |
| 文件传输 | ssh2 SFTP 子系统 | ssh2 内置 SFTP 支持，无需额外依赖 |
| UI 框架 | React 18+ | 章程 MUST 约束，Phase 1 已建立 |
| 状态管理 | Zustand | Phase 1 已建立的 UI 状态管理方案 |

### 依赖项

- `ssh2@1.16.0` — SSH2 协议客户端实现
- `keytar@7.9.0` — 跨平台系统 Keychain 访问（原生模块，需 @electron/rebuild）
- Phase 1 所有已有依赖（Electron、React、xterm.js、Zustand、node-pty 等）

### 章程检查

| 原则 | 合规状态 | 说明 |
|---|---|---|
| P1: Unix 命令哲学 | ✅ | SSHService、SFTPService、ConnectionStore 各自独立，通过 DI 组合 |
| P2: CLI 优先 | ✅ | SSH/SFTP/Connection 逻辑全部在 services 层实现，GUI 是薄壳 |
| P3: 平台无关核心 | ✅ | ssh2 是纯 JS；keytar 平台差异通过 ISecretStore adapter 隔离 |
| P4: 可组合管道化 | ⚠ | Phase 2 不实现 Pipeline 集成，但接口预留 exec() 供 Phase 3 管道使用 |
| P5: 插件平等可扩展 | ✅ | ext-ssh、ext-sftp、ext-connections 全部通过标准 Extension API 注册 |
| P6: CLI 单元测试纪律 | ✅ | SSH/SFTP mock 测试在纯 Node.js 环境运行 |
| P7: 类型安全与不可变数据 | ✅ | 所有接口使用 Readonly<T>，连接配置为不可变结构 |

### 关卡评估

- [x] 所有原则检查通过（无 ❌）
- [x] 所有 NEEDS CLARIFICATION 已解决
- [x] 技术栈选型已确认

## Phase 0：研究

### 研究任务

1. ssh2 库连接生命周期与 Shell/SFTP 子系统 API
2. 跨平台 Keychain 集成方案（keytar）
3. SSH 主机密钥验证与 known_hosts 管理
4. SFTP 传输性能优化（fastGet/fastPut 并行分块）
5. IPC 架构扩展策略
6. Extension API 扩充范围

### 研究结果

输出至 `research.md`。

## Phase 1：设计与契约

### 数据模型

输出至 `data-model.md`。核心实体：
- `SSHConnectionConfig` — SSH 连接配置
- `SSHSession` — SSH 活跃会话
- `SFTPChannel` — SFTP 文件操作通道
- `ConnectionProfile` — 连接配置持久化实体
- `HostKeyEntry` — 主机密钥记录
- `TransferTask` / `TransferQueue` — 传输队列管理

### 接口契约

输出至 `contracts/`。包含：
- `ssh-service.ts` — ISSHService、SSHSession、SFTPChannel 完整接口
- `connection-store.ts` — IConnectionStore、IHostKeyStore、ISecretStore 接口
- `ipc-channels.ts` — Phase 2 新增 IPC 通道定义

### 快速启动

输出至 `quickstart.md`。

## Phase 2：任务分解

输出至 `tasks.md`（由 `/speckit.tasks` 生成）。
