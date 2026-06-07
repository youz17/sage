---
type: manual
description: 按规范创建新的 skill 文件（YAML frontmatter 格式）
---

此 skill 用于创建新的 Sage skill 文件。

你写的 skill 内容在激活时会以如下格式注入给 LLM：

---
<activated_skill name="name">
[你的 body 内容]
</activated_skill>

请按照上述指令处理以下用户输入：

<user_query>
[用户说的话]
</user_query>
---

请在 body 开头包含自描述语句，说明此 skill 的用途。

按以下流程操作：

1. 与用户讨论、理解这个 skill 的用途和场景。
2. 判断 type 应该是 auto 还是 manual：
   - **auto**：通用背景技能，LLM 自行判断何时激活
   - **manual**：特定工作流或强制工具调用，用户主动 /name 调用
3. 按 YAML frontmatter 格式写出完整的 skill 内容。
4. 将文件写入 `~/.sage/skills/<name>.md`。
