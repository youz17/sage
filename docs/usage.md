# Sage 使用指南

## CLI

```bash
sage                  # 启动 TUI，自动恢复最近会话
sage --new            # 全新会话（自动标题）
sage --new my-name    # 全新会话，指定标题
sage --resume         # 恢复最近会话
sage --resume my-name # 恢复名字匹配的会话（模糊匹配 title 或 id）
```

## 内置模式

| 模式 | 行为 |
|------|------|
| `socratic`（默认） | 苏格拉底式提问引导 |
| `direct` | 直接明确，先给结论 |
| `discuss` | 协作讨论 |
| `deep` | 多维深度分析 |
| `perspectives` | 多角色视角合成 |

## 内置技能

- `reflect` — 激活自省模式，回答前先自我审查
- `challenge` — 激活魔鬼代言人模式，回答前先自我质疑
- `goal` — 任务分解、逐步推进

## TUI 斜杠命令

| 命令 | 说明 | 补全 |
|------|------|------|
| `/mode <name>` | 切换模式 | ✅ mode 名 |
| `/session-new <name?>` | 新会话 | — |
| `/session-list` | 列出所有会话 | — |
| `/session-resume <name>` | 恢复会话 | ✅ session 名 |
| `/session-delete <name>` | 删除会话 | ✅ session 名 |
| `/reflect` | 激活 reflect 技能 | — |
| `/challenge` | 激活 challenge 技能 | — |
| `/goal` | 激活 goal 技能 | — |
| `/quit` / `/exit` | 退出 | — |

快捷键：`Ctrl+C` / `Ctrl+D` 退出。

## 自定义扩展

在 `~/.sage/` 下放置 `.md` 文件：

- `modes/` — 自定义模式（文件名 = mode 名，同名覆盖内置）
- `skills/` — 自定义技能（文件名 = skill 名，同名覆盖内置）
- `rules/` — 全局规则（所有文件全部注入 system prompt）
