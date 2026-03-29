# TerminalMind — Product Requirements Document

> CLI-First 智能终端工具，面向全栈开发者

## 1 产品概述

### 1.1 定位

TerminalMind 是一款跨平台（Windows / macOS / Linux）的智能终端工具，定位类似 MobaXterm，但以 AI 能力和插件生态为核心差异。面向全栈开发者，在日常开发和运维场景中提供一站式终端体验。

### 1.2 核心功能

| 功能 | 说明 |
|---|---|
| 本地终端 | 多标签本地 Shell，支持 PowerShell / Bash / Zsh |
| SSH 远程连接 | 会话管理、密钥认证、多跳跳板机、端口转发 |
| SFTP 文件传输 | 可视化远程文件管理，拖拽上传下载 |
| AI 命令生成 | 自然语言生成 Shell 命令，终端内联 + 侧边栏对话双模式 |
| 插件系统 | 完全开放的 Extension API，内置与第三方插件平等 |
| 插件市场 | 基于 GitHub 的分发体系，应用内搜索安装 |

### 1.3 不在首期范围

- RDP 远程桌面（后期可通过插件实现）
- 团队协作 / 云同步
- 内置代码编辑器

---

## 2 设计原则

所有架构决策和实现必须遵守以下 7 条原则：

### 原则 1：Unix 命令哲学

每个模块做一件事并做好。功能通过组合小工具完成，而非构建大而全的单体模块。Extension 粒度宁小勿大。

### 原则 2：CLI 优先、GUI 与逻辑分离

所有业务逻辑必须在 GUI 层之下实现。核心功能可以脱离 Electron 以 CLI 方式独立运行和测试。GUI Shell 是薄壳，只负责渲染和用户交互，不包含业务逻辑。

### 原则 3：平台无关核心

`@terminalmind/core` 和 `@terminalmind/services` 不得依赖 Electron 特有 API。允许使用 Node.js 标准库和 npm 生态库（如 `ssh2`、`node-pty`），但涉及平台差异的部分（文件路径、密钥链、Shell 发现等）必须通过注入的 Adapter 接口隔离，确保可在纯 Node.js 环境中运行单元测试，无需启动 Electron。

### 原则 4：可组合管道化

功能之间通过管道（Pipeline）组合。命令可以链式执行，输出可以作为下一个命令的输入。AI 生成的命令可以直接进入执行管道。

### 原则 5：插件平等可扩展

内置功能（终端、SSH、SFTP、AI）以 Extension 形式实现，和第三方插件使用完全相同的 Extension API。没有特权内部 API。

### 原则 6：CLI 单元测试纪律

每个 Service、Command、Pipeline Operator 都必须可以脱离 GUI 进行单元测试。测试用例通过 CLI 模式执行，CI 中无需启动 Electron。

### 原则 7：类型安全与不可变数据

TypeScript strict 模式。跨层数据传递使用 readonly 类型。状态变更通过事件驱动，不直接修改共享对象。配置和连接数据使用不可变数据结构。

---

## 3 技术栈

| 领域 | 选型 | 理由 |
|---|---|---|
| 桌面框架 | Electron | 成熟的跨平台方案，VS Code / Tabby 验证过 |
| 前端框架 | React 18+ | 生态丰富，xterm.js 集成方案成熟 |
| 语言 | TypeScript (strict) | 类型安全，原则 7 |
| 终端渲染 | xterm.js + xterm-addon-* | 业界标准终端渲染库 |
| SSH | ssh2 (Node.js) | 纯 JS 实现的 SSH2 客户端 |
| 本地 PTY | node-pty | 跨平台伪终端 |
| 状态管理 | Zustand | 轻量、不可变友好、支持 middleware |
| 构建工具 | Vite + electron-builder | 快速开发构建 |
| 包管理 | pnpm workspaces | Monorepo 管理 |
| 测试 | Vitest | 与 Vite 原生集成，快 |
| 代码规范 | ESLint + Prettier | 统一代码风格 |

---

## 4 系统架构

### 4.1 五层架构

```
┌─────────────────────────────────────────────────────┐
│                    GUI Shell                         │
│   React 薄壳：Layout / xterm.js / AI Panel / Theme  │
├─────────────────────────────────────────────────────┤
│                    Extensions                        │
│   ext-terminal  ext-ssh  ext-sftp  ext-ai  3rd...   │
├─────────────────────────────────────────────────────┤
│                  Extension API                       │
│   commands.* terminal.* ai.* fs.* pipeline.* ...    │
├─────────────────────────────────────────────────────┤
│                    Services                          │
│   Terminal  SSH  SFTP  AI  Pipeline  Config  Store   │
├─────────────────────────────────────────────────────┤
│                    Core CLI                          │
│   CommandRegistry  DI  EventBus  PipelineEngine     │
└─────────────────────────────────────────────────────┘
```

