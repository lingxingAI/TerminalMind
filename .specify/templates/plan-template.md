# [FEATURE_NAME] — 实现计划

> 分支：[BRANCH_NAME]
> 创建日期：[DATE]
> 状态：[STATUS]

## 技术上下文

### 技术栈

| 领域 | 选型 | 理由 |
|---|---|---|
| [DOMAIN] | [CHOICE] | [RATIONALE] |

### 依赖项

- [DEPENDENCY]: [VERSION] — [PURPOSE]

### 章程检查

根据项目章程（`.specify/memory/constitution.md`）验证：

| 原则 | 合规状态 | 说明 |
|---|---|---|
| P1: Unix 命令哲学 | ✅/⚠/❌ | [EXPLANATION] |
| P2: CLI 优先 | ✅/⚠/❌ | [EXPLANATION] |
| P3: 平台无关核心 | ✅/⚠/❌ | [EXPLANATION] |
| P4: 可组合管道化 | ✅/⚠/❌ | [EXPLANATION] |
| P5: 插件平等可扩展 | ✅/⚠/❌ | [EXPLANATION] |
| P6: CLI 单元测试纪律 | ✅/⚠/❌ | [EXPLANATION] |
| P7: 类型安全与不可变数据 | ✅/⚠/❌ | [EXPLANATION] |

### 关卡评估

- [ ] 所有原则检查通过（无 ❌）
- [ ] 所有 NEEDS CLARIFICATION 已解决
- [ ] 技术栈选型已确认

## Phase 0：研究

### 研究任务

1. [RESEARCH_TOPIC]: [QUESTION]

### 研究结果

输出至 `research.md`。

## Phase 1：设计与契约

### 数据模型

输出至 `data-model.md`。

### 接口契约

输出至 `contracts/`。

### 快速启动

输出至 `quickstart.md`。

## Phase 2：任务分解

输出至 `tasks.md`（由 `/speckit.tasks` 生成）。
