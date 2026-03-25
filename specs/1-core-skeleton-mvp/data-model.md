# 核心骨架 MVP — 数据模型

> 分支：1-core-skeleton-mvp
> 创建日期：2026-03-25

本文档定义 Phase 1 涉及的所有关键实体及其关系。实体按架构层级组织。

---

## Core 层实体

### Disposable

资源释放的通用接口。所有订阅、注册操作返回 Disposable 以支持清理。

| 字段 | 类型 | 说明 |
|------|------|------|
| dispose | `() => void` | 释放资源的方法 |

### ServiceToken\<T\>

依赖注入的类型安全标识符。每个 Service 通过唯一的 Token 注册和获取。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | `symbol` | 全局唯一标识 |
| _brand | `T`（幽灵类型） | 编译期类型关联，运行时不存在 |

### Command\<TArgs, TResult\>

通过 CommandRegistry 注册的可执行单元。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | `string` | 全局唯一命令 ID，如 `terminal.new` |
| title | `string` | 用户可见的命令名称 |
| category | `string` | 命令分类，用于命令面板分组 |
| handler | `(args: Readonly<TArgs>, ctx: CommandContext) => Promise<TResult>` | 命令执行逻辑 |

### CommandContext

命令执行时注入的上下文。

| 字段 | 类型 | 说明 |
|------|------|------|
| services | `ServiceContainer` | 依赖注入容器 |
| events | `EventBus` | 事件总线 |
| pipeline | `PipelineEngine` | 管道引擎（Phase 1 为 stub） |

### EventType（联合类型）

Phase 1 支持的事件类型枚举。

| 值 | Payload 类型 | 说明 |
|----|-------------|------|
| `terminal.created` | `{ sessionId: string; title: string }` | 终端会话已创建 |
| `terminal.destroyed` | `{ sessionId: string }` | 终端会话已销毁 |
| `terminal.titleChanged` | `{ sessionId: string; title: string }` | 终端标题变更 |
| `terminal.exited` | `{ sessionId: string; exitCode: number }` | 终端进程退出 |
| `extension.activated` | `{ extensionId: string }` | 扩展已激活 |
| `extension.deactivated` | `{ extensionId: string }` | 扩展已停用 |
| `command.registered` | `{ commandId: string }` | 命令已注册 |

---

## Services 层实体

### ShellInfo

描述一个可用的 Shell 程序。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | `string` | 唯一标识，如 `powershell-7`、`bash` |
| name | `string` | 显示名称，如 `PowerShell 7`、`Bash` |
| path | `string` | 可执行文件的绝对路径 |
| args | `readonly string[]` | 启动参数（可选） |
| platform | `'win32' \| 'darwin' \| 'linux'` | 适用平台 |
| isDefault | `boolean` | 是否为当前平台默认 Shell |

### TerminalCreateOptions

创建终端会话的参数。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| shell | `string` | 否 | Shell 可执行文件路径，不指定则使用默认 |
| args | `readonly string[]` | 否 | Shell 启动参数 |
| cwd | `string` | 否 | 初始工作目录 |
| env | `Readonly<Record<string, string>>` | 否 | 额外环境变量 |
| cols | `number` | 否 | 初始列数（默认 80） |
| rows | `number` | 否 | 初始行数（默认 24） |
| title | `string` | 否 | 自定义标签标题 |

### TerminalSession

活跃的终端会话实例。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | `string` | 唯一会话 ID（UUID） |
| title | `string` | 当前标签标题 |
| pid | `number` | PTY 进程 ID |
| shellPath | `string` | 当前使用的 Shell 路径 |
| cwd | `string` | 当前工作目录（最后已知） |
| status | `'running' \| 'exited'` | 会话状态 |
| exitCode | `number \| undefined` | 退出码（仅 exited 状态） |
| createdAt | `number` | 创建时间戳 |

**方法：**

| 方法 | 签名 | 说明 |
|------|------|------|
| write | `(data: string) => void` | 向 PTY 写入数据 |
| resize | `(cols: number, rows: number) => void` | 调整终端尺寸 |
| onData | `Event<string>` | 接收 PTY 输出数据 |
| onExit | `Event<{ exitCode: number }>` | 进程退出事件 |

### ConfigEntry（Phase 1 简化版）

基础配置项。

| 字段 | 类型 | 说明 |
|------|------|------|
| key | `string` | 配置路径，如 `terminal.defaultShell` |
| value | `unknown` | 配置值 |
| scope | `'default' \| 'user'` | 配置级别 |

---

## API 层实体

### ExtensionManifest

扩展声明信息，来自 `package.json` 的 `terminalmind` 字段。

