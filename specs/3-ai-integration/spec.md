# AI 集成 — 功能规约

> 分支：3-ai-integration
> 创建日期：2026-03-25
> 状态：草稿

## 概述

AI 集成是 TerminalMind 的第三个里程碑。目标是在 Phase 1 核心骨架与 Phase 2 SSH/文件传输能力之上，引入统一的 AI 提供方抽象（`AIProviderService`）、OpenRouter 兼容实现、可组合的 `PipelineEngine`（替换 Phase 1 占位实现），以及内置扩展 `ext-ai`。本阶段交付两种交互模式：终端内联自然语言生成命令（`? <自然语言>` 预览后执行或取消）与侧边栏多轮 AI 对话面板；并支持将 Shell 类型、操作系统、当前工作目录、最近命令与可选最近输出注入到 AI 请求上下文。本阶段的核心价值在于让全栈开发者在不离开终端工作流的前提下，用自然语言生成可执行命令并获得可解释的 AI 辅助。

## 用户场景

### 参与者

| 参与者 | 描述 |
|---|---|
| 全栈开发者 | 在本地或 SSH 终端中工作，需要快速生成命令、理解错误与编排操作的主要用户 |
| 运维工程师 | 管理多环境、多 Shell，需要上下文感知的命令建议与对话记录的用户 |

### 用户故事

#### US1：终端内联 AI 命令生成（P1）

**作为**全栈开发者，**我想要**在终端中输入以 `? ` 开头的自然语言描述并让 AI 生成可执行命令，**以便**在不打开其他工具的情况下快速得到贴合当前环境的命令草案。

**验收场景：**

1. **场景**：触发内联模式
   - **假设** 用户焦点在当前终端会话且终端处于可输入状态
   - **当** 用户输入 `? ` 并继续输入自然语言后提交（按约定触发键，如 Enter 发起 AI 请求）
   - **则** 应用进入内联 AI 流程：向用户展示“正在生成”状态，并在完成后以可区分样式在终端区域展示生成的命令预览

2. **场景**：确认执行生成的命令
   - **假设** AI 已返回单条或多条候选命令，当前高亮为默认执行的一条
   - **当** 用户按下 Enter
   - **则** 该命令被写入终端输入流（或等价地提交给 PTY），按正常终端行为执行

3. **场景**：取消内联流程
   - **假设** 用户处于预览或流式输出过程中
   - **当** 用户按下 Esc
   - **则** 取消当前 AI 请求与预览状态，终端恢复为普通输入模式，不执行未确认的命令

4. **场景**：流式展示中间结果
   - **假设** 提供方支持流式补全
   - **当** AI 响应以 SSE 分片到达
   - **则** 终端内联 UI 逐步更新可见文本，直至完成或出错

5. **场景**：提供方或网络错误
   - **假设** API 密钥无效、配额耗尽或网络超时
   - **当** 请求失败
   - **则** 显示明确错误信息，用户可重试或退出内联模式而不破坏终端会话

#### US2：侧边栏 AI 对话（P1）

**作为**全栈开发者，**我想要**在独立侧边栏面板中进行多轮对话，**以便**解释命令、分析终端报错，并将认可的命令发送到当前终端。

**验收场景：**

1. **场景**：打开 AI 侧边栏
   - **假设** 用户已通过活动栏或命令面板打开 AI 视图
   - **当** 面板可见
   - **则** 显示对话消息列表、输入框、发送按钮及基础会话控制（清空、滚动）

2. **场景**：多轮对话
   - **假设** 用户已发送至少一条用户消息
   - **当** 用户继续发送后续问题
   - **则** 上下文按会话维度保留（在同一会话内），助手回复连贯且可引用前文

3. **场景**：流式渲染助手回复
   - **假设** 当前提供方支持流式输出
   - **当** 助手开始回复
   - **则** 侧边栏中消息内容随流式分片增量更新，完成后标记为完成状态

4. **场景**：将命令发送到终端
   - **假设** 助手回复中包含可执行命令块或用户选中了建议命令
   - **当** 用户执行“发送到终端”操作
   - **则** 当前活动终端获得该文本（具体为粘贴到输入行或等价交互），由用户决定是否按 Enter 执行

5. **场景**：切换活动终端后会话仍可用
   - **假设** 用户有多个终端标签
   - **当** 用户切换活动终端
   - **则** 侧边栏对话不丢失；新发送消息默认关联新的 `AICommandContext`（见 US3）

