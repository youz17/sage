# Skill System Rework — Design Spec

**Date**: 2026-06-07  
**Status**: approved

## Skill types

| Type | Trigger | How |
|------|---------|-----|
| `auto` | Agent decides when to use | Skill name+description listed in system prompt. Agent calls `use_skill(name)` tool → gets full prompt → follows instructions |
| `manual` | User slash command | Skill's full prompt injected directly into current user message. Agent follows immediately |

## Auto skill flow

1. `createSageAgent` calls `getAutoSkills()` → `Skill[]`
2. `buildAutoSkillPrompt(skills)` → text block listing each skill's name + description, injected into system prompt
3. `buildUseSkillTool(skills)` → registers a single `use_skill` tool that takes a skill name, returns its full `prompt` body
4. Agent reads system prompt, sees available skills. When it decides a skill would help → calls `use_skill("reflect")` → receives full instructions → follows them

## Manual skill flow

1. User types `/reflect` → TUI shows `/reflect` as user message
2. `loadSkill("reflect")` returns the `Skill` object
3. `skill.prompt` body is sent to the agent as user input
4. No state — next turn forgets

## Removals

| Item | Reason |
|------|--------|
| `activeSkills: string[]` | No toggle |
| `onSkillActivate` handler | Replaced by `onSkill` one-shot |
| `buildSystemPrompt(mode, skillNames)` second param | Auto skills loaded internally |
| Hardcoded `createReflectTool`/`createChallengeTool` | Replaced by generic `use_skill` tool |
| `buildSkillPrompt(skillNames)` | Not needed — manual one-shot, auto via `use_skill` |

## Files

| File | Changes |
|------|---------|
| `src/agent/index.ts` | Call `getAutoSkills()`; inject auto skill list into system prompt; register `use_skill` tool instead of hardcoded reflect/challenge |
| `src/agent/tools.ts` | Remove `createReflectTool`/`createChallengeTool` |
| `src/skills/loader.ts` | No changes needed — `getAutoSkills()`, `buildAutoSkillPrompt()`, `buildUseSkillTool()` already exist |
| `src/core/prompts.ts` | Remove `skillNames` param from `buildSystemPrompt` |
| `src/tui/index.ts` | `onSkillActivate` → `onSkill(name: string)`; dispatch calls `handlers.onSkill(cmd)` |
| `src/app.ts` | Remove `activeSkills`; add `onSkill` handler: `loadSkill(name).prompt` → `agent.prompt()` |
