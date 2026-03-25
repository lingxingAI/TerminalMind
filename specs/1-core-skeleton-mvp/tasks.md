# 核心骨架 MVP — 任务清单

> 分支：1-core-skeleton-mvp
> 创建日期：2026-03-25
> 总任务数：50

## 依赖图

```
Phase 1 (初始化)
  │
  ▼
Phase 2 (基础层)
  │
  ├──────────────────────┐
  ▼                      ▼
Phase 3 (US6:CLI验证)   Phase 6 (US4:布局) ──► Phase 7 (US3:命令面板)
  │
  ▼
Phase 4 (US1+US5:终端)
  │
  ▼
Phase 5 (US2:Shell选择)
  │
  ▼
最终阶段 (收尾)
```

注意：Phase 6（US4）和 Phase 3（US6）可并行。Phase 4 依赖 Phase 3 完成（核心架构验证通过后再构建 GUI 终端）。

---

## Phase 1：初始化

**目标**：搭建 Monorepo 项目结构、构建工具链、代码规范基础设施

- [ ] T001 创建 Monorepo 根配置：`pnpm-workspace.yaml` 声明 `packages/*` 和 `extensions/*` in `pnpm-workspace.yaml`
- [ ] T002 [P] 创建根 `package.json`，配置 workspace scripts（dev、build、test、lint、format、typecheck） in `package.json`
- [ ] T003 [P] 创建 `tsconfig.base.json`，启用 strict: true，配置路径别名和共享编译选项 in `tsconfig.base.json`
- [ ] T004 [P] 配置 ESLint 9+ flat config 和 Prettier，添加 TypeScript 规则集 in `eslint.config.js` 和 `.prettierrc`
- [ ] T005 创建四个 workspace 包的 `package.json` 和 `tsconfig.json`，声明正确的包间依赖（core → 无外部依赖；services → core；api → core；app → api + electron） in `packages/core/package.json`、`packages/services/package.json`、`packages/api/package.json`、`packages/app/package.json`
- [ ] T006 创建 ext-terminal 内置扩展的 `package.json`，仅依赖 `@terminalmind/api` in `extensions/ext-terminal/package.json`
- [ ] T007 配置 electron-vite：创建 `electron.vite.config.ts`，定义 main/preload/renderer 三目标，将 `node-pty` 加入 `rollupOptions.external`，配置 React 插件 in `packages/app/electron.vite.config.ts`
- [ ] T008 配置 Vitest：创建根 `vitest.config.ts`，确保 core 和 services 包测试在纯 Node.js 运行（不加载 Electron） in `vitest.config.ts`

## Phase 2：基础层

**目标**：实现 Core CLI 基础设施和 Extension API 最小子集，为所有用户故事提供底层支撑

**检查点**：CommandRegistry、ServiceContainer、EventBus 可在纯 Node.js 中独立实例化和调用；Extension API 可注册扩展

- [ ] T009 实现 Disposable 和 Event 基础类型 in `packages/core/src/types/disposable.ts`
- [ ] T010 [P] 实现 ServiceToken 和 createServiceToken 工厂函数 in `packages/core/src/types/service-token.ts`
- [ ] T011 实现 ServiceContainer：基于 Map<symbol, Factory> 的轻量 DI 容器，支持 register/get、懒初始化、单例模式 in `packages/core/src/service-container.ts`
- [ ] T012 [P] 实现 CommandRegistry：命令注册（register）、查询（getCommand/getCommands/getCommandsByCategory）、执行（execute） in `packages/core/src/command-registry.ts`
- [ ] T013 [P] 实现 EventBus：类型安全的发布/订阅，支持 emit/on，订阅返回 Disposable，payload 强制 Readonly in `packages/core/src/event-bus.ts`
- [ ] T014 实现 PipelineEngine stub：满足 CommandContext 接口，pipe/execute 方法在 Phase 1 抛出 "Not implemented" in `packages/core/src/pipeline-engine-stub.ts`
- [ ] T015 在 api 包导出 Extension API 类型定义：ExtensionModule、ExtensionContext、TerminalMindAPI、CommandsNamespace、ViewsNamespace、EventsNamespace in `packages/api/src/index.ts` 和 `packages/api/src/namespaces/`
- [ ] T016 在 api 包导出 IPC Bridge 类型定义：IpcChannels、IpcEventChannels、IpcRequestMap、PreloadAPI 和 Window 类型增强 in `packages/api/src/ipc/`
- [ ] T017 实现 ExtensionHost：管理扩展生命周期（加载 manifest → 创建 ExtensionContext → 调用 activate → deactivate 时清理 subscriptions） in `packages/services/src/extension-host/extension-host.ts`
- [ ] T018 导出所有 Core 公共 API：ServiceContainer、CommandRegistry、EventBus、ServiceTokens、核心类型 in `packages/core/src/index.ts`