数据单向向下流动。每层只依赖其直接下层，不得跨层调用。

### 4.2 Monorepo 结构

```
terminalmind/
├── packages/
│   ├── core/                  # @terminalmind/core
│   │   ├── src/
│   │   │   ├── command-registry.ts
│   │   │   ├── service-container.ts
│   │   │   ├── event-bus.ts
│   │   │   ├── pipeline-engine.ts
│   │   │   ├── permission-manager.ts
│   │   │   ├── plugin-loader.ts
│   │   │   └── types/
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── services/              # @terminalmind/services
│   │   ├── src/
│   │   │   ├── terminal/
│   │   │   │   ├── terminal-service.ts
│   │   │   │   └── terminal-service.test.ts
│   │   │   ├── ssh/
│   │   │   │   ├── ssh-service.ts
│   │   │   │   └── ssh-service.test.ts
│   │   │   ├── sftp/
│   │   │   ├── ai/
│   │   │   │   ├── ai-provider-service.ts
│   │   │   │   ├── providers/
│   │   │   │   │   └── openrouter-provider.ts
│   │   │   │   └── ai-provider-service.test.ts
│   │   │   ├── connection/
│   │   │   ├── config/
│   │   │   └── extension-host/
│   │   └── package.json
│   │
│   ├── api/                   # @terminalmind/api
│   │   ├── src/
│   │   │   ├── index.ts       # 公开入口
│   │   │   ├── namespaces/
│   │   │   │   ├── commands.ts
│   │   │   │   ├── terminal.ts
│   │   │   │   ├── connections.ts
│   │   │   │   ├── ai.ts
│   │   │   │   ├── fs.ts
│   │   │   │   ├── views.ts
│   │   │   │   ├── pipeline.ts
│   │   │   │   └── events.ts
│   │   │   └── types/
│   │   └── package.json
│   │
│   └── app/                   # @terminalmind/app (Electron + React)
│       ├── src/
│       │   ├── main/          # Electron main process
│       │   ├── renderer/      # React renderer
│       │   │   ├── components/
│       │   │   │   ├── layout/         # Toolbar, ActivityBar, Sidebar, TabBar, PanelArea, StatusBar
│       │   │   │   ├── terminal/       # TerminalPane, InlineAiOverlay
│       │   │   │   ├── connections/    # ConnectionTree, ConnectionEditor
│       │   │   │   ├── sftp/           # SftpView (双栏文件管理器)
│       │   │   │   ├── ai/             # AiSidebarPanel, AiSettingsForm
│       │   │   │   ├── search/         # SearchPanel
│       │   │   │   ├── extensions/     # ExtensionsSidebarPanel, MarketplaceView
│       │   │   │   ├── settings/       # SettingsView
│       │   │   │   └── command-palette/ # CommandPalette
│       │   │   ├── hooks/
│       │   │   ├── stores/             # layout-store (LayoutState), connection-store, etc.
│       │   │   ├── styles/             # global.css (CSS 变量主题), theme.css
│       │   │   └── App.tsx
│       │   └── preload/
│       └── package.json
│
├── extensions/
│   ├── ext-terminal/          # 内置扩展：本地终端
│   ├── ext-ssh/               # 内置扩展：SSH
│   ├── ext-sftp/              # 内置扩展：SFTP
│   ├── ext-ai/                # 内置扩展：AI 命令生成
│   └── ext-connections/       # 内置扩展：连接管理
│
├── tools/
│   └── cli/                   # CLI 入口（headless 模式）
│
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
└── package.json
```

### 4.3 进程模型

```
┌─────────────────────────┐
│     Main Process         │
│  ┌───────────────────┐  │
│  │   Core CLI        │  │
│  │   Services        │  │
│  │   Extension Host  │  │
│  └───────────────────┘  │
├─────────────────────────┤
│   Renderer Process       │
│  ┌───────────────────┐  │
│  │   React GUI Shell │  │
│  │   xterm.js        │  │
│  └───────────────────┘  │
├─────────────────────────┤
│   Extension Workers      │  ← 第三方插件在隔离 Worker 中运行
│  ┌──────┐ ┌──────┐     │
│  │ext-a │ │ext-b │ ... │
│  └──────┘ └──────┘     │
└─────────────────────────┘
```

- **Main Process：** 运行 Core、Services、Extension Host。内置扩展在此进程直接执行（受信任）。
- **Renderer Process：** React GUI Shell，通过 IPC 与 Main Process 通信。
- **Extension Workers：** 第三方插件在独立 Worker 线程中运行，通过受限的 API 代理与主进程通信，崩溃不影响宿主。

---

## 5 Core CLI 层

### 5.1 CommandRegistry

所有功能以 Command 形式注册。每个 Command 是一个纯函数：

