---
description: 执行实现计划工作流，使用计划模板生成设计产物。
handoffs: 
  - label: 创建任务
    agent: speckit.tasks
    prompt: Break the plan into tasks
    send: true
  - label: 创建检查清单
    agent: speckit.checklist
    prompt: Create a checklist for the following domain...
---

## 用户输入

```text
$ARGUMENTS
```

在继续之前，你**必须**考虑用户输入（如果非空）。

## 执行大纲

**语言规则**: 生成的所有计划文档（plan.md、research.md、data-model.md、quickstart.md、contracts/）中的自然语言内容必须使用简体中文编写。包括章节标题、概述、描述、决策、理由及所有说明性文本。技术标识符（文件路径、代码片段、命令示例、变量名）保持英文。

1. **初始化**：从仓库根目录运行 `.specify/scripts/bash/setup-plan.sh --json`，解析 JSON 获取 FEATURE_SPEC、IMPL_PLAN、SPECS_DIR、BRANCH。对于参数中的单引号（如 "I'm Groot"），使用转义语法：如 'I'\''m Groot'（或尽可能使用双引号："I'm Groot"）。

2. **加载上下文**：读取 FEATURE_SPEC 和 `.specify/memory/constitution.md`。加载 IMPL_PLAN 模板（已复制）。

3. **执行计划工作流**：按照 IMPL_PLAN 模板中的结构：
   - 填写技术上下文（将未知项标记为 "NEEDS CLARIFICATION"）
   - 从章程填写章程检查章节
   - 评估关卡（如违规未说明则 ERROR）
   - Phase 0：生成 research.md（解决所有 NEEDS CLARIFICATION）
   - Phase 1：生成 data-model.md、contracts/、quickstart.md
   - Phase 1：运行 agent 脚本更新 agent 上下文
   - 设计完成后重新评估章程检查

4. **停止并报告**：命令在 Phase 2 计划后结束。报告分支、IMPL_PLAN 路径和生成的产物。

## 阶段

### Phase 0：大纲与研究

1. **从上方技术上下文中提取未知项**：
   - 每个 NEEDS CLARIFICATION → 研究任务
   - 每个依赖项 → 最佳实践任务
   - 每个集成项 → 模式任务

2. **生成并分派研究 agent**：

   ```text
   对于技术上下文中的每个未知项：
     Task: "研究 {unknown}，用于 {feature context}"
   对于每个技术选型：
     Task: "查找 {tech} 在 {domain} 中的最佳实践"
   ```

3. **在 `research.md` 中汇总发现**，使用以下格式：
   - 决策：[选择了什么]
   - 理由：[为什么选择]
   - 考虑的替代方案：[还评估了什么]

**输出**：research.md，所有 NEEDS CLARIFICATION 已解决

### Phase 1：设计与契约

**前置条件**：`research.md` 已完成

1. **从功能规约中提取实体** → `data-model.md`：
   - 实体名称、字段、关系
   - 来自需求的验证规则
   - 状态转换（如适用）

2. **定义接口契约**（如果项目有外部接口）→ `/contracts/`：
   - 识别项目向用户或其他系统暴露的接口
   - 记录适合项目类型的契约格式
   - 示例：库的公共 API、CLI 工具的命令 schema、Web 服务的端点、解析器的语法、应用的 UI 契约
   - 如果项目纯内部使用（构建脚本、一次性工具等），则跳过

3. **Agent 上下文更新**：
   - 运行 `.specify/scripts/bash/update-agent-context.sh cursor-agent`
   - 这些脚本检测正在使用的 AI agent
   - 更新相应的 agent 特定上下文文件
   - 仅添加当前计划中的新技术
   - 保留标记之间的手动添加内容

**输出**：data-model.md、/contracts/*、quickstart.md、agent 特定文件

## 关键规则

- 使用绝对路径
- 关卡失败或未解决的澄清项时 ERROR