| 字段 | 类型 | 说明 |
|------|------|------|
| name | `string` | 扩展标识，如 `ext-terminal` |
| displayName | `string` | 显示名称 |
| version | `string` | 语义版本号 |
| entry | `string` | 入口文件路径 |
| activationEvents | `readonly string[]` | 激活事件列表 |
| contributes | `ExtensionContributions` | 贡献声明 |

### ExtensionContributions（Phase 1 子集）

| 字段 | 类型 | 说明 |
|------|------|------|
| commands | `readonly CommandContribution[]` | 注册的命令 |
| views | `readonly ViewContribution[]` | 注册的视图 |

### CommandContribution

| 字段 | 类型 | 说明 |
|------|------|------|
| command | `string` | 命令 ID |
| title | `string` | 命令标题 |
| category | `string` | 命令分类 |

### ViewContribution

| 字段 | 类型 | 说明 |
|------|------|------|
| id | `string` | 视图 ID |
| name | `string` | 视图名称 |
| icon | `string` | Material Symbols 图标名称 |
| location | `'sidebar' \| 'panel'` | 视图位置 |

### ExtensionContext

扩展生命周期上下文，在 `activate` 时传入。

| 字段 | 类型 | 说明 |
|------|------|------|
| extensionId | `string` | 扩展标识 |
| subscriptions | `Disposable[]` | 可变数组，扩展注册的所有订阅。deactivate 时自动清理 |

---

## App 层实体（UI 状态）

### TabState

标签页 UI 状态。由 Zustand store 管理。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | `string` | 标签唯一 ID |
| terminalSessionId | `string` | 关联的终端会话 ID |
| title | `string` | 标签显示标题 |
| isActive | `boolean` | 是否为当前活动标签 |
| icon | `string` | 标签图标 |
| iconColor | `string` | 图标颜色 CSS 值 |

### LayoutState

布局 UI 状态。

| 字段 | 类型 | 说明 |
|------|------|------|
| sidebarVisible | `boolean` | 侧边栏是否可见 |
| sidebarWidth | `number` | 侧边栏宽度（像素） |
| panelVisible | `boolean` | 底部面板是否可见 |
| panelHeight | `number` | 面板高度（像素） |
| activeActivityBarItem | `string` | 当前活动的活动栏项目 ID |
| activeSidebarView | `string` | 当前侧边栏视图 ID |

### ThemeColors（Phase 1 暗色主题）

主题色彩定义。Phase 1 仅内置一套暗色主题。

| 字段 | 类型 | 说明 |
|------|------|------|
| bgDeep | `string` | 最深背景色 |
| bg | `string` | 主背景色 |
| bgElevated | `string` | 浮层背景色 |
| surface | `string` | 组件表面色 |
| surfaceHover | `string` | 悬停表面色 |
| border | `string` | 边框色 |
| text | `string` | 主文本色 |
| textSecondary | `string` | 次要文本色 |
| textDim | `string` | 暗淡文本色 |
| accent | `string` | 强调色 |
| green | `string` | 成功/连接色 |
| red | `string` | 错误色 |
| orange | `string` | 警告色 |
| yellow | `string` | 命令高亮色 |

### TerminalTheme

终端特定的颜色映射。

| 字段 | 类型 | 说明 |
|------|------|------|
| foreground | `string` | 终端前景色 |
| background | `string` | 终端背景色 |
| cursor | `string` | 光标颜色 |
| cursorAccent | `string` | 光标文字颜色 |
| selectionBackground | `string` | 选中区域背景 |
| black / red / green / yellow / blue / magenta / cyan / white | `string` | ANSI 标准 8 色 |
| brightBlack / ... / brightWhite | `string` | ANSI 明亮 8 色 |

---

## 实体关系图

```
ExtensionManifest
  └── activates → ExtensionContext
       └── registers → Command (via api.commands.register)
                     → ViewContribution (via api.views.registerSidebarView)

Command
  └── executes with → CommandContext
       ├── ServiceContainer → ITerminalService
       ├── EventBus → EventType + EventPayload
       └── PipelineEngine (stub)

ITerminalService
  ├── creates → TerminalSession
  ├── uses → IShellDiscoveryAdapter → ShellInfo
  └── reads → ConfigEntry (terminal.defaultShell)

TerminalSession
  ├── mapped to → TabState (in Zustand store)
  └── emits → EventBus events (terminal.created, terminal.exited, ...)

TabState
  └── belongs to → LayoutState (UI layout context)

ThemeColors + TerminalTheme
  └── applied to → all UI components + xterm.js instance
```