```typescript
interface Command<TArgs = unknown, TResult = unknown> {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly handler: (args: Readonly<TArgs>, ctx: CommandContext) => Promise<TResult>;
}

interface CommandContext {
  readonly services: ServiceContainer;
  readonly events: EventBus;
  readonly pipeline: PipelineEngine;
}
```

Commands 可通过 CLI 直接调用，也可通过 GUI 触发：

```bash
# CLI 模式
terminalmind exec ssh.connect --host 192.168.1.1 --user root
terminalmind exec ai.generate "列出当前目录下大于100MB的文件"
```

### 5.2 ServiceContainer（依赖注入）

基于 Token 的轻量 DI 容器，Service 通过接口注册，消费方通过 Token 获取：

```typescript
interface ServiceContainer {
  register<T>(token: ServiceToken<T>, factory: () => T): void;
  get<T>(token: ServiceToken<T>): T;
}
```

所有 Service 接口定义在 `@terminalmind/api`，实现在 `@terminalmind/services`，通过 DI 注入。测试时可替换为 Mock 实现。

### 5.3 EventBus

类型安全的发布/订阅事件总线：

```typescript
interface EventBus {
  emit<T extends EventType>(type: T, payload: Readonly<EventPayload<T>>): void;
  on<T extends EventType>(type: T, handler: (payload: Readonly<EventPayload<T>>) => void): Disposable;
}
```

事件类型通过 TypeScript 联合类型约束，Payload 均为 Readonly。

### 5.4 PipelineEngine

受 Unix Pipe 启发的组合引擎。命令输出可以作为下一个命令的输入：

```typescript
interface PipelineEngine {
  pipe<TIn, TOut>(steps: ReadonlyArray<PipelineStep<TIn, TOut>>): Pipeline<TIn, TOut>;
  execute<TIn, TOut>(pipeline: Pipeline<TIn, TOut>, input: TIn): Promise<TOut>;
}

interface PipelineStep<TIn, TOut> {
  readonly name: string;
  readonly transform: (input: Readonly<TIn>) => Promise<TOut>;
}
```

示例管道：自然语言 → AI 生成命令 → 用户确认 → 终端执行 → 输出格式化。

### 5.5 PermissionManager

插件权限声明与运行时检查：

```typescript
interface PermissionManager {
  check(extensionId: string, permission: Permission): boolean;
  request(extensionId: string, permissions: readonly Permission[]): Promise<PermissionGrant>;
}

type Permission =
  | 'terminal.execute'
  | 'connections.read'
  | 'connections.write'
  | 'fs.read'
  | 'fs.write'
  | 'ai.invoke'
  | 'network.outbound';
```

插件在 `package.json` 中声明所需权限，安装时用户确认。运行时越权调用直接拒绝。

---

## 6 Services 层

平台无关的业务逻辑。每个 Service 定义接口（在 api 包）+ 实现（在 services 包）。

### 6.1 TerminalService

```typescript
interface ITerminalService {
  create(options: Readonly<TerminalCreateOptions>): Promise<TerminalSession>;
  getSession(id: string): TerminalSession | undefined;
  listSessions(): readonly TerminalSession[];
  destroy(id: string): Promise<void>;
}

interface TerminalSession {
  readonly id: string;
  readonly title: string;
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData: Event<string>;
  onExit: Event<{ exitCode: number }>;
}
```

底层使用 `node-pty` 创建伪终端。TerminalService 只管理会话生命周期，不涉及 UI 渲染。

### 6.2 SSHService

```typescript
interface ISSHService {
  connect(config: Readonly<SSHConnectionConfig>): Promise<SSHSession>;
  disconnect(sessionId: string): Promise<void>;
  listSessions(): readonly SSHSession[];
}

interface SSHConnectionConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly auth: SSHAuthMethod;
  readonly jumpHosts?: readonly SSHConnectionConfig[];  // 多跳
  readonly keepAliveInterval?: number;
}

type SSHAuthMethod =
  | { readonly type: 'password'; readonly password: string }
  | { readonly type: 'publicKey'; readonly privateKeyPath: string; readonly passphrase?: string }
  | { readonly type: 'agent' };

interface SSHSession {
  readonly id: string;
  readonly config: Readonly<SSHConnectionConfig>;
  readonly status: 'connecting' | 'connected' | 'disconnected';
  shell(): Promise<TerminalSession>;
  exec(command: string): Promise<ExecResult>;
  forwardPort(local: number, remote: number): Promise<PortForward>;
  sftp(): Promise<ISFTPChannel>;
}
```

底层使用 `ssh2` 库。支持密码、密钥、SSH Agent 三种认证方式。多跳跳板机通过递归连接实现。

### 6.3 SFTPService

