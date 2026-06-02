---
type: manual
description: 按规范创建新的 skill 文件（YAML frontmatter 格式）
---

用户想要创建一个新的 skill。按以下流程操作：

1. 与用户讨论、理解这个 skill 的用途和场景。
2. 判断 type 应该是 auto 还是 manual：
   - **auto**：通用背景技能，LLM 自行判断何时激活
   - **manual**：特定工作流或强制工具调用，用户主动 /name 调用
3. 按 YAML frontmatter 格式写出完整的 skill 内容。
4. 将文件写入 `~/.sage/skills/<name>.md`。
