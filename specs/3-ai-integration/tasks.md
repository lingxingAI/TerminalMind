# AI 集成 — 任务清单

> 分支：3-ai-integration
> 创建日期：2026-03-25
> 总任务数：40

## 依赖图

```
Phase 1 初始化
  T001─T004 依赖/类型/IPC/Event 扩展
    │
Phase 2 AIProviderService + OpenRouter
  T005─T011 服务实现 + SSE + Secret + 单元测试
    │
Phase 3 PipelineEngine
  T012─T015 引擎替换 + AI 命令管道 + 测试
    │
Phase 4 ext-ai
  T016─T019 扩展包 + 命令注册 + 测试
    │
Phase 5 GUI 侧边栏
  T020─T024 AiSidebar + store + preload + IPC handler
    │
Phase 6 GUI 终端内联
  T025─T029 TerminalView 状态机 + 预览层 + 集成
    │
Phase 7 会话持久化 + 提供方 UI
  T030─T034 ConversationStore 接线 + 设置页 + 模型列表
    │
最终阶段
  T035─T040 Main 集成 + 样式 + 文档同步 + 全量测试
```

## Phase 1：初始化

**目标**：依赖与类型基线、IPC / Event 扩展

- [ ] T001 可选依赖评估与添加（如 `strip-ansi`、测试用 `msw`）— `packages/services/package.json`
- [ ] T002 将 `contracts/ai-service.ts`、`pipeline-engine.ts` 类型同步到 `packages/api` DTO — `packages/api/src/ipc/types.ts`
- [ ] T003 扩展 `Phase3IpcChannels` / `Phase3IpcEventChannels` — `packages/api/src/ipc/channels.ts`
- [ ] T004 扩展 `EventPayloadMap` / `EventType` 新增 `ai.*` 事件 — `packages/core/src/event-bus.ts`

## Phase 2：AIProviderService + OpenRouter Provider

**目标**：可注册提供方、完成非流式与流式补全

- [ ] T005 [US4] 实现 `IAIProviderService`（注册、激活、`complete`、`stream`）— `packages/services/src/ai/ai-provider-service.ts`
- [ ] T006 [US4] 实现 `OpenRouterProvider`（`POST /chat/completions`、错误映射）— `packages/services/src/ai/openrouter-provider.ts`
- [ ] T007 [US4] 实现 SSE 解析为 `AsyncIterable<AIStreamChunk>` — `packages/services/src/ai/sse-parser.ts`
- [ ] T008 [US4] OpenRouter `GET /models` 缓存与 `AIModelInfo` 映射 — `packages/services/src/ai/openrouter-provider.ts` 或 `model-catalog.ts`
- [ ] T009 [US4] API Key：`ISecretStore` 键 `ai:openrouter:apiKey` 读写封装 — `packages/services/src/ai/ai-secret.ts`
- [ ] T010 [US4] `AIProviderService` + `OpenRouterProvider` 单元测试（Mock fetch）— `packages/services/src/ai/__tests__/`
- [ ] T011 [US3] 实现 `ContextCollector` 装配 `AICommandContext` — `packages/services/src/ai/context-collector.ts`

## Phase 3：PipelineEngine 实现

**目标**：替换 Phase 1 桩；交付 AI 命令生成管道

- [ ] T012 [US5] 实现真实 `PipelineEngine.pipe` / `execute`（顺序、错误传播）— `packages/services/src/ai/pipeline/pipeline-engine.ts`
- [ ] T013 [US5] 在 `ServiceContainer` 注册替换原桩 — `packages/core` 或 `packages/app` 启动引导（按现有 DI 位置）
- [ ] T014 [US1] 实现内置步骤：`BuildEnrichedContext` → `BuildProviderRequest` → `CallAIProvider` → `ParseCommand` — `packages/services/src/ai/pipeline/ai-command-pipeline.ts`
- [ ] T015 [US5] `PipelineEngine` + 管道集成测试 — `packages/services/src/ai/pipeline/__tests__/`

## Phase 4：ext-ai 内置扩展

**目标**：与 `ext-terminal` 相同 API 路径注册命令与视图

