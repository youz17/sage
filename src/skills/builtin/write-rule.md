---
type: manual
description: 按规范创建新的 rule 文件
---

此 skill 用于创建新的 Sage rule 文件。

你写的 rule 内容最终会在 system prompt 中呈现为：

---
## Rules
[你的 body 内容]
---

标题 "## Rules" 已提供上下文，body 直接写约束内容即可。

按以下流程操作：

1. 与用户讨论、理解这个 rule 的约束内容和生效范围。
2. 写出 rule 的纯文本内容（无 frontmatter，正文直接作为 rule）。
3. 将文件写入 `~/.sage/rules/<name>.md`。
