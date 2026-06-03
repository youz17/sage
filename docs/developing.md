# 开发者指南

## 运行与开发

```
npm start        # 启动 TUI
npm run dev      # 同上
npm run build    # tsc 类型检查
npm run test     # 非 TUI 集成测试
```

CLI flags 详见 `docs/usage.md`。

## 配置

`~/.sage/config.json`（首次运行自动创建）：

```json
{
  "model": { "provider": "deepseek", "model": "deepseek-v4-pro", "apiKey": "" },
  "defaultMode": "socratic",
  "tavilyApiKey": ""
}
```

`provider` 用 Pi 名称（`deepseek` / `openai` / `anthropic` ...），不是 URL。

扩展目录：
- `modes/*.md` — 自定义对话模式（同名覆盖内置）
- `skills/*.md` — 自定义技能 prompt（同名覆盖内置）
- `rules/*.md` — 全局规则（全部注入 system prompt）
- `sessions/*.json` — 会话存档
- `logs/*.jsonl` — 运行日志

## 调试

出问题先读 `~/.sage/logs/<session-id>.jsonl`。

```bash
# 看最后一次运行的事件
tail -20 ~/.sage/logs/*.jsonl

# 只看错误
grep '"error"' ~/.sage/logs/*.jsonl

# 只看 LLM 调用
grep '"agent:prompt\|agent:response"' ~/.sage/logs/*.jsonl
```

日志格式：
```jsonl
{"ts":"...","type":"session:init","id":"...","mode":"socratic","model":"deepseek-v4-pro"}
{"ts":"...","type":"agent:prompt","text":"What is 2+2?"}
{"ts":"...","type":"tool:start","name":"web_search","args":{"query":"..."}}
{"ts":"...","type":"tool:end","name":"web_search"}
{"ts":"...","type":"agent:response","text":"2+2=4"}
{"ts":"...","type":"session:save","id":"..."}
```

所有 API key 自动替换为 `***`。
