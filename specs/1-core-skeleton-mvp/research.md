# 核心骨架 MVP — 研究报告

> 分支：1-core-skeleton-mvp
> 创建日期：2026-03-25

## R1：Electron + Vite 集成方案

### 决策：采用 electron-vite 作为构建工具

### 理由

`electron-vite` 提供了 main / preload / renderer 三目标的统一配置，内置了 Electron 特有的最佳实践（依赖外部化、原生模块处理、HMR），减少了大量手动配置的样板代码。对于新项目，它的约定优于配置的理念比手动组合 Vite 配置更可靠。

### 考虑的替代方案

- **手动 Vite 配置**：最大灵活性，但需要维护多个配置文件、手动处理 dev server + Electron 启动协调、原生模块外部化等问题。对于 Phase 1 的快速迭代来说成本过高。
- **Webpack（electron-forge）**：成熟但构建速度慢，与 Vitest 不原生集成，与章程中 Vite 的 SHOULD 约束不一致。

### 关键配置要点

- `electron.vite.config.ts` 定义三个构建目标：main（Node/Electron）、preload（沙箱受限）、renderer（React + xterm.js）
- `node-pty` 必须通过 `rollupOptions.external` 排除在 bundle 之外
- 使用 `@electron/rebuild` 确保原生模块匹配 Electron ABI
- `electron-builder` 配置 `asarUnpack` 以正确打包 `.node` 二进制文件
- 开发模式下 main 进程通过 `ELECTRON_RENDERER_URL` 加载 dev server

---

## R2：Electron IPC 类型安全通信

### 决策：共享类型契约 + contextBridge 暴露窄 API + 信封式路由

### 理由

在 `packages/api` 中定义 IPC 通道常量和请求/响应类型，main、preload、renderer 三方共享同一份类型定义，在编译期保证类型安全。preload 仅暴露命名方法（不暴露 raw `ipcRenderer`），main 侧使用中央路由分发到对应 Service。

### 考虑的替代方案

- **electron-trpc**：提供 tRPC 路由器级别的类型推断，但对于 Phase 1 的少量通道来说引入过重，且流式数据（PTY 输出）不适合 tRPC 的请求-响应模型。
- **EIPC**：Schema-first 方案，codegen 较重，Phase 1 不需要。
- **@electron-toolkit/typed-ipc**：轻量类型层，可考虑在 Phase 2 引入简化通道定义。

### 通信模式

| 场景 | 模式 | 说明 |
|------|------|------|
| 命令执行（请求-响应） | `invoke` / `handle` | 如 `terminal:create`、`terminal:destroy`、`command:execute` |
| 终端数据流（主→渲染） | `send` / `on` | 如 `pty-data`，高频单向推送 |
| 终端输入（渲染→主） | `send` / `on` | 如 `pty-input`，用户按键转发 |
| 终端尺寸变更 | `invoke` / `handle` | 如 `terminal:resize`，需确认成功 |
| 事件广播（主→渲染） | `send` / `on` | 如 `event:terminal.created`，EventBus 桥接 |

### PTY 流式数据优化

- 在 main 进程中对 `pty.onData` 输出进行合并缓冲（`setImmediate` 级别刷新）
- 每条 IPC 消息携带 `sessionId` 以支持多标签路由
- 发送前检查 `webContents.isDestroyed()` 避免窗口关闭后报错
- 可选使用 `MessagePort` 替代常规 IPC 以提升高吞吐场景性能

---

## R3：node-pty + xterm.js 集成

### 决策：Fit + Unicode11 为 Phase 1 必选 addon，WebGL 按需启用

### 理由

`@xterm/addon-fit` 是嵌入式终端的必需品，负责将终端行列数匹配到 DOM 容器尺寸。`@xterm/addon-unicode11` 改善国际化文本和 emoji 的宽度计算。WebGL addon 仅在画布渲染成为瓶颈时启用（通过运行时检测回退到 canvas）。

### Phase 1 Addon 清单

| Addon | 包含 | 理由 |
|-------|------|------|
| @xterm/addon-fit | 是 | 终端嵌入 Electron 面板必需，配合 ResizeObserver + PTY resize |
| @xterm/addon-unicode11 | 是 | 国际化文本支持，CJK 字符和 emoji 宽度 |
| @xterm/addon-webgl | 可选 | 大量输出场景的 GPU 加速渲染，运行时检测回退 |
| @xterm/addon-web-links | 否 | Phase 2+，nice-to-have |
| @xterm/addon-search | 否 | Phase 2+，搜索功能 |

