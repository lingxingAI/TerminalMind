<!--
## 同步影响报告

- **版本变更**：无（初始创建） → v1.0.0
- **已修改原则**：无（全部为新增）
- **新增章节**：
  - 序言
  - 设计原则（P1–P7，共 7 条）
  - 技术治理（技术栈约束、架构约束、测试纪律、代码规范）
  - 治理（修订程序、版本策略、合规审查）
  - 附录（术语表、相关文档）
- **移除章节**：无
- **需要更新的模板**：
  - ✅ `.specify/templates/constitution-template.md`（已创建）
  - ✅ `.specify/templates/plan-template.md`（已创建，章程检查表包含 P1–P7）
  - ✅ `.specify/templates/spec-template.md`（已创建）
  - ✅ `.specify/templates/tasks-template.md`（已创建）
- **后续 TODO**：无
-->

# TerminalMind — 项目章程

> 版本 1.0.0 · 批准日期 2026-03-25 · 最后修订 2026-03-25

## 序言

TerminalMind 是一款跨平台（Windows / macOS / Linux）的 CLI-First 智能终端工具，面向全栈开发者。其核心差异在于 AI 能力和插件生态。本章程定义了项目不可协商的设计原则、技术治理规则和合规审查流程。所有架构决策、代码实现和功能规划 MUST 遵守本章程。

## 设计原则

所有架构决策和实现 MUST 遵守以下 7 条原则。原则按编号引用（P1–P7）。违反任何原则的实现 MUST 在代码审查中被拒绝，除非附有经审批的豁免说明。

### 原则 1：Unix 命令哲学

每个模块 MUST 只做一件事并做好。功能 MUST 通过组合小工具完成，禁止构建大而全的单体模块。Extension 粒度宁小勿大。

- 单个模块的公共 API 表面积 SHOULD 控制在 5 个以内的核心方法。
- 功能拆分 MUST 优先于功能聚合——当犹豫时，拆分为两个模块。
- **理由**：小模块更易测试、替换和组合，降低认知负荷。

### 原则 2：CLI 优先、GUI 与逻辑分离

所有业务逻辑 MUST 在 GUI 层之下实现。核心功能 MUST 能脱离 Electron 以 CLI 方式独立运行和测试。GUI Shell 是薄壳，只负责渲染和用户交互，MUST NOT 包含业务逻辑。

- React 组件 MUST 通过 Hook 调用 IPC Bridge，禁止直接调用 Service。
- 任何新功能 MUST 先以 CLI 命令实现，再包装为 GUI 交互。
- **理由**：确保核心逻辑可在 CI 中无头测试，降低 Electron 耦合风险。

### 原则 3：平台无关核心

`@terminalmind/core` 和 `@terminalmind/services` MUST NOT 依赖 Electron 特有 API。允许使用 Node.js 标准库和 npm 生态库（如 `ssh2`、`node-pty`），但涉及平台差异的部分 MUST 通过注入的 Adapter 接口隔离。

- 平台差异点（文件路径、密钥链、Shell 发现等）MUST 封装为 Adapter 接口。
- core 和 services 包 MUST 可在纯 Node.js 环境中运行单元测试，无需启动 Electron。
- **理由**：保证核心代码的可移植性和测试独立性。

### 原则 4：可组合管道化

功能之间 MUST 通过管道（Pipeline）组合。命令 MUST 支持链式执行，输出可以作为下一个命令的输入。AI 生成的命令 MUST 能直接进入执行管道。

- 每个 PipelineStep MUST 实现标准的 `transform(input) → output` 接口。
- 管道 MUST 支持中间拦截和用户确认断点。
- **理由**：管道化使功能可以灵活组合，而非硬编码集成路径。

### 原则 5：插件平等可扩展

内置功能（终端、SSH、SFTP、AI）MUST 以 Extension 形式实现，和第三方插件使用完全相同的 Extension API。MUST NOT 存在特权内部 API。

- 内置扩展 MUST 从 Phase 1 起通过 Extension API 注册。
- 任何 API 如果不对第三方开放，则内置扩展也 MUST NOT 使用。
- **理由**：保证 API 的完整性和公平性，内置扩展作为 API 的第一消费者验证其设计。

### 原则 6：CLI 单元测试纪律

每个 Service、Command、Pipeline Operator MUST 可以脱离 GUI 进行单元测试。测试用例 MUST 通过 CLI 模式执行，CI 中 MUST NOT 启动 Electron。

- 新增 Service 或 Command MUST 附带至少一个覆盖正常路径的单元测试。
- 测试 MUST 使用 Vitest 框架，可通过 `pnpm test` 执行。
- **理由**：保证快速反馈循环，CI 无需 GUI 环境即可验证功能正确性。

### 原则 7：类型安全与不可变数据