#### US3：AI 上下文感知（P1）

**作为**运维工程师，**我想要** AI 请求自动携带当前 Shell、操作系统、工作目录与最近命令等信息，**以便**获得与真实环境一致的命令建议。

**验收场景：**

1. **场景**：注入基础上下文
   - **假设** 活动终端会话可解析 Shell 类型、OS 与 CWD
   - **当** 发起任意 AI 补全请求（内联或侧边栏）
   - **则** `AICommandContext` 至少包含 `shell`、`os`、`cwd` 字段且值与当前活动终端一致

2. **场景**：最近命令历史
   - **假设** 终端模块维护了有限长度的最近命令环形缓冲
   - **当** 构建 `AICompletionRequest`
   - **则** `recentCommands` 包含最近 N 条（规约实现定 N，如 10）用户输入行（已剔除敏感掩码规则若适用）

3. **场景**：可选最近输出摘要
   - **假设** 用户开启“附带最近输出”选项或默认策略允许
   - **当** 构建上下文
   - **则** `recentOutput` 为截断后的最近终端输出文本，长度有上限，避免超大 payload

4. **场景**：SSH 远程终端上下文
   - **假设** 活动标签为 SSH 远程会话
   - **当** 构建上下文
   - **则** `cwd` 与 `shell` 反映远程会话状态（在可获取范围内）；`os` 可为远端推断或标注为远程会话类型

#### US4：AI 提供方管理（P2）

**作为**全栈开发者，**我想要**配置 API 密钥、选择模型与切换提供方，**以便**在不同账号或模型间切换而无需修改代码。

**验收场景：**

1. **场景**：注册与切换提供方
   - **假设** 至少注册了 `OpenRouter` 提供方
   - **当** 用户在设置中选择另一已注册提供方或模型
   - **则** `AIProviderService.setActiveProvider` / 模型选择生效，后续请求使用新配置

2. **场景**：安全存储 API Key
   - **假设** 用户首次输入 OpenRouter API Key
   - **当** 保存设置
   - **则** 密钥不明文写入普通 JSON 配置文件，使用与 Phase 2 一致的 Keychain 或等价安全存储

3. **场景**：列出模型
   - **假设** OpenRouter 可访问
   - **当** 用户打开模型下拉列表
   - **则** 展示可用模型列表（来自缓存或 `models` 接口/静态清单策略由实现选定），并显示当前选中的 `defaultModel`

4. **场景**：自定义系统提示词
   - **假设** 用户在设置中编辑系统提示词模板
   - **当** 发起补全
   - **则** 请求中的 `systemPrompt` 反映用户模板（含变量插值若实现）

#### US5：Pipeline 引擎与 AI 命令生成管道（P1）

**作为**扩展开发者，**我想要**通过 `PipelineEngine` 组合可复用的管道步骤生成命令，**以便**核心逻辑可测试、可替换并与 `CommandRegistry` 集成。

**验收场景：**

1. **场景**：管道执行顺序
   - **假设** 定义了 `PipelineStep` 序列：上下文装配 → 构造消息 → 调用 `AIProviderService` → 解析与校验
   - **当** 调用 `PipelineEngine.execute`
   - **则** 按顺序异步执行，前一步输出作为后一步输入，最终返回结构化命令生成结果

2. **场景**：替换 Phase 1 占位实现
   - **假设** Phase 1 `PipelineEngine` 仅为桩实现
   - **当** Phase 3 合并后
   - **则** `CommandContext.pipeline` 注入真实 `PipelineEngine`，已有调用点行为符合新语义（或提供适配层）

3. **场景**：失败与可观测性
   - **假设** 某一步抛出异常或返回错误结果
   - **当** 执行管道
   - **则** 错误向上传播为可识别错误类型，EventBus 可选发出 `ai.pipelineError`（见数据模型），UI 能展示原因

4. **场景**：内置 AI 命令生成管道可被 ext-ai 调用
   - **假设** ext-ai 已激活
   - **当** 执行自然语言生成命令流程
   - **则** 该流程通过注册命令或内部服务调用同一管道实现，而非重复实现 OpenRouter 调用逻辑

## 功能需求