```typescript
// 首选入口：通过 SSHSession.sftp() 获取 SFTP 通道
// ISFTPService 是内部服务层实现，由 SSHSession.sftp() 委托调用，不直接暴露给插件 API
interface ISFTPService {
  openChannel(sshSessionId: string): Promise<SFTPChannel>;
}

interface SFTPChannel {
  readonly sessionId: string;
  list(remotePath: string): Promise<readonly FileEntry[]>;
  upload(localPath: string, remotePath: string, options?: TransferOptions): Promise<TransferResult>;
  download(remotePath: string, localPath: string, options?: TransferOptions): Promise<TransferResult>;
  mkdir(remotePath: string): Promise<void>;
  rm(remotePath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  stat(remotePath: string): Promise<FileStat>;
  onProgress: Event<TransferProgress>;
}

interface TransferOptions {
  readonly concurrency?: number;
  readonly chunkSize?: number;
  readonly overwrite?: boolean;
}
```

SFTP 通道从 SSHSession 获取，实现文件浏览、上传、下载、删除等操作。传输支持进度回调和并发控制。

### 6.4 AIProviderService

灵活的 Provider 机制，不与具体模型绑定：

```typescript
interface IAIProviderService {
  registerProvider(provider: AIProvider): Disposable;
  listProviders(): readonly AIProviderInfo[];
  getActiveProvider(): AIProvider;
  setActiveProvider(providerId: string): void;
  complete(request: Readonly<AICompletionRequest>): Promise<AICompletionResponse>;
  stream(request: Readonly<AICompletionRequest>): AsyncIterable<AIStreamChunk>;
}

interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly models: readonly AIModelInfo[];
  complete(request: Readonly<AICompletionRequest>): Promise<AICompletionResponse>;
  stream(request: Readonly<AICompletionRequest>): AsyncIterable<AIStreamChunk>;
}

interface AICompletionRequest {
  readonly model: string;
  readonly messages: readonly AIMessage[];
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly context?: AICommandContext;  // 当前终端环境信息
}

interface AICommandContext {
  readonly shell: string;              // bash / zsh / powershell
  readonly os: string;                 // linux / darwin / win32
  readonly cwd: string;
  readonly recentCommands?: readonly string[];
  readonly recentOutput?: string;
}
```

**OpenRouter Provider（默认）：**

```typescript
interface OpenRouterProviderConfig {
  readonly apiKey: string;
  readonly baseUrl: string;           // https://openrouter.ai/api/v1
  readonly defaultModel: string;       // 用户可切换
}
```

OpenRouter 作为默认 Provider 接入。Provider 机制允许插件注册新的 Provider（如直连 OpenAI、Claude、本地 Ollama 等）。

### 6.5 ConnectionStore

连接配置持久化：

```typescript
interface IConnectionStore {
  list(): Promise<readonly ConnectionProfile[]>;
  get(id: string): Promise<ConnectionProfile | undefined>;
  save(profile: Readonly<ConnectionProfile>): Promise<void>;
  remove(id: string): Promise<void>;
  import(source: string, format: ImportFormat): Promise<readonly ConnectionProfile[]>;
  export(ids: readonly string[], format: 'json'): Promise<string>;
}

// Phase 2 仅实现 'json'，Phase 5 扩展 'mobaxterm' | 'putty'
type ImportFormat = 'json' | 'mobaxterm' | 'putty';

interface ConnectionProfile {
  readonly id: string;
  readonly name: string;
  readonly type: 'ssh' | 'local';
  readonly group?: string;             // 分组/文件夹
  readonly tags?: readonly string[];
  readonly sshConfig?: Readonly<SSHConnectionConfig>;
  readonly terminalConfig?: Readonly<TerminalCreateOptions>;
  readonly createdAt: number;
  readonly updatedAt: number;
}
```

数据存储在用户配置目录（`~/.terminalmind/connections.json`），敏感信息（密码、密钥密码）通过系统 Keychain（macOS Keychain / Windows Credential Manager / libsecret）加密存储。

### 6.6 ConfigService

分层配置系统：

```typescript
interface IConfigService {
  get<T>(key: string, defaultValue: T): T;
  set(key: string, value: unknown): Promise<void>;
  onChange(key: string, handler: (value: unknown) => void): Disposable;
}
```

配置优先级：命令行参数 > 项目级配置 > 用户级配置 > 默认值。

---

## 7 Extension API

### 7.1 扩展清单

每个扩展通过 `package.json` 声明：

```json
{
  "name": "ext-ssh",
  "displayName": "SSH Connections",
  "version": "1.0.0",
  "terminalmind": {
    "entry": "./dist/index.js",
    "activationEvents": ["onCommand:ssh.*", "onView:ssh-connections"],
    "permissions": [
      "connections.read",
      "connections.write",
      "terminal.execute",
      "network.outbound"
    ],
    "contributes": {
      "commands": [],
      "views": [],
      "menus": [],
      "keybindings": [],
      "configuration": []
    }
  }
}
```

### 7.2 扩展入口

