---
description: 通过交互式或提供的原则输入创建或更新项目章程，确保所有依赖模板保持同步。
handoffs: 
  - label: 构建规约
    agent: speckit.specify
    prompt: Implement the feature specification based on the updated constitution. I want to build...
---

## 用户输入

```text
$ARGUMENTS
```

在继续之前，你**必须**考虑用户输入（如果非空）。

## 执行大纲

**语言规则**: 章程中所有自然语言内容必须使用简体中文编写。包括原则名称、描述、治理规则、章节标题、理由和同步影响报告。技术标识符（版本号、日期、文件路径、占位符 token）保持英文。

你正在更新 `.specify/memory/constitution.md` 中的项目章程。此文件是一个包含方括号占位符 token（如 `[PROJECT_NAME]`、`[PRINCIPLE_1_NAME]`）的模板。你的任务是 (a) 收集/推导具体值，(b) 精确填充模板，(c) 将修订传播到依赖产物。

**注意**：如果 `.specify/memory/constitution.md` 尚不存在，它应该在项目初始化时从 `.specify/templates/constitution-template.md` 初始化。如果缺失，先复制模板。

按以下执行流程操作：

1. 加载 `.specify/memory/constitution.md` 中的现有章程。
   - 识别所有 `[ALL_CAPS_IDENTIFIER]` 形式的占位符 token。
   **重要**：用户可能需要比模板中更少或更多的原则。如果指定了数量，请遵守——按照通用模板。你将相应更新文档。

2. 收集/推导占位符的值：
   - 如果用户输入（对话）提供了值，使用它。
   - 否则从现有仓库上下文推断（README、文档、先前的章程版本（如嵌入））。
   - 对于治理日期：`RATIFICATION_DATE` 是最初采纳日期（如果未知则询问或标记 TODO），`LAST_AMENDED_DATE` 如果有变更则为今天，否则保持之前的值。
   - `CONSTITUTION_VERSION` 必须按语义版本规则递增：
     - MAJOR：不向后兼容的治理/原则移除或重新定义。
     - MINOR：新增原则/章节或实质性扩展指导。
     - PATCH：澄清、措辞、拼写修正、非语义改进。
   - 如果版本升级类型模糊，在最终确定前提出理由。

3. 起草更新后的章程内容：
   - 用具体文本替换每个占位符（不留方括号 token，除非是项目选择暂不定义的有意保留的模板槽位——明确说明保留理由）。
   - 保持标题层级，注释在替换后可以移除，除非它们仍提供澄清指导。
   - 确保每个原则章节：简洁的名称行，段落（或要点列表）捕捉不可协商的规则，不明显时附明确理由。
   - 确保治理章节列出修订程序、版本策略和合规审查预期。

4. 一致性传播检查清单（将先前检查清单转换为主动验证）：
   - 读取 `.specify/templates/plan-template.md`，确保任何"章程检查"或规则与更新后的原则一致。
   - 读取 `.specify/templates/spec-template.md` 进行范围/需求对齐——如果章程添加/移除了必填章节或约束则更新。
   - 读取 `.specify/templates/tasks-template.md`，确保任务分类反映新增或移除的原则驱动任务类型（如可观测性、版本管理、测试纪律）。
   - 读取 `.specify/templates/commands/*.md` 中的每个命令文件（包括本文件），验证在需要通用指导时没有过时的引用（如仅限 CLAUDE 的 agent 特定名称）。
   - 读取任何运行时指导文档（如 `README.md`、`docs/quickstart.md` 或 agent 特定指导文件（如存在））。更新对已变更原则的引用。

5. 生成同步影响报告（更新后作为 HTML 注释添加到章程文件顶部）：
   - 版本变更：旧 → 新
   - 已修改原则列表（旧标题 → 新标题（如重命名））
   - 新增章节
   - 移除章节
   - 需要更新的模板（✅ 已更新 / ⚠ 待处理）及文件路径
   - 后续 TODO（如有占位符被有意推迟）。

6. 最终输出前的验证：
   - 无未解释的方括号 token 残留。
   - 版本行与报告匹配。
   - 日期为 ISO 格式 YYYY-MM-DD。
   - 原则是声明式的、可测试的，无模糊语言（"should" → 替换为 MUST/SHOULD 并附理由）。

7. 将完成的章程写回 `.specify/memory/constitution.md`（覆写）。

8. 向用户输出最终总结：
   - 新版本和升级理由。
   - 标记为需要手动跟进的文件。
   - 建议的提交消息（如 `docs: amend constitution to vX.Y.Z (principle additions + governance update)`）。

格式与风格要求：

- 使用与模板完全一致的 Markdown 标题（不要降级/提升层级）。
- 换行长理由行以保持可读性（理想 <100 字符），但不要用尴尬的断行强制执行。
- 章节之间保持一个空行。
- 避免尾随空格。

如果用户提供部分更新（如仅修订一个原则），仍执行验证和版本决策步骤。

如果关键信息缺失（如批准日期确实未知），插入 `TODO(<FIELD_NAME>): 说明` 并在同步影响报告的推迟项下包含。

不要创建新模板；始终操作现有的 `.specify/memory/constitution.md` 文件。