| ID | 需求 | 优先级 | 验收标准 |
|---|---|---|---|
| FR-001 | 实现 `AIProviderService`：支持 `registerProvider`、`listProviders`、`getActiveProvider`、`setActiveProvider`、`complete`、`stream` | P1 | 可在纯 Node.js 环境对 Mock 提供方完成注册、切换与非流式/流式调用 |
| FR-002 | 定义 `AIProvider` 契约：`id`、`name`、`models`、`complete`、`stream` | P1 | TypeScript 契约与实现一致，模型列表可供 UI 消费 |
| FR-003 | 实现 `OpenRouterProvider`：`OpenRouterProviderConfig`（`apiKey`、`baseUrl`、`defaultModel`），请求走 OpenAI 兼容 `POST /v1/chat/completions` | P1 | 使用有效密钥可返回 `AICompletionResponse`；错误映射为统一错误类型 |
| FR-004 | OpenRouter 流式：`stream: true` 时解析 SSE 数据流为 `AIStreamChunk` 序列 | P1 | 分片内容与可选 `finish_reason` 正确迭代；中断时 AsyncIterable 结束或可取消 |
| FR-005 | OpenRouter 模型列表：支持通过 REST 获取或文档约定策略填充 `AIModelInfo[]` | P2 | UI 可选择模型；离线时有降级列表或缓存 |
| FR-006 | `AICompletionRequest` 支持 `model`、`messages`、`systemPrompt`、`temperature`、`maxTokens`、`context?: AICommandContext` | P1 | 请求对象不可变；缺失字段有合理默认值 |
| FR-007 | `AICommandContext` 包含 `shell`、`os`、`cwd`、`recentCommands?`、`recentOutput?` | P1 | 活动终端切换后上下文更新；字段来源可测试 |
| FR-008 | 实现 `PipelineEngine.pipe` 与 `PipelineEngine.execute`，替换 Phase 1 桩实现 | P1 | 多步管道单测覆盖顺序与错误传播 |
| FR-009 | 内置 AI 命令生成管道步骤：装配上下文、构造 `AIMessage[]`、调用 provider、解析命令文本与安全校验（基础字符/长度限制） | P1 | 对固定 Mock 响应可解析出命令字符串 |
| FR-010 | ext-ai 内置扩展：通过 Extension API 注册（与 ext-terminal / ext-ssh 相同路径）命令与侧边栏视图 | P1 | `activate` 中注册 `ai.*` 命令与 `ai-chat` 视图 |
| FR-011 | 终端内联模式：检测 `? ` 前缀与输入拦截策略，展示预览与 Enter/Esc 行为 | P1 | 集成测试或 E2E 脚本验证关键路径 |
| FR-012 | 侧边栏对话 UI：消息列表、输入区、流式更新、滚动与空状态 | P1 | 流式过程中不卡顿；完成后可完整复制文本 |
| FR-013 | `ConversationStore`：会话 CRUD、消息追加、按会话持久化 | P1 | 重启应用后会话可从磁盘恢复 |
| FR-014 | 持久化目录：使用 `~/.terminalmind/ai/` 存储会话与元数据（见 `data-model.md`） | P1 | 文件格式版本化，损坏时可降级为空存储并记录日志 |
| FR-015 | IPC 扩展：Phase 3 `ai:*` 请求/响应通道与事件通道（见 `contracts/ipc-channels.ts`） | P1 | Renderer 通过 preload 调用 Main 侧服务，无直接 `node` 暴露 |
| FR-016 | EventBus 扩展：`ai.*` 相关事件类型与载荷（见 `data-model.md`） | P2 | 订阅方可收到流式进度/完成/错误事件 |
| FR-017 | 设置 UI：API Key 安全保存、默认模型、`baseUrl` 可配置、自定义 `systemPrompt` | P2 | Keychain 不可用时行为与 Phase 2 降级策略一致 |
| FR-018 | 提供方切换：在设置中切换 `activeProviderId` 并即时影响新请求 | P2 | 进行中的请求不受影响或明确取消策略 |
| FR-019 | 将认可命令发送到活动终端：与 `TerminalService` / 会话 ID 绑定 | P1 | 多标签下命令进入当前活动会话输入 |
| FR-020 | 单元测试：`AIProviderService`、`OpenRouterProvider`（HTTP Mock）、`PipelineEngine`、解析步骤 | P1 | `pnpm test` 在纯 Node 环境通过相关用例 |