```typescript
import type { ExtensionContext, TerminalMindAPI } from '@terminalmind/api';

export function activate(ctx: ExtensionContext, api: TerminalMindAPI): void {
  // 注册命令
  ctx.subscriptions.push(
    api.commands.register('ssh.connect', async (args) => { ... })
  );

  // 注册视图
  ctx.subscriptions.push(
    api.views.registerSidebarView('ssh-connections', SSHConnectionsViewProvider)
  );

  // 监听事件
  ctx.subscriptions.push(
    api.events.on('terminal.created', (session) => { ... })
  );
}

export function deactivate(): void { }
```

### 7.3 API 命名空间

完整命名空间愿景如下。Phase 1 最小子集见 §13 分期规划。

| 命名空间 | 职责 |
|---|---|
| `commands` | 注册/执行命令 |
| `terminal` | 创建/管理终端会话 |
| `connections` | 连接配置 CRUD |
| `ai` | 调用 AI、注册 Provider |
| `fs` | 本地和远程文件操作 |
| `views` | 注册侧边栏视图、面板、状态栏项 |
| `pipeline` | 注册管道步骤、组合管道 |
| `events` | 订阅全局事件 |
| `config` | 读写配置 |
| `window` | 通知、对话框、快速选择 |

---

## 8 内置扩展

### 8.1 ext-terminal

本地终端管理。注册命令：`terminal.new`、`terminal.split`、`terminal.close`。提供多标签管理、分屏、Shell 选择。

### 8.2 ext-ssh

SSH 连接管理。注册侧边栏视图显示连接树，支持：
- 连接/断开
- 多标签 SSH Shell
- 端口转发管理
- SSH 隧道
- 多跳跳板机配置

### 8.3 ext-sftp

文件传输管理。在 SSH 连接基础上提供：
- 双面板文件浏览器（本地 + 远程）
- 拖拽上传/下载
- 传输队列与进度
- 文件编辑（下载 → 调用系统默认外部编辑器打开 → 监听文件变更 → 自动回传上传。不内置编辑器。）

### 8.4 ext-ai

AI 命令生成。提供两种交互模式：

**模式 A：终端内联**
- 用户在终端输入 `? <自然语言描述>`（可配置前缀）
- AI 返回命令，终端内显示预览
- 用户按 Enter 确认执行，或按 Esc 取消
- 上下文感知：自动注入当前 Shell 类型、OS、工作目录

**模式 B：AI 侧边栏**
- 独立对话面板，支持多轮对话
- 可解释命令、分析错误输出、生成脚本
- 一键发送命令到指定终端
- 支持选中终端输出发送给 AI 分析

**共享能力：**
- Provider 切换（OpenRouter 内的模型切换）
- 对话历史持久化
- 自定义 System Prompt / 角色预设

### 8.5 ext-connections

连接管理器。提供：
- 连接配置 CRUD（创建、编辑、删除、分组）
- 从 MobaXterm / PuTTY 导入（Phase 5，Phase 2 仅支持 JSON 导入导出）
- 快速连接（临时连接不保存）
- 连接搜索/过滤

---

## 9 GUI Shell

> 完整交互原型见 `docs/superpowers/specs/2026-03-25-terminalmind-ux-design.html`

### 9.1 布局系统

```
┌──────────────────────────────────────────────────────────┐
│  🔴 🟡 🟢      [ 🔍 Command Palette...  Ctrl+Shift+P ] │  Toolbar (38px)
├──────┬───────────┬───────────────────────────────────────┤
│      │           │ [Tab1] [Tab2] [Tab3]          [× ]   │  Tab Bar (35px)
│ Act  │  Sidebar  ├──────────────────────────────────────┤
│ Bar  │           │                                      │
│      │  260px    │           Main View                  │
│ 48px │  ~320px   │                                      │
│      │           │  Terminal / SFTP / Marketplace        │
│ ◈ ◈  │  动态切换  │           / Settings                 │
│ ◈ ◈  │           ├──────────────────────────────────────┤
│ ◈    │           │ [AI Chat] [Output] [Problems ③]  ▾  │  Panel (260px, 可折叠)
│ ─    │           │  对话 / 日志 / 告警                    │
│ ◈    │           │                                      │
├──────┴───────────┴──────────────────────────────────────┤
│ ⚡ SSH Connected │ bash │ UTF-8     claude-4-sonnet  82% │  Status Bar (24px)
└──────────────────────────────────────────────────────────┘
```

#### Toolbar（顶部标题栏，38px）

- **Traffic Lights**（macOS 风格窗口控制按钮）：位于窗口最顶部左侧，红/黄/绿 = 关闭/最小化/最大化
- **Command Palette 搜索框**：居中显示，点击或 `Ctrl+Shift+P` 打开命令面板
- 标题栏区域可拖拽移动窗口（`-webkit-app-region: drag`）

#### Activity Bar（左侧活动栏，48px）

点击图标切换侧边栏面板和主视图，完整映射关系：

