# 核心骨架 MVP — 实现计划

> 分支：1-core-skeleton-mvp
> 创建日期：2026-03-25
> 状态：草稿

## 技术上下文

### 技术栈

| 领域 | 选型 | 理由 |
|---|---|---|
| 桌面框架 | Electron 33+ | 章程 MUST 约束；成熟跨平台方案，VS Code / Tabby 验证 |
| 构建集成 | electron-vite | 统一 main/preload/renderer 三目标构建；内置 HMR、依赖外部化（研究 R1） |
| 前端框架 | React 18+ | 章程 MUST 约束；生态丰富，xterm.js 集成方案成熟 |
| 语言 | TypeScript 5.x (strict) | 章程 MUST 约束（P7）；编译期类型安全 |
| 终端渲染 | xterm.js 5.x + addon-fit + addon-unicode11 | 章程 MUST 约束；Phase 1 最小 addon 集（研究 R3） |
| 本地 PTY | node-pty | 章程 MUST 约束；跨平台伪终端 |
| 状态管理 | Zustand 5.x | 章程 SHOULD 约束；轻量、不可变友好 |
| 依赖注入 | 自定义轻量 DI（ServiceContainer） | 约 50 行实现，基于泛型 Token + Map（研究 R5） |
| IPC 通信 | 共享类型契约 + contextBridge | 类型安全，窄 API 暴露（研究 R2） |
| 打包分发 | electron-builder | 与 electron-vite 集成，NSIS/DMG/AppImage |
| 包管理 | pnpm 9+ workspaces | 章程 MUST 约束（Monorepo） |
| 测试 | Vitest | 章程 MUST 约束（P6）；与 Vite 原生集成 |
| 代码规范 | ESLint 9+ (flat config) + Prettier | 章程 MUST 约束；统一代码风格 |
| 原生模块重编译 | @electron/rebuild | 确保 node-pty 匹配 Electron ABI |

### 依赖项

- **electron**: ^33.0.0 — 桌面应用运行时
- **electron-vite**: ^3.0.0 — 构建工具集成
- **electron-builder**: ^25.0.0 — 应用打包分发
- **@electron/rebuild**: ^3.0.0 — 原生模块重编译
- **react**: ^18.3.0 — GUI Shell 前端框架
- **react-dom**: ^18.3.0 — React DOM 渲染
- **zustand**: ^5.0.0 — UI 状态管理
- **@xterm/xterm**: ^5.5.0 — 终端渲染核心
- **@xterm/addon-fit**: ^0.10.0 — 终端自适应尺寸
- **@xterm/addon-unicode11**: ^0.8.0 — Unicode 宽度支持
- **@xterm/addon-webgl**: ^0.18.0 — 可选 GPU 加速渲染
- **node-pty**: ^1.0.0 — 跨平台伪终端
- **typescript**: ^5.6.0 — 编程语言
- **vitest**: ^2.0.0 — 单元测试框架
- **eslint**: ^9.0.0 — 代码检查
- **prettier**: ^3.4.0 — 代码格式化
- **@vitejs/plugin-react**: ^4.0.0 — Vite React 插件

### 章程检查

根据项目章程（`.specify/memory/constitution.md`）验证：

| 原则 | 合规状态 | 说明 |
|---|---|---|
| P1: Unix 命令哲学 | ✅ | CommandRegistry、ServiceContainer、EventBus 各司其职，公共 API ≤ 5 个方法。TerminalService 仅管会话生命周期，不涉及 UI。ext-terminal 是独立扩展，不与 Core 耦合。 |
| P2: CLI 优先 | ✅ | Core CLI 层（core + services）完全独立于 Electron。GUI Shell 通过 IPC Bridge 调用，不包含业务逻辑。所有命令先注册到 CommandRegistry，可 CLI 调用。 |
| P3: 平台无关核心 | ✅ | core 和 services 零 Electron 依赖。Shell 发现通过 `IShellDiscoveryAdapter` 接口隔离平台差异。node-pty 是 npm 生态库（非 Electron API），通过 Adapter 注入。 |
| P4: 可组合管道化 | ⚠️ | PipelineEngine 不在 Phase 1 范围内（Phase 3），但 Command 的 `handler` 签名已预留 `PipelineEngine` 入口。CommandContext 包含 pipeline 字段，Phase 1 提供 stub 实现。不违反原则，但功能未完整。 |
| P5: 插件平等可扩展 | ✅ | ext-terminal 从第一天起通过 Extension API 最小子集注册（activate/deactivate + commands.register + views.registerSidebarView）。无特权内部 API。 |
| P6: CLI 单元测试纪律 | ✅ | Vitest 配置，core 和 services 测试在纯 Node.js 运行。每个 Service 和 Command 附带至少一个正常路径测试。pnpm test 无需 Electron。 |
| P7: 类型安全与不可变数据 | ✅ | tsconfig strict: true。所有接口参数和返回值标记 Readonly<T>。EventBus payload 为 Readonly。状态通过 EventBus 发布/订阅，不直接修改共享对象。 |

### 关卡评估

- [x] 所有原则检查通过（无 ❌，P4 为 ⚠️ 已说明）
- [x] 所有 NEEDS CLARIFICATION 已解决（见 research.md）
- [x] 技术栈选型已确认

## Phase 0：研究

### 研究任务

1. **R1: Electron + Vite 集成**：electron-vite vs 手动配置，原生模块处理
2. **R2: IPC 类型安全通信**：contextBridge 模式、流式数据处理、通道设计
3. **R3: node-pty + xterm.js 集成**：数据流、addon 选择、性能策略
4. **R4: 跨平台 Shell 检测**：各平台发现机制、Adapter 接口设计
5. **R5: 轻量 DI 容器**：自定义 vs 第三方库
6. **R6: Monorepo 包依赖**：分层约束、workspace 配置

### 研究结果

所有研究任务已完成，输出至 `research.md`。

## Phase 1：设计与契约

### 数据模型

输出至 `data-model.md`。涵盖实体：

- **Core 层**：Command、ServiceToken、EventType/EventPayload、Disposable
- **Services 层**：TerminalSession、TerminalCreateOptions、ShellInfo
- **API 层**：ExtensionContext、ExtensionManifest、TerminalMindAPI（Phase 1 子集）
- **App 层**：TabState、LayoutState、ThemeColors

### 接口契约

输出至 `contracts/`。包含：

- `contracts/extension-api.ts` — Extension API Phase 1 最小子集
- `contracts/ipc-bridge.ts` — IPC 通道定义和类型契约
- `contracts/core-types.ts` — 核心类型定义（跨层共享）

### 快速启动

输出至 `quickstart.md`。包含开发环境搭建、项目启动、测试运行说明。

## Phase 2：任务分解

输出至 `tasks.md`（由 `/speckit.tasks` 生成）。