### 数据流管道

```
输出路径：Shell → OS TTY → node-pty onData → [合并缓冲] → IPC send → preload → terminal.write()
输入路径：键盘/粘贴 → terminal.onData → IPC send → ipcMain → pty.write()
尺寸路径：ResizeObserver → addon-fit → terminal.cols/rows → IPC invoke → pty.resize(cols, rows)
```

### 性能策略

- main 进程中对 PTY 输出做 `setImmediate` 级合并，减少 IPC 消息频率
- 终端 `scrollback` 设置上限（默认 10000 行）限制内存
- 关闭标签时先移除 `onData` 监听，再 `kill` PTY 进程
- resize 事件做防抖（50ms），避免窗口拖拽期间风暴

---

## R4：跨平台 Shell 检测

### 决策：路径探测 + 平台 API + 用户覆盖

### 理由

不同平台的 Shell 发现机制不同。通过定义 `IShellDiscoveryAdapter` 接口（符合 P3 平台无关核心原则），每个平台提供具体实现。

### 平台策略

**Windows：**
- PowerShell 7：探测 `%ProgramFiles%\PowerShell\*\pwsh.exe`
- PowerShell 5：`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`
- cmd.exe：`process.env.COMSPEC`
- Git Bash：`%ProgramFiles%\Git\bin\bash.exe`
- WSL：通过 `wsl.exe -l -q` 枚举已安装发行版

**macOS：**
- 读取 `/etc/shells` 并过滤存在的可执行文件
- 默认使用 `process.env.SHELL`（通常为 zsh）
- 探测 Homebrew 路径下的 fish 等

**Linux：**
- 读取 `/etc/shells` + 存在性检查
- 默认使用 `process.env.SHELL`
- 回退到 `/bin/sh`

### 接口设计

```
IShellDiscoveryAdapter
  ├── discoverShells(): Promise<readonly ShellInfo[]>
  └── getDefaultShell(): Promise<ShellInfo>
```

每个平台实现此接口，通过 ServiceContainer 注入到 TerminalService。

---

## R5：轻量依赖注入容器设计

### 决策：自定义轻量 DI 容器，基于 `ServiceToken<T>` 泛型

### 理由

设计文档已定义了 ServiceContainer 接口（register + get），API 表面积极小（符合 P1 Unix 哲学）。使用 InversifyJS 等完整 DI 框架引入了不必要的装饰器和元数据反射依赖，与项目的轻量理念不匹配。

### 考虑的替代方案

- **InversifyJS**：功能完整但依赖 `reflect-metadata`、装饰器，增加构建复杂度
- **tsyringe**：微软出品但同样依赖装饰器
- **自定义实现**：约 50 行代码，基于 `Map<symbol, Factory>` + 泛型 Token，完全类型安全

### 实现要点

- `ServiceToken<T>` 使用 `symbol` + 泛型品牌类型确保类型安全
- 支持懒初始化（factory 在首次 `get` 时调用）
- 支持单例和瞬态两种生命周期
- 测试时通过重新 `register` 覆盖为 Mock 实现

---

## R6：Monorepo 包依赖关系

### 决策：严格分层的包依赖，符合五层架构

### 依赖方向

```
@terminalmind/app → @terminalmind/api → @terminalmind/services → @terminalmind/core
                  → extensions/ext-terminal → @terminalmind/api
```

### 关键约束

- `@terminalmind/core`：零外部依赖（仅 TypeScript 标准类型）
- `@terminalmind/services`：依赖 core + npm 生态库（node-pty），不依赖 Electron
- `@terminalmind/api`：依赖 core，定义接口类型，不含实现
- `@terminalmind/app`：唯一允许依赖 Electron 的包
- `extensions/ext-terminal`：仅依赖 `@terminalmind/api`，通过 Extension API 注册

### pnpm workspace 配置

- `pnpm-workspace.yaml` 声明 `packages/*` 和 `extensions/*`
- 包间引用使用 `workspace:*` 协议
- `node-pty` 作为 `@terminalmind/services` 的依赖，但通过 Adapter 接口隔离