| 图标 | 面板 ID | 侧边栏内容 | 主视图 | 侧边栏宽度 |
|------|---------|-----------|--------|-----------|
| `dns` | connections | 连接树（分组 → 连接项，状态点 + IP） | Terminal | 260px |
| `folder` | sftp | SFTP 会话列表 | SFTP 双栏文件管理器 | 200px |
| `search` | search | 搜索输入 + 正则/大小写过滤 + 匹配结果 | Terminal（不变） | 260px |
| `smart_toy` | ai | AI 对话侧边栏（多轮对话 + 模型切换） | Terminal（不变） | 320px |
| `extension` | extensions | **隐藏侧边栏** | Marketplace 扩展市场 | — |
| `settings` | settings | **隐藏侧边栏** | Settings 设置页 | — |

底部 spacer 将 Settings 图标推到活动栏最下方。当前活动项左侧有 2px 蓝色指示条。

#### Sidebar（侧边栏，动态宽度）

根据 Activity Bar 选择在 4 个面板间切换（Extensions / Settings 时整个侧边栏隐藏）：

- **Connections Panel**：树形分组视图（Production / Staging / Local），连接项显示状态点（绿=已连接、灰=断开、红=错误）+ 图标 + 名称 + IP。Header 带新建/刷新/更多按钮
- **SFTP Panel**：SFTP 会话列表，显示连接状态
- **Search Panel**：搜索输入框 + 过滤按钮（正则 `.*` / 大小写 `Aa` / 全词匹配 `W`）+ 按终端分组的匹配结果，高亮命中关键词
- **AI Panel**：完整 AI 对话界面（消息列表 + 代码块 + 发送到终端按钮 + 底部输入栏 + 模型选择下拉）

面板切换时侧边栏宽度平滑过渡（`transition: width 0.2s`）。

#### Main View（主内容区，4 种互斥视图）

| 视图 | 触发面板 | 内容结构 |
|------|---------|---------|
| **Terminal** | connections / search / ai | Tab Bar + Terminal Panes + Bottom Panel |
| **SFTP** | sftp | Tab Bar + 双栏文件管理器（Local ↔ Remote）+ 传输状态栏 |
| **Marketplace** | extensions | 搜索框 + 标签过滤 + 扩展卡片网格（6 列自适应） |
| **Settings** | settings | 设置导航栏（200px）+ 设置内容区（分 section 布局） |

**Terminal View 详细结构：**

- **Tab Bar（35px）：** 多标签，可切换/关闭。图标区分类型：SSH 绿色 `terminal` / Local 蓝色 `laptop` / SFTP 橙色 `folder_shared`。活动标签底部有 1px 蓝色指示线
- **Terminal Pane：** 每个标签对应独立终端面板（`xterm.js` 渲染）。使用 JetBrains Mono 等宽字体，深色背景
- **AI Inline Overlay：** 终端内输入 `? <自然语言>` 时弹出 AI 建议浮层，显示生成的命令，Enter 执行 / Tab 编辑 / Esc 取消

**SFTP View 详细结构：**

- 左面板（LOCAL）：本地文件列表，Header 显示蓝色 LOCAL 标签 + 路径
- 右面板（REMOTE）：远程文件列表，Header 显示绿色 REMOTE 标签 + 路径
- 中间：上传（→）/ 下载（←）按钮
- 底部：传输状态栏（进度条 + 速度 + ETA）

#### Bottom Panel（底部面板，260px，可折叠）

3 个子标签页，带右侧折叠/关闭按钮：

| 标签 | 内容 |
|------|------|
| **AI Chat** | 对话式 AI 助手，支持代码块渲染、"Send to Terminal" 按钮、模型选择、消息历史 |
| **Output** | 系统日志（带时间戳）：连接状态、Shell 检测、扩展加载、SFTP 传输、告警 |
| **Problems** | 问题列表：磁盘告警（黄色 warning）、连接超时（红色 error）、证书过期（黄色 warning） |

折叠时面板高度收缩到 32px（仅显示标签栏）。

#### Status Bar（底部状态栏，24px）

根据当前活动主视图切换状态信息：

| 主视图 | 左侧 | 右侧 |
|--------|------|------|
| Terminal | SSH 连接状态 + Shell 类型 + 编码 | AI 模型 + CPU 占用 + 磁盘占用 |
| SFTP | SFTP 连接状态 + 传输数 | 传输速度 |
| Marketplace | 已安装扩展数 | 可用更新数 |
| Settings | "Settings" 标签 | — |

### 9.2 交互系统

#### Command Palette（命令面板）

- **触发方式：** 点击 Toolbar 搜索框 / `Ctrl+Shift+P`
- **行为：** 模态覆盖层 + 毛玻璃背景，输入框自动聚焦
- **搜索过滤：** 实时过滤命令列表，匹配命令名称
- **键盘导航：** `↑/↓` 选择 → `Enter` 执行 → `Esc` 关闭
- **命令项：** 图标 + 命令标签 + 快捷键/分类标签