## 成功标准

| 标准 | 指标 | 目标值 |
|---|---|---|
| 命令生成延迟 | 非流式首字节至完整响应（局域网/良好网络） | P50 < 5 秒（视模型与负载而定，以可配置超时内完成为准） |
| 内联可用性 | 从输入 `? ` 到可预览命令的步骤数 | ≤ 2 步（输入 + 确认触发） |
| 上下文准确率 | 抽样测试中 `cwd` / `shell` 与活动终端一致率 | 100%（在可获取信息的会话类型下） |
| 架构一致性 | `ext-ai` 仅通过 Extension API 与 IPC 访问能力 | 无 Renderer 直连 OpenRouter |
| 管道可测试性 | `PipelineEngine` 核心逻辑可在无 Electron 环境测试 | 100% 覆盖管道单元测试不启动 Electron |
| 数据持久化 | 会话恢复 | 正常退出后重启，最近会话列表不丢失 |
| 用户体验 | 流式侧边栏不阻塞主线程交互 | 滚动与输入在流式期间仍响应 |

## 范围边界

### 包含

- `AIProviderService` 与 `OpenRouterProvider`（OpenAI 兼容 REST + SSE）
- `PipelineEngine` 真实实现与内置 AI 命令生成管道步骤
- `ext-ai`：终端内联模式 + 侧边栏对话模式
- `AICommandContext` 从活动终端注入（含最近命令与可选输出）
- `ConversationStore` 与 `~/.terminalmind/ai/` 持久化结构
- Phase 3 IPC 通道与 preload 桥接扩展
- EventBus `ai.*` 事件扩展
- 设置中的提供方/模型/API Key 管理（P2 项可与核心并行交付）

### 排除

- 插件市场与第三方扩展热加载（Phase 4）
- Extension Worker 隔离（Phase 4）
- 多模态输入（图片、语音）
- 自动无确认执行 AI 生成命令（必须经用户 Enter 确认内联预览）
- 云端同步与会话跨设备共享
- 细粒度角色权限与组织级密钥管理
- 非 OpenRouter 的其它云提供方官方 SDK（可后续以插件形式注册额外 `AIProvider`）

## 边界情况

- **API Key 缺失**：发起请求前检测并提示用户在设置中配置，不发送空密钥请求
- **流式中断**：网络断开或 SSE 异常结束时，UI 标记为“已中断”，允许重试
- **超大输出**：`recentOutput` 与消息正文在序列化前截断，防止 IPC payload 过大
- **并发请求**：同一会话内多次快速发送时，定义是否取消上一次或排队；默认策略需在实现中明确并写测试
- **终端无 CWD 信息**：本地 PTY 无法解析时，`cwd` 可为未知占位并提示用户
- **JSON 损坏**：`~/.terminalmind/ai/` 下文件损坏时安全降级为空并备份损坏文件
- **模型下线**：OpenRouter 返回 400/404 时提示更换模型
- **速率限制**：HTTP 429 时展示重试-after 或建议稍后再试
- **恶意命令建议**：内置基础校验（例如拒绝明显破坏性模式仅作警告，不代替用户判断），最终执行责任在用户确认

## 依赖

- Phase 1：Extension API、`TerminalService`、GUI Shell、`PipelineEngine` 注入点、EventBus、IPC Bridge
- Phase 2：`ISecretStore` / Keychain 用于保存 API Key（推荐复用）
- 网络访问：HTTPS 请求 OpenRouter（`https://openrouter.ai/api/v1` 默认）
- 可选：`fetch` 标准 API 或 Node 18+ 全局 fetch；SSE 解析可用原生流或轻量库（实现阶段选定）

## 假设

- OpenRouter 保持 OpenAI 兼容的 `chat/completions` 与 SSE 格式；若上游变更，适配层在 `OpenRouterProvider` 内吸收
- 用户已自行承担 OpenRouter 费用与合规责任；应用不代管计费
- 终端最近命令采集通过 PTY 输入回显或 shell 集成钩子实现，准确度为尽力而为，不保证 100% 解析所有 Shell 行为
- 内联模式基于 xterm.js 的输入钩子或叠加层实现，与现有 `TerminalView` 集成不重构整个终端栈
- 英文技术标识符（接口名、文件路径）在规约中保持与设计文档一致，中文描述面向产品与研发读者
