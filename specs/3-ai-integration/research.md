# AI 集成 — 技术研究

> 分支：3-ai-integration
> 创建日期：2026-03-25

## 研究主题

### 1. OpenRouter API 集成（REST、SSE、模型列表）

**问题**：如何通过 OpenRouter 完成非流式与流式对话补全？模型列表如何获取？

**结论**：

- OpenRouter 提供 OpenAI 兼容的 REST API。聊天补全端点为 `POST {baseUrl}/chat/completions`，默认 `baseUrl` 为 `https://openrouter.ai/api/v1`。
- 请求体字段与 OpenAI 一致：`model`、`messages`（`role` + `content`）、`temperature`、`max_tokens`（或 `max_completion_tokens`，以实现阶段与上游对齐为准）、`stream`。
- 非流式响应 JSON 中 `choices[0].message.content` 为主要文本结果；需处理 `usage`、`id` 等元数据并映射到 `AICompletionResponse`。
- 流式响应在 `stream: true` 时，`Content-Type` 为 `text/event-stream`。每个 SSE 事件以 `data: ` 开头；`data: [DONE]` 表示结束。中间数据行为 JSON 行，解析 `choices[0].delta.content` 增量拼接为助手文本。
- 取消流式：使用 `AbortController` 中止 `fetch`，或在 Node 侧销毁 response body 流，确保 AsyncIterable 结束且底层 socket 释放。
- 模型列表：OpenRouter 提供 `GET /models`（OpenAI 兼容风格）返回可用模型数组；实现可缓存到磁盘（`~/.terminalmind/ai/models-cache.json`）并设置 TTL，离线时使用上次缓存或内置降级列表。
- 鉴权：请求头 `Authorization: Bearer <apiKey>`，以及 OpenRouter 推荐的 `HTTP-Referer` / `X-Title`（可选，用于排行榜统计）。

### 2. 终端内联模式（xterm.js 输入拦截）

**问题**：如何在不影响普通终端输入的前提下实现 `? ` 前缀的内联 AI 流程？

**结论**：

- 方案 A：`onData` 层拦截：在现有 `TerminalView` 向 PTY 写入前插入一层状态机。状态 `Normal` 下照常转发；检测到行首或缓冲区模式下的 `?` + 空格 进入 `InlineAi` 状态，将后续字符写入独立缓冲区而非 PTY，直到用户触发“提交 AI”（如 Enter）或 Esc 取消。
- 方案 B：使用 xterm.js 的 `attachCustomKeyEventHandler` 与叠加 DOM 层：内联预览显示在终端下方的覆盖层或 `xterm-addon-webgl` 之外的 HTML 层，减少与 PTY 字节流混淆。
- 推荐组合：逻辑状态机 + 轻量覆盖层展示流式/预览文本，避免将 AI 流式输出直接写入 PTY（防止污染 shell 历史）。确认执行时再将最终命令字符串一次性 `write` 到 PTY 或模拟粘贴。
- 与多标签：内联状态绑定 `sessionId`，切换标签时暂停或取消未完成的内联请求（策略需在实现中固定并写入测试）。
- SSH 会话：与本地 PTY 使用同一 `TerminalView` 抽象时，内联逻辑仅依赖 `sessionId` 与上下文采集，不区分本地/远程传输路径。

### 3. 终端与侧边栏的流式渲染

**问题**：如何在 UI 中高性能地增量渲染 SSE 文本？

**结论**：

- React 侧使用受控状态存储当前流式消息的 `content` 字符串；每收到 `AIStreamChunk` 追加文本。为减少重渲染频率，可对追加做 `requestAnimationFrame` 合并或短节流（如 16–32ms）。
- 终端内联覆盖层：优先纯文本；若需代码高亮，可在完成后一次性高亮，流式过程中保持纯文本以降低成本。
- 侧边栏：消息列表底部自动滚动，仅在用户未手动上滚时执行 `scrollIntoView`。
- 错误与完成：根据 chunk 中 `done` 或解析到 `[DONE]` 结束迭代；`finish_reason` 可用于 UI 标记。

### 4. PipelineEngine 设计模式

**问题**：如何定义可组合的 `PipelineStep` 并保证类型安全与可测试性？

**结论**：

- `pipe(steps)` 构建不可变 `Pipeline` 对象，仅保存步骤数组引用；`execute(pipeline, input)` 顺序 `await` 每一步的 `transform`，输出作为下一步输入。
- TypeScript 层面完整泛型链在运行期会擦除，可采用“同构管道”模式：`PipelineStep<unknown, unknown>[]` + 每步运行时断言，或固定若干预定义管道工厂（如 `createAiCommandPipeline(deps)`）以换取更强类型。
- 横切关注点：日志、计时、EventBus `emit` 可在 `execute` 包装器中统一处理，避免每步重复代码。
- 与 `CommandContext`：`CommandContext.pipeline` 注入单例 `PipelineEngine`，命令处理器只传入输入 DTO 与管道标识符。

### 5. 会话历史持久化

**问题**：对话记录如何存储、版本迁移与并发写入？

**结论**：

- 每会话一个文件或单文件多会话：推荐 `conversations/{sessionId}.json` 便于并发写入隔离；元数据索引 `index.json` 列出 `sessionId`、`title`、`updatedAt`。
- 消息结构：`ConversationMessage` 含 `id`、`role`、`content`、`createdAt`、`model?`、`tokenUsage?`（可选）。
- 写入策略：防抖批量写入（如 500ms）减少磁盘抖动；应用退出时 `flush`。
- 版本字段：`version: 1` 在根对象；未来迁移脚本根据版本升级。
- 隐私：明文落盘，假设为本地用户目录；若需额外保护可复用加密 vault（与 Phase 2 降级方案对齐），本阶段默认明文 JSON。

### 6. 从活动终端注入 AI 上下文

**问题**：`shell`、`os`、`cwd`、`recentCommands`、`recentOutput` 从哪里来？

**结论**：

- `shell`：来自创建终端时的 `TerminalCreateOptions.shell` 或会话元数据；若无法解析则存 `"unknown"`。
- `os`：Node `process.platform` 与架构可作为主机 OS；SSH 远端可暴露 `uname` 结果缓存（异步获取，首次请求可能延迟），或在规约中标注为“主机 OS + remote 标记”。
- `cwd`：本地 PTY 通过 OSC 序列或集成 shell 钩子获取；若无钩子，可在 Main 进程维护“最后已知 cwd”状态（由 shell 插件或 prompt 解析更新）。最小实现：从 `TerminalService` 会话对象读取已跟踪字段。
- `recentCommands`：从发送到 PTY 的输入行中提取以换行结束的非空行，环形缓冲长度 N（建议 10–20）。
- `recentOutput`：从终端环形缓冲读取最近 M 字符（建议 2k–8k），在构建请求前截断并去除 ANSI（可选依赖 `strip-ansi` 类库）。