预置命令包括：SSH 连接/断开/端口转发、SFTP 打开、AI 切换、面板控制、扩展市场、设置、终端新建/分屏、主题切换、配置导入等。

#### New Connection 对话框

- **触发方式：** Connections 侧边栏 "+" 按钮 / `Ctrl+N` / Command Palette
- **表单字段：** 连接名称、分组（下拉）、Host + Port（双列）、用户名、认证方式（密码/密钥/SSH Agent 三选一 Tab 切换）、私钥路径（含浏览按钮）、跳板机（下拉选择已有连接）
- **底部操作：** 测试连接 / 取消 / 保存并连接

#### 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+P` | 打开/关闭 Command Palette |
| `Ctrl+N` | 新建连接对话框 |
| `Ctrl+L` | 切换到 AI 侧边栏 |
| `Ctrl+J` | 展开/折叠底部面板 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+1` ~ `Ctrl+6` | 快速切换活动栏面板（Connections → Settings） |
| `Esc` | 关闭当前覆盖层（Command Palette / 对话框） |

#### 连接树交互

- 点击连接项 → 高亮选中 + 自动切换到对应终端标签
- 分组 Header 可折叠/展开
- 连接状态实时更新（通过 EventBus 事件驱动）

### 9.3 组件架构

GUI Shell 内部为纯 React 组件，通过 IPC Bridge 调用 Main Process 的 Extension API：

```
React Component → useTerminalMindAPI() hook → IPC Bridge → Main Process → Extension API → Service
```

组件不直接持有业务状态。通过 Zustand Store 管理 UI 状态（标签顺序、面板大小、活动面板等），业务状态通过事件订阅从 Main Process 同步。

主要 UI Store 状态：

```typescript
interface LayoutState {
  readonly activePanel: 'connections' | 'sftp' | 'search' | 'ai' | 'extensions' | 'settings';
  readonly activeTab: number;
  readonly activePanelTab: 'ai-chat' | 'output' | 'problems';
  readonly panelExpanded: boolean;
  readonly commandPaletteOpen: boolean;
  readonly newConnectionDialogOpen: boolean;
}
```

### 9.4 主题系统

内置暗色/亮色主题，支持插件注册自定义主题：

```typescript
interface Theme {
  readonly id: string;
  readonly name: string;
  readonly type: 'dark' | 'light';
  readonly colors: Readonly<ThemeColors>;
  readonly terminal: Readonly<TerminalTheme>;
}
```

默认暗色主题 CSS 变量定义（参见 UX 原型）：

| 变量 | 值 | 用途 |
|------|-----|------|
| `--bg-deep` | `#080b12` | 终端背景 |
| `--bg` | `#0d1117` | 基础背景（Toolbar/Activity Bar/Tab Bar） |
| `--bg-elevated` | `#161b22` | 浮起表面（Sidebar/Panel/Dialog） |
| `--surface` | `#1c2333` | 控件表面（输入框/卡片） |
| `--accent` | `#58a6ff` | 主强调色 |
| `--green` | `#3fb950` | SSH 连接/成功状态 |
| `--orange` | `#f0883e` | SFTP/警告 |
| `--red` | `#f85149` | 错误/关闭 |
| `--yellow` | `#e3b341` | 代码高亮/AI 命令 |
| `--font-mono` | JetBrains Mono | 终端/代码字体 |
| `--font-sans` | Noto Sans SC | UI 字体 |

---

## 10 插件市场

### 10.1 分发模型

基于 GitHub 的去中心化分发：

```
terminalmind-registry (GitHub Repo)
├── registry.json          # 插件索引
└── plugins/
    ├── ext-docker.json    # 每个插件一个元数据文件
    ├── ext-k8s.json
    └── ext-redis.json
```

每个插件元数据：

```json
{
  "name": "ext-docker",
  "displayName": "Docker Manager",
  "description": "Manage Docker containers from TerminalMind",
  "author": "username",
  "repository": "https://github.com/username/terminalmind-ext-docker",
  "releases": [
    {
      "version": "1.2.0",
      "asset": "https://github.com/.../releases/download/v1.2.0/ext-docker-1.2.0.tgz",
      "minEngineVersion": "0.5.0",
      "sha256": "abc123..."
    }
  ],
  "permissions": ["terminal.execute", "network.outbound"],
  "tags": ["docker", "container", "devops"]
}
```

### 10.2 应用内体验

- 搜索/浏览插件（从 registry.json 索引）
- 查看详情、权限声明、README
- 一键安装/卸载/更新
- 安装时展示权限确认对话框

### 10.3 插件生命周期

```
发现 → 下载 (.tgz) → 校验 (SHA256) → 解压 → 权限确认 → 安装 → 激活
```

