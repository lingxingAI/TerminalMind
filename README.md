<p align="center">
  <img src="docs/assets/logo-placeholder.svg" alt="TerminalMind" width="80" />
</p>

<h1 align="center">TerminalMind</h1>

<p align="center">
  <strong>CLI-First 智能终端，面向全栈开发者</strong>
</p>

<p align="center">
  <a href="#功能概览">功能</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#项目结构">结构</a> ·
  <a href="#插件开发">插件开发</a> ·
  <a href="#技术栈">技术栈</a> ·
  <a href="#设计原则">设计原则</a>
</p>

---

## 功能概览

| 功能 | 说明 |
|------|------|
| **本地终端** | 多标签本地 Shell（PowerShell / Bash / Zsh），分屏，Shell 选择器 |
| **SSH 远程连接** | 密码 / 密钥 / Agent 认证，多跳跳板机，端口转发，连接管理树 |
| **SFTP 文件传输** | 双面板文件浏览器，拖拽上传下载，传输队列与进度监控 |
| **AI 命令生成** | 终端内联模式（`? <自然语言>`）+ 侧边栏多轮对话，上下文感知 |
| **插件系统** | 完全开放的 Extension API（10 个命名空间），内置与第三方插件平等 |
| **插件市场** | 应用内搜索安装，GitHub Registry，权限声明与沙箱隔离 |

## 快速开始

### 环境要求

- **Node.js** >= 18
- **pnpm** >= 9
- **Git**
- Windows: Visual Studio Build Tools（用于编译 `node-pty`）
- macOS: Xcode Command Line Tools
- Linux: `build-essential`, `python3`

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/your-org/terminalmind.git
cd terminalmind

# 安装依赖
pnpm install

# 重建原生模块（node-pty）
pnpm rebuild:native

# 启动开发模式
pnpm dev
```

### 常用命令

```bash
pnpm dev            # 启动 Electron 开发模式（热更新）
pnpm build          # 构建所有包
pnpm test           # 运行全量测试（Vitest）
pnpm test:watch     # 测试监听模式
pnpm lint           # ESLint 检查
pnpm format         # Prettier 格式化
pnpm typecheck      # TypeScript 类型检查
```

### 打包发布

```bash
# Windows
pnpm --filter @terminalmind/app build:win

# macOS
pnpm --filter @terminalmind/app build:mac

# Linux
pnpm --filter @terminalmind/app build:linux
```

## 项目结构

```
terminalmind/
├── packages/
│   ├── core/           # Core CLI 层 — CommandRegistry, ServiceContainer, EventBus
│   ├── api/            # Extension API 类型定义 + IPC 契约
│   ├── services/       # 平台无关业务逻辑（不依赖 Electron）
│   │   ├── ai/         #   AIProviderService, OpenRouter, PipelineEngine
│   │   ├── ssh/        #   SSHService, SSHSession
│   │   ├── sftp/       #   SFTPChannel, TransferQueue
│   │   ├── connection/ #   ConnectionStore, SecretStore
│   │   ├── permissions/#   PermissionManager
│   │   ├── marketplace/#   RegistryClient, MarketplaceService
│   │   ├── extension-host/  # ExtensionHost, WorkerExtensionHost
│   │   └── extension-api/   # 10 命名空间实现 + API 工厂
│   └── app/            # Electron 应用（Main + Preload + Renderer）
│       ├── src/main/   #   主进程：IPC handlers, 服务初始化
│       ├── src/preload/ #  contextBridge 安全桥
│       └── src/renderer/#  React GUI Shell
├── extensions/
│   ├── ext-terminal/   # 内置：本地终端管理
│   ├── ext-ssh/        # 内置：SSH 连接
│   ├── ext-sftp/       # 内置：文件传输
│   ├── ext-connections/# 内置：连接管理器
│   └── ext-ai/         # 内置：AI 命令生成 + 对话
├── tools/
│   └── create-extension/ # 插件脚手架 CLI
├── specs/              # 各阶段规约、计划、任务清单
└── docs/               # 设计文档、插件开发文档
```

### 五层架构

```
┌─────────────────────────────────────────────┐
│              GUI Shell (React)              │  ← 渲染 + 交互，不含业务逻辑
├─────────────────────────────────────────────┤
│              Extensions                     │  ← 内置 + 第三方，平等 API
├─────────────────────────────────────────────┤
│            Extension API (10 ns)            │  ← commands / terminal / ai / fs / ...
├─────────────────────────────────────────────┤
│              Services                       │  ← 平台无关，可 CLI 独立测试
├─────────────────────────────────────────────┤
│              Core CLI                       │  ← DI / EventBus / Pipeline / Registry
└─────────────────────────────────────────────┘
```

## 插件开发

### 脚手架创建

```bash
node tools/create-extension my-extension
cd my-extension
pnpm install && pnpm build
```

### 插件入口

```typescript
import type { TerminalMindAPI } from '@terminalmind/api';