- [ ] T016 [US2] 创建 `extensions/ext-ai` 包（`package.json`、`tsconfig`）— `extensions/ext-ai/`
- [ ] T017 [US2] `activate`：注册 `ai.openSidebar`、`ai.clearConversation`、`ai.sendToTerminal` 等 — `extensions/ext-ai/src/index.ts`
- [ ] T018 [US2] 注册侧边栏视图 `ai-chat` — `extensions/ext-ai/src/index.ts`
- [ ] T019 [US2] ext-ai 单元测试（Mock API）— `extensions/ext-ai/src/__tests__/index.test.ts`

## Phase 5：GUI — AI 侧边栏面板

**目标**：多轮对话、流式展示、发送命令到终端

- [ ] T020 [US2] Zustand `ai-store`（会话 id、消息草稿、流式缓冲）— `packages/app/src/renderer/src/stores/ai-store.ts`
- [ ] T021 [US2] `AiSidebarPanel` + `AiMessageList` 组件 — `packages/app/src/renderer/src/components/ai/`
- [ ] T022 [US2] 订阅 `Phase3IpcEventChannels` 更新流式消息 — `packages/app/src/renderer/src/components/ai/AiSidebarPanel.tsx`
- [ ] T023 [US2] 扩展 preload：`ai.*` 暴露 — `packages/app/src/preload/index.ts`
- [ ] T024 [US2] Main 注册 Phase 3 IPC handlers（complete/stream/generate）— `packages/app/src/main/ipc-handlers.ts`

## Phase 6：GUI — 终端内联模式

**目标**：`? ` 触发、预览、Enter/Esc

- [ ] T025 [US1] `TerminalView` 内联状态机（Normal / InlineAi）— `packages/app/src/renderer/src/components/terminal/TerminalView.tsx`
- [ ] T026 [US1] 覆盖层或独立缓冲渲染预览与流式文本 — `packages/app/src/renderer/src/components/terminal/InlineAiOverlay.tsx`（路径可调整）
- [ ] T027 [US1] 调用 `AI_GENERATE_COMMAND` 并处理错误提示 — `TerminalView` 或 hook
- [ ] T028 [US1] Enter 写入 PTY / Esc 取消 / 并发策略 — `TerminalView` 相关模块
- [ ] T029 [US1] 多标签切换时取消或挂起内联请求 — `TerminalView` + `ai-store` 协调

## Phase 7：会话历史 + 提供方管理 UI

**目标**：`ConversationStore` 接线、设置、模型选择

- [ ] T030 [US2] 实现文件系统 `ConversationStore`（`~/.terminalmind/ai/`）— `packages/services/src/ai/conversation-store.ts`
- [ ] T031 [US2] IPC：`AI_CONVERSATION_*` 与 store 打通 — `packages/app/src/main/ipc-handlers.ts`
- [ ] T032 [US4] `AiSettingsForm`：baseUrl、defaultModel、customSystemPrompt、includeRecentOutput — `packages/app/src/renderer/src/components/ai/AiSettingsForm.tsx`
- [ ] T033 [US4] 模型下拉与 `AI_LIST_MODELS` / 缓存降级 — `AiSettingsForm.tsx`
- [ ] T034 [US4] 提供方切换 UI 与 `AI_SET_ACTIVE_PROVIDER` — `AiSettingsForm.tsx`

## 最终阶段：Main 集成、样式与验证

- [ ] T035 应用启动注册 `OpenRouterProvider` 与默认设置种子 — `packages/app/src/main/index.ts` 或 bootstrap
- [ ] T036 活动栏图标与主题样式统一（暗色）— `packages/app/src/renderer/src/components/layout/ActivityBar.tsx` 等
- [ ] T037 [US3] 最近命令 / 输出环形缓冲与 `ContextCollector` 对接 `TerminalService` — `packages/services/src/terminal/` 或会话包装扩展
- [ ] T038 将 `specs/3-ai-integration/contracts` 与实现路径在 `packages/api` 注释交叉引用（可选）— `packages/api/src/ipc/types.ts`
- [ ] T039 E2E 或集成测试：侧边栏一轮对话 + 内联 `?` — `packages/app/e2e/` 或 Vitest 集成
- [ ] T040 `pnpm test` 全绿与手动验收清单（`quickstart.md`）— CI / 本地记录
