# 核心骨架 MVP — 开发快速启动

> 分支：1-core-skeleton-mvp
> 创建日期：2026-03-25

## 前置条件

| 工具 | 版本要求 | 验证命令 |
|------|---------|---------|
| Node.js | 18+ (推荐 20 LTS) | `node --version` |
| pnpm | 9+ | `pnpm --version` |
| Git | 2.30+ | `git --version` |
| Python | 3.x (node-pty 编译需要) | `python3 --version` |
| C++ 编译工具链 | 见下方平台说明 | — |

### 平台编译工具

**Windows：**
- 安装 Visual Studio Build Tools（C++ 工作负载）或完整 Visual Studio
- 或运行 `npm install -g windows-build-tools`（需管理员权限）

**macOS：**
- 安装 Xcode Command Line Tools：`xcode-select --install`

**Linux (Debian/Ubuntu)：**
- `sudo apt install build-essential python3`

## 项目初始化

```bash
# 克隆仓库并切换到功能分支
git clone <repo-url> terminalmind
cd terminalmind
git checkout 1-core-skeleton-mvp

# 安装所有依赖（包括 workspace 内部链接）
pnpm install

# 重编译原生模块以匹配 Electron ABI
pnpm rebuild:native
```

## 项目结构

```
terminalmind/
├── packages/
│   ├── core/           # @terminalmind/core — CommandRegistry、DI、EventBus
│   ├── services/       # @terminalmind/services — TerminalService 等
│   ├── api/            # @terminalmind/api — Extension API 类型定义
│   └── app/            # @terminalmind/app — Electron + React GUI Shell
│       ├── src/main/          # Electron main 进程
│       ├── src/preload/       # Preload 脚本（IPC Bridge）
│       └── src/renderer/      # React 渲染进程
├── extensions/
│   └── ext-terminal/   # 内置扩展：本地终端
├── tools/
│   └── cli/            # CLI 入口（headless 模式）
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
└── electron.vite.config.ts
```

## 常用命令

### 开发

```bash
# 启动开发模式（含 HMR）
pnpm dev

# 仅构建 core + services（无 Electron）
pnpm --filter @terminalmind/core build
pnpm --filter @terminalmind/services build
```

### 测试

```bash
# 运行全量单元测试（纯 Node.js，无 Electron）
pnpm test

# 运行特定包的测试
pnpm --filter @terminalmind/core test
pnpm --filter @terminalmind/services test

# 监视模式
pnpm test:watch
```

### 构建与打包

```bash
# 生产构建
pnpm build

# 生成安装包（当前平台）
pnpm package
```

### 代码质量

```bash
# Lint 检查
pnpm lint

# 格式化
pnpm format

# 类型检查（全量）
pnpm typecheck
```

## 关键开发流程

### 添加新 Service

1. 在 `packages/api/src/` 中定义接口（如 `INewService`）
2. 创建 `ServiceToken`：`createServiceToken<INewService>('INewService')`
3. 在 `packages/services/src/` 中实现接口
4. 在 `packages/services/src/` 中编写单元测试
5. 在 DI 启动代码中注册：`container.register(ServiceTokens.NewService, () => new NewServiceImpl(...))`
6. 运行 `pnpm test` 验证（必须在纯 Node.js 中通过）

### 添加新 Command

1. 在扩展的 `activate()` 中通过 `api.commands.register()` 注册
2. 命令 ID 格式：`<category>.<action>`，如 `terminal.new`
3. handler 通过 `CommandContext` 获取 Service
4. 编写测试验证命令注册和执行

### 添加新 IPC 通道

1. 在 `contracts/ipc-bridge.ts`（实际位于 api 包）中声明通道常量和类型
2. 在 preload 脚本中暴露方法
3. 在 main 进程中注册 handler
4. 在 renderer 中通过 `window.api` 调用

## 架构规则速查

| 规则 | 检查方式 |
|------|---------|
| core/services 不依赖 Electron | `pnpm --filter @terminalmind/core test` 和 `pnpm --filter @terminalmind/services test` 在纯 Node.js 通过 |
| 所有接口参数 Readonly | TypeScript strict 编译无错误 |
| 扩展通过 Extension API 注册 | ext-terminal 不直接 import services 实现 |
| GUI 不含业务逻辑 | React 组件仅通过 `window.api` (IPC) 调用 |
| 每层只依赖直接下层 | pnpm workspace 依赖声明中无跨层引用 |

## 调试

### Main 进程调试

在 VS Code 中使用 Electron 调试配置，或启动时附加：

```bash
pnpm dev --inspect
```

### Renderer 进程调试

开发模式下按 `Ctrl+Shift+I`（macOS: `Cmd+Option+I`）打开 Chromium DevTools。

### 测试调试

```bash
# 以调试模式运行 Vitest
pnpm test -- --reporter=verbose
```