TypeScript strict 模式 MUST 全局启用。跨层数据传递 MUST 使用 `Readonly<T>` 类型。状态变更 MUST 通过事件驱动，MUST NOT 直接修改共享对象。配置和连接数据 MUST 使用不可变数据结构。

- `tsconfig.base.json` MUST 启用 `strict: true`。
- 所有接口参数和返回值 MUST 标记为 `Readonly<T>` 或 `readonly`。
- 状态共享 MUST 通过 EventBus 发布/订阅模式，禁止可变引用传递。
- **理由**：编译期捕获类型错误，不可变数据消除并发状态竞争。

## 技术治理

### 技术栈约束

以下技术选型为项目约束，变更 MUST 经过章程修订流程：

| 领域 | 选型 | 约束级别 |
|---|---|---|
| 桌面框架 | Electron | MUST（核心平台） |
| 前端框架 | React 18+ | MUST（GUI Shell） |
| 语言 | TypeScript (strict) | MUST（全项目） |
| 终端渲染 | xterm.js + xterm-addon-* | MUST（终端组件） |
| SSH | ssh2 (Node.js) | MUST（SSH 功能） |
| 本地 PTY | node-pty | MUST（本地终端） |
| 状态管理 | Zustand | SHOULD（可评估替代方案） |
| 构建工具 | Vite + electron-builder | SHOULD（可评估替代方案） |
| 包管理 | pnpm workspaces | MUST（Monorepo） |
| 测试 | Vitest | MUST（P6 强制） |
| 代码规范 | ESLint + Prettier | MUST（一致性） |

### 架构约束

- 五层架构（Core CLI → Services → Extension API → Extensions → GUI Shell）MUST 严格分层，每层只依赖其直接下层，MUST NOT 跨层调用。
- Monorepo 结构 MUST 使用 `packages/core`、`packages/services`、`packages/api`、`packages/app` 和 `extensions/` 组织。
- 进程模型：Main Process 运行 Core + Services + Extension Host；Renderer Process 运行 React GUI Shell；第三方插件在独立 Extension Worker 中运行。
- 数据 MUST 单向向下流动。

### 测试纪律

- 每个 Service 和 Command MUST 附带单元测试（P6）。
- 测试 MUST 在纯 Node.js 环境中运行，MUST NOT 依赖 Electron（P3 + P6）。
- CI 流水线 MUST 在合并前运行全量测试，无 Electron 启动。
- 测试框架：Vitest（与 Vite 原生集成）。

### 代码规范

- TypeScript strict 模式（P7）。
- ESLint + Prettier 统一代码风格。
- 所有接口参数 MUST 使用 `Readonly<T>`（P7）。
- 提交信息 SHOULD 遵循 Conventional Commits 格式。

## 治理

### 修订程序

1. 提出修订提案（Issue 或 PR），说明变更内容和理由。
2. 评估影响范围：识别受影响的原则、模板和已有实现。
3. 更新章程版本号（遵循版本策略）。
4. 执行一致性传播：更新所有依赖模板和文档。
5. 合并后生效。

### 版本策略

章程版本遵循语义版本规则：

- **MAJOR**：不向后兼容的治理变更——原则移除或根本性重定义。
- **MINOR**：新增原则/章节或实质性扩展已有指导。
- **PATCH**：澄清、措辞改进、拼写修正等非语义变更。

### 合规审查

- 每次代码审查 MUST 包含原则合规检查（至少覆盖 P2、P3、P5、P6、P7）。
- 每个 Phase 交付前 MUST 执行章程合规自查，使用 plan-template.md 中的章程检查表。
- 发现违规 MUST 记录为 Issue，标记为 `charter-violation`，在下一迭代中修复。

## 附录

### 术语表

| 术语 | 定义 |
|---|---|
| Extension | 通过 Extension API 注册的功能模块，内置和第三方使用相同 API |
| Pipeline | 受 Unix Pipe 启发的组合引擎，命令输出作为下一命令输入 |
| Service | 平台无关的业务逻辑单元，定义于 api 包、实现于 services 包 |
| Command | 通过 CommandRegistry 注册的纯函数，可通过 CLI 或 GUI 触发 |
| GUI Shell | React 薄壳，只负责渲染和用户交互 |
| Extension Host | 管理扩展生命周期的服务，运行于 Main Process |
| Extension Worker | 第三方插件的隔离运行环境（Worker 线程） |
| Adapter | 隔离平台差异的接口抽象 |

### 相关文档

- 产品需求文档：`docs/superpowers/specs/2026-03-25-terminalmind-design.md`
- 实现计划模板：`.specify/templates/plan-template.md`
- 功能规约模板：`.specify/templates/spec-template.md`
- 任务清单模板：`.specify/templates/tasks-template.md`
