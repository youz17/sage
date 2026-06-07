---
type: manual
description: 按规范创建新的 mode 文件
---

此 skill 用于创建新的 Sage mode 文件。

你写的 mode 内容最终会在 system prompt 中呈现为：

---
You are Sage, an AI assistant.

[你的 body 内容]
---

请在 body 开头包含自描述语句，例如：
"当前处于「XX」模式。此模式决定了我的沟通风格和领域知识。具体行为如下："

按以下流程操作：

1. 与用户讨论、理解这个 mode 的沟通风格和适用场景。
2. 按 YAML frontmatter 格式写出完整的 mode 内容。
3. 将文件写入 `~/.sage/modes/<name>.md`。