## Phase 3：CLI 模式独立运行（P1）

**故事目标**：验证 Core CLI 层可在纯 Node.js 环境中独立运行，无 Electron 依赖
**独立测试标准**：`pnpm --filter @terminalmind/core test` 和 `pnpm --filter @terminalmind/services test` 全部通过，运行环境为纯 Node.js

- [ ] T019 [US6] 编写 ServiceContainer 单元测试：注册/获取服务、Token 类型安全、Mock 替换、未注册 Token 报错 in `packages/core/src/__tests__/service-container.test.ts`
- [ ] T020 [P] [US6] 编写 CommandRegistry 单元测试：注册命令、按 ID 执行、查询分类、重复注册处理、执行不存在命令报错 in `packages/core/src/__tests__/command-registry.test.ts`
- [ ] T021 [P] [US6] 编写 EventBus 单元测试：发布/订阅、取消订阅（Disposable）、多订阅者、类型安全验证 in `packages/core/src/__tests__/event-bus.test.ts`
- [ ] T022 [US6] 编写 ExtensionHost 单元测试：加载扩展、activate 调用、commands.register 生效、deactivate 清理 subscriptions in `packages/services/src/extension-host/__tests__/extension-host.test.ts`

## Phase 4：多标签本地终端与交互体验（P1）

**故事目标**：用户可在 Electron 应用中打开多个本地终端标签，终端支持完整交互（输入输出、ANSI 颜色、滚动回看、自适应尺寸）
**独立测试标准**：应用启动后可新建终端标签、输入命令获得输出、切换标签状态保持、关闭标签释放资源

- [ ] T023 [US1] 实现 IShellDiscoveryAdapter 接口和当前平台的具体实现（Windows: PowerShell/cmd/Git Bash 探测；macOS/Linux: /etc/shells 解析） in `packages/services/src/terminal/shell-discovery-win32.ts`、`packages/services/src/terminal/shell-discovery-unix.ts`
- [ ] T024 [US1] 实现 TerminalService：基于 node-pty 的会话管理（create/getSession/listSessions/destroy），通过 DI 注入 IShellDiscoveryAdapter in `packages/services/src/terminal/terminal-service.ts`
- [ ] T025 [US1] 编写 TerminalService 单元测试：创建会话、列出会话、销毁会话、PTY 数据流回调、进程退出事件 in `packages/services/src/terminal/__tests__/terminal-service.test.ts`
- [ ] T026 [US1] 实现 ext-terminal 扩展入口：通过 activate() 注册 `terminal.new`、`terminal.close`、`terminal.list` 命令和侧边栏视图 in `extensions/ext-terminal/src/index.ts`
- [ ] T027 [US5] 创建 Electron main 进程入口：初始化 ServiceContainer、注册所有 Services、启动 ExtensionHost、创建 BrowserWindow in `packages/app/src/main/index.ts`
- [ ] T028 [US5] 实现 IPC Handler：在 main 进程注册所有 IpcChannels 的 handle/on 处理器，桥接到 TerminalService 和 CommandRegistry in `packages/app/src/main/ipc-handlers.ts`
- [ ] T029 [US5] 实现 Preload 脚本：通过 contextBridge 暴露 PreloadAPI（terminal、shell、commands、config、events） in `packages/app/src/preload/index.ts`
- [ ] T030 [US5] 创建 React 应用入口和基础 App 组件，挂载到 Electron renderer in `packages/app/src/renderer/index.html`、`packages/app/src/renderer/src/main.tsx`、`packages/app/src/renderer/src/App.tsx`
- [ ] T031 [US5] 实现 TerminalView 组件：集成 xterm.js + addon-fit + addon-unicode11，通过 window.api.terminal.onData 接收 PTY 输出，通过 onData 回调发送用户输入 in `packages/app/src/renderer/src/components/terminal/TerminalView.tsx`
- [ ] T032 [US5] 实现终端尺寸自适应：ResizeObserver 监听容器变化 → addon-fit 计算行列数 → window.api.terminal.resize 通知 main 进程 → PTY resize in `packages/app/src/renderer/src/hooks/useTerminalResize.ts`
- [ ] T033 [US1] 实现 TabBar 组件和 Zustand tab store：支持新建标签（创建终端会话 + 添加 TabState）、切换标签（isActive 切换 + TerminalView 显隐）、关闭标签（销毁会话 + 移除 TabState） in `packages/app/src/renderer/src/components/layout/TabBar.tsx` 和 `packages/app/src/renderer/src/stores/tab-store.ts`

