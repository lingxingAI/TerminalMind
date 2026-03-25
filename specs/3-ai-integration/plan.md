# AI 集成 — 实现计划

> 分支：3-ai-integration
> 创建日期：2026-03-25
> 状态：草稿

## 技术上下文

### 技术栈

| 领域 | 选型 | 理由 |
|---|---|---|
| AI 网关 | OpenRouter（OpenAI 兼容 REST + SSE） | 单 API 聚合多模型，降低接入成本 |
| HTTP | `fetch` + `AbortController` | Electron/Node 现代运行时内置能力，减少依赖 |
| 流式解析 | 手写 SSE 解析或轻量库 | 控制背压与取消，与 AsyncIterable 对齐 |
| UI | React 18+ + Zustand | Phase 1 已建立，侧边栏与终端视图一致 |
| 终端 | xterm.js | Phase 1 已集成，内联模式基于输入钩子/覆盖层 |
| 密钥存储 | keytar（复用 Phase 2） | 与连接密码一致的安全存储路径 |
| 持久化 | `~/.terminalmind/ai/*.json` | 与会话、设置分层文件结构一致 |

### 依赖项

- Phase 1、Phase 2 全部已有依赖
- 可选：`strip-ansi` 或等价工具用于 `recentOutput` 清洗（若实现需要）
- 实现阶段如需 HTTP Mock 测试，使用 Vitest + `msw` 或原生 Mock fetch

### 章程检查

| 原则 | 合规状态 | 说明 |
|---|---|---|
| P1: Unix 命令哲学 | ✅ | `AIProviderService`、`PipelineEngine`、`ConversationStore` 各司其职，可独立替换 |
| P2: CLI 优先 | ✅ | 核心逻辑在 `services` 层；GUI 仅通过 IPC / Extension 调用 |
| P3: 平台无关核心 | ✅ | Provider 与管道纯 TS，网络通过抽象 fetch；密钥存储走已有适配层 |
| P4: 可组合管道化 | ✅ | Phase 3 交付真实 `PipelineEngine`，AI 命令生成走注册管道步骤 |
| P5: 插件平等可扩展 | ✅ | `ext-ai` 与 `ext-terminal` / `ext-ssh` 相同 Extension API 注册路径 |
| P6: CLI 单元测试纪律 | ✅ | Provider、SSE 解析、Pipeline、ConversationStore 测试不启动 Electron |
| P7: 类型安全与不可变数据 | ✅ | 契约广泛使用 `Readonly` 与只读 DTO |

### 关卡评估

- [x] 所有原则检查通过（无 ❌）
- [x] 所有 NEEDS CLARIFICATION 已解决
- [x] 技术栈选型已确认

## Phase 0：研究

### 研究任务

1. OpenRouter `chat/completions` 与 SSE 响应格式、错误码映射
2. xterm.js 内联输入状态机与 PTY 数据路径隔离方案
3. 侧边栏与终端流式渲染节流策略
4. `PipelineEngine` 类型设计与测试钩子
5. `~/.terminalmind/ai/` 目录布局与版本迁移
6. 活动终端上下文采集（CWD、最近命令、输出缓冲）

### 研究结果

输出至 `research.md`。

## Phase 1：设计与契约

### 数据模型

输出至 `data-model.md`。核心实体：

- `AIMessage`、`AICommandContext`、`AICompletionRequest` / `Response` / `AIStreamChunk`
- `ConversationHistory`、`ConversationMessage`
- `PipelineStep`、`Pipeline`、AI 命令管道 DTO
- `EventPayloadMap` 扩展与 `~/.terminalmind/ai/` 存储布局

### 接口契约

输出至 `contracts/`。包含：

- `ai-service.ts` — `IAIProviderService`、`AIProvider`、`OpenRouterProviderConfig`、`ConversationStore`
- `pipeline-engine.ts` — `PipelineEngine`、内置步骤类型与 `AI_COMMAND_PIPELINE_ID`
- `ipc-channels.ts` — Phase 3 IPC 与事件通道

### 快速启动

输出至 `quickstart.md`。

## Phase 2：任务分解

输出至 `tasks.md`。