插件包格式为标准 npm tgz。安装到 `~/.terminalmind/extensions/<name>/`。

---

## 11 数据模型

### 11.1 存储位置

```
~/.terminalmind/
├── config.json               # 用户配置
├── connections.json          # 连接配置（敏感信息引用 keychain）
├── ai/
│   ├── providers.json        # AI Provider 配置
│   └── history/              # 对话历史
├── extensions/               # 已安装插件
│   ├── ext-docker/
│   └── ext-k8s/
├── themes/                   # 自定义主题
├── keybindings.json          # 快捷键配置
└── logs/                     # 日志文件
```

### 11.2 安全

- 密码、API Key、私钥密码等敏感信息存储在系统 Keychain（`keytar` 库）
- 连接配置文件中只存储 Keychain 引用 ID，不存储明文
- 插件沙箱：第三方插件在 Worker 中运行，无法直接访问 Keychain

---

## 12 管道系统

管道是 TerminalMind 的组合机制（原则 4）。

### 12.1 内置管道示例

**AI 命令生成管道：**
```
用户输入(自然语言) 
  → ai.parse(提取意图) 
  → ai.generate(生成命令) 
  → user.confirm(用户确认) 
  → terminal.execute(执行命令)
  → output.format(格式化输出)
```

**批量 SSH 执行管道：**
```
connections.filter(tag='production')
  → ssh.connect(并行连接)
  → ssh.exec('df -h')
  → output.aggregate(汇总结果)
  → output.table(表格展示)
```

### 12.2 插件可扩展

插件可以注册新的 PipelineStep，插入到已有管道中，或创建全新管道。

---

## 13 分期规划

### Phase 1：核心骨架（MVP）

- Monorepo 搭建、构建工具链、CI
- Core CLI（CommandRegistry、DI、EventBus）
- Extension API 最小子集：`activate/deactivate` 生命周期、`commands.register`、`views.registerSidebarView`。内置扩展从第一天起使用此子集注册，后续 Phase 只扩充 API 表面积，不改变接入方式
- TerminalService + ext-terminal（本地多标签终端，作为首个内置扩展验证 API）
- GUI Shell 基础布局（Toolbar + Activity Bar + Sidebar + Tab Bar + Terminal + Bottom Panel + Status Bar）
- 交互系统（Command Palette、键盘快捷键）
- 基础暗色主题（CSS 变量体系）

**交付物：** 一个可以打开多标签本地终端的 Electron 应用。完整布局框架就位，内置扩展已走 Extension API 最小子集注册。

> **决策说明：** Phase 1 即建立扩展注册的唯一路径。Phase 4 的工作是补全 API 命名空间、加入 Worker 隔离和 PermissionManager 以支持第三方插件，而非重构内置扩展的接入方式。

### Phase 2：SSH & 文件传输

- SSHService + ext-ssh
- SFTPService + ext-sftp
- ConnectionStore + ext-connections
- 侧边栏 Connections Panel（分组连接树 + 状态指示）
- 侧边栏 SFTP Panel + SFTP 双栏文件管理器（Main View）
- New Connection 对话框

**交付物：** 可以管理 SSH 连接、远程终端、文件上传下载。Activity Bar 的 Connections/Files 面板可用。

### Phase 3：AI 集成

- AIProviderService + OpenRouter Provider
- ext-ai（终端 AI Inline Overlay + AI 侧边栏 Panel + Bottom Panel AI Chat）
- AI 上下文注入（Shell 类型、OS、CWD、最近命令）
- PipelineEngine + AI 命令生成管道
- 侧边栏 Search Panel（终端历史搜索 + 过滤）

**交付物：** 自然语言生成命令并执行，三种 AI 交互模式（Inline / Sidebar / Bottom Panel）。Activity Bar 的 AI/Search 面板可用。

### Phase 4：插件系统 & 市场

- Extension API 完整实现
- Extension Host（Worker 隔离）
- PermissionManager
- Marketplace Main View（搜索 + 标签过滤 + 扩展卡片网格 + Install/Installed 切换）
- GitHub Registry 机制
- 插件开发文档 & 脚手架

**交付物：** 第三方可以开发和分发插件。Activity Bar 的 Extensions 面板可用。

### Phase 5：打磨 & 发布

- 性能优化
- 快捷键系统完善
- 导入导出（MobaXterm / PuTTY 配置）
- 自动更新
- 安装包签名
- 文档站点

---

## 14 成功指标

- Core CLI 层 100% 可脱离 GUI 运行和测试
- 内置扩展与第三方插件使用完全相同的 API，无特权调用
- Services 层零 Electron 依赖（可在纯 Node.js 环境运行单元测试）
- AI 命令生成延迟 < 2s（取决于 Provider 响应速度）
- 应用冷启动 < 3s
- 第三方插件崩溃不影响主应用