## Phase 5：Shell 选择（P1）

**故事目标**：用户可在创建新终端时选择使用哪种 Shell，也可配置默认 Shell
**独立测试标准**：新建终端时可看到 Shell 选择列表、选择后终端使用对应 Shell 启动、默认 Shell 配置生效

- [ ] T034 [US2] 实现 ConfigService（Phase 1 简化版）：基于 JSON 文件的 get/set/onChange，存储路径为 `~/.terminalmind/config.json` in `packages/services/src/config/config-service.ts`
- [ ] T035 [US2] 编写 ConfigService 单元测试：读取默认值、设置并持久化、onChange 回调触发 in `packages/services/src/config/__tests__/config-service.test.ts`
- [ ] T036 [US2] 实现 Shell 选择 UI：在新建终端时展示已发现的 Shell 列表（从 window.api.shell.discover 获取），用户选择后传入 TerminalCreateOptions.shell in `packages/app/src/renderer/src/components/terminal/ShellSelector.tsx`
- [ ] T037 [US2] 在 main 进程 IPC handler 中注册 Shell 相关通道（shell:discover、shell:getDefault），在 ConfigService 中添加 `terminal.defaultShell` 配置项 in `packages/app/src/main/ipc-handlers.ts`（更新）

## Phase 6：VS Code 风格布局（P2）

**故事目标**：应用具备完整的 VS Code 风格布局，包含活动栏、侧边栏、标签栏、主工作区、底部面板和状态栏
**独立测试标准**：所有布局区域正确渲染；活动栏点击切换侧边栏视图；侧边栏和面板可折叠/展开；布局尺寸可拖拽调整

- [ ] T038 [US4] 实现 Zustand layout store：管理 LayoutState（sidebarVisible、sidebarWidth、panelVisible、panelHeight、activeActivityBarItem、activeSidebarView） in `packages/app/src/renderer/src/stores/layout-store.ts`
- [ ] T039 [P] [US4] 实现 ActivityBar 组件：左侧垂直图标栏，渲染固定项（终端、文件、搜索、AI、扩展、设置），点击切换 activeSidebarView in `packages/app/src/renderer/src/components/layout/ActivityBar.tsx`
- [ ] T040 [P] [US4] 实现 Sidebar 组件：左面板容器，根据 activeSidebarView 渲染对应视图内容（Phase 1 仅终端列表有内容，其余显示占位） in `packages/app/src/renderer/src/components/layout/Sidebar.tsx`
- [ ] T041 [P] [US4] 实现 PanelArea 组件：底部可折叠面板区域，含面板标签栏（AI Chat / Output / Problems 占位）和面板体 in `packages/app/src/renderer/src/components/layout/PanelArea.tsx`
- [ ] T042 [P] [US4] 实现 StatusBar 组件：底部状态栏，显示当前终端信息（Shell 类型、编码）和右侧系统状态 in `packages/app/src/renderer/src/components/layout/StatusBar.tsx`
- [ ] T043 [US4] 实现 Toolbar 组件：顶部工具栏，含窗口控制按钮（macOS traffic lights 适配）和命令面板搜索框入口 in `packages/app/src/renderer/src/components/layout/Toolbar.tsx`
- [ ] T044 [US4] 实现暗色主题系统：定义 CSS 变量（参考 UX 原型的 ThemeColors），创建 theme provider，应用到所有组件 in `packages/app/src/renderer/src/styles/theme.css` 和 `packages/app/src/renderer/src/styles/global.css`
- [ ] T045 [US4] 重构 App.tsx 为完整布局：组合 Toolbar + ActivityBar + Sidebar + MainArea（TabBar + TerminalContainer） + PanelArea + StatusBar，支持拖拽调整侧边栏宽度和面板高度 in `packages/app/src/renderer/src/App.tsx`（更新）