export function activate(
  ctx: { subscriptions: { dispose(): void }[] },
  api: TerminalMindAPI,
): void {
  ctx.subscriptions.push(
    api.commands.register('my-ext.greet', async () => {
      api.window.showNotification('Hello from my extension!');
    }),
  );
}

export function deactivate(): void {}
```

### Extension API 命名空间

| 命名空间 | 能力 |
|----------|------|
| `commands` | 注册 / 执行命令 |
| `terminal` | 创建 / 管理终端会话 |
| `connections` | 连接配置 CRUD |
| `ai` | 调用 AI 补全 / 流式 / 注册 Provider |
| `fs` | 本地文件读写 |
| `views` | 注册侧边栏 / 面板 / 状态栏视图 |
| `pipeline` | 注册管道步骤、组合执行 |
| `events` | 订阅全局事件 |
| `config` | 读写扩展配置 |
| `window` | 通知、Quick Pick、输入框 |

### 权限声明

在 `package.json` 的 `terminalmind.permissions` 中声明：

| 权限 | 说明 |
|------|------|
| `terminal.execute` | 执行终端命令 |
| `connections.read` | 读取连接配置 |
| `connections.write` | 修改连接配置 |
| `fs.read` | 读取本地文件 |
| `fs.write` | 写入本地文件 |
| `ai.invoke` | 调用 AI 功能 |
| `network.outbound` | 发起网络请求 |

第三方插件安装时用户需确认权限，运行时越权调用将被拒绝。内置扩展自动拥有所有权限。

详细文档参见 [docs/extensions/README.md](docs/extensions/README.md)。

## 技术栈

| 领域 | 选型 |
|------|------|
| 桌面框架 | Electron |
| 前端 | React 18 + Zustand |
| 语言 | TypeScript (strict) |
| 终端渲染 | xterm.js |
| SSH | ssh2 |
| 本地 PTY | node-pty |
| AI | OpenRouter (OpenAI 兼容 REST + SSE) |
| 构建 | electron-vite + electron-builder |
| 包管理 | pnpm workspaces (Monorepo) |
| 测试 | Vitest |
| 代码规范 | ESLint + Prettier |

## 设计原则

1. **Unix 命令哲学** — 每个模块做一件事并做好，功能通过组合完成
2. **CLI 优先** — 所有业务逻辑在 GUI 之下实现，GUI 是薄壳
3. **平台无关核心** — core / services 不依赖 Electron，可纯 Node.js 测试
4. **可组合管道化** — 功能通过 Pipeline 链式组合
5. **插件平等** — 内置功能与第三方使用完全相同的 Extension API
6. **CLI 单元测试纪律** — Service / Command / Pipeline 全部可脱离 GUI 测试
7. **类型安全与不可变数据** — TypeScript strict + Readonly + 事件驱动

## 测试

```bash
pnpm test
```

当前测试覆盖：

- **19 test files, 110 tests** — Core / Services / Extensions 全覆盖
- Services 层在纯 Node.js 环境运行（无需 Electron）
- 包含 CommandRegistry、EventBus、ServiceContainer、SSH、SFTP、Connection、AI、Pipeline、PermissionManager、ExtensionHost、Marketplace 等模块

## 开发路线

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | Core Skeleton MVP | ✅ |
| Phase 2 | SSH & 文件传输 | ✅ |
| Phase 3 | AI 集成 | ✅ |
| Phase 4 | 插件系统 & 市场 | ✅ |
| Phase 5 | 打磨 & 发布 | 🔜 |

## License

MIT