## Phase 7：命令面板快速操作（P2）

**故事目标**：用户可通过 Ctrl+Shift+P 唤出命令面板，输入关键词搜索已注册命令并执行
**独立测试标准**：快捷键唤出面板；输入文本实时过滤命令列表；选择命令后执行并关闭面板；Esc 关闭面板

- [ ] T046 [US3] 实现命令面板 Overlay 组件：浮层容器、搜索输入框、命令列表、键盘导航（上下箭头选中、Enter 执行、Esc 关闭） in `packages/app/src/renderer/src/components/command-palette/CommandPalette.tsx`
- [ ] T047 [US3] 实现模糊搜索逻辑：从 window.api.commands.list 获取命令列表，按输入关键词模糊匹配 title 和 category in `packages/app/src/renderer/src/components/command-palette/use-fuzzy-search.ts`
- [ ] T048 [US3] 注册全局键盘快捷键 Ctrl+Shift+P（macOS Cmd+Shift+P），切换命令面板显示状态 in `packages/app/src/renderer/src/hooks/useGlobalKeybindings.ts`
- [ ] T049 [US3] 集成命令面板到 App 布局：面板作为 Overlay 层渲染在布局之上，背景半透明遮罩 in `packages/app/src/renderer/src/App.tsx`（更新）

## 最终阶段：收尾与横切关注点

**目标**：跨故事集成验证、构建打包、文档

- [ ] T050 配置 electron-builder 打包：创建 `electron-builder.yml`，配置 NSIS（Windows）、DMG（macOS）、AppImage（Linux）输出，设置 `asarUnpack` 包含 node-pty 原生模块 in `packages/app/electron-builder.yml`

---

## 并行执行建议

### 可并行组

| 组 | 任务 | 前置条件 |
|---|---|---|
| G1 | T002, T003, T004 | T001 完成 |
| G2 | T010, T012, T013 | T009 完成 |
| G3 | T015, T016 | T018 完成 |
| G4 | T019, T020, T021 | Phase 2 完成 |
| G5 | Phase 3 (US6) 和 Phase 6 (US4) | Phase 2 完成（可并行推进） |
| G6 | T039, T040, T041, T042 | T038 完成 |
| G7 | T023 和 T026 | Phase 2 完成 |

### 关键路径

```
T001 → T005 → T009 → T011 → T017 → T022 → T024 → T027 → T031 → T033 → T050
```

此路径从项目初始化到最终打包，是整体时间线的瓶颈。

## 实施策略

- **MVP 范围**：Phase 1（初始化）+ Phase 2（基础层）+ Phase 3（US6：CLI 验证）+ Phase 4（US1+US5：多标签终端）。完成这 4 个阶段即可交付一个可运行的多标签终端应用，核心架构验证通过。
- **增量交付**：
  - **里程碑 1**（Phase 1-3）：Core CLI 可在纯 Node.js 运行和测试，ExtensionHost 可加载扩展 → 验证架构设计
  - **里程碑 2**（Phase 4）：Electron 应用可打开多标签本地终端 → 首个端到端功能
  - **里程碑 3**（Phase 5-7）：Shell 选择 + 完整布局 + 命令面板 → 完整 MVP
- **风险缓解**：
  - node-pty 原生模块编译风险：T007 中尽早配置 `@electron/rebuild`，CI 中验证三平台构建
  - IPC 性能风险：T028 中实现 PTY 数据合并缓冲，避免高频小消息
  - 跨平台 Shell 检测风险：T023 中先实现当前开发平台，其余平台通过 Adapter 接口延迟适配
