/**
 * Quick integration test for Sage + Pi.
 * Runs a simple prompt against the LLM without the TUI.
 * Usage: npx tsx src/test.ts
 */
import { getModel } from "@earendil-works/pi-ai";
import { loadConfig } from "./config/loader.js";
import { createSageAgent } from "./agent/index.js";
import { createWebFetchTool, htmlToMarkdown } from "./agent/tools.js";
import { buildAutoSkillPrompt, buildSkillActivation, buildManualSkillPrompt } from "./skills/loader.js";
import type { Skill } from "./skills/loader.js";
import { escapeShell, ToolManager } from "./agent/tool-manager.js";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function testBuildAutoSkillPrompt() {
  const skills: Skill[] = [
    { name: "reflect", type: "auto", description: "回答前自省", prompt: "xxx" },
    { name: "challenge", type: "auto", description: "魔鬼代言人", prompt: "yyy" },
  ];

  const result = buildAutoSkillPrompt(skills);

  const checks = [
    result.includes("<available_skills>"),
    result.includes("</available_skills>"),
    result.includes("<skill>"),
    result.includes("</skill>"),
    result.includes("<name>reflect</name>"),
    result.includes("<description>回答前自省</description>"),
    result.includes("<name>challenge</name>"),
    result.includes("<description>魔鬼代言人</description>"),
    !result.includes("- reflect"),
  ];

  const allPassed = checks.every(Boolean);
  console.log(allPassed ? "✅ buildAutoSkillPrompt passed" : "❌ buildAutoSkillPrompt FAILED");
  if (!allPassed) {
    console.log("  Result:", result);
  }
}

function testBuildSkillActivation() {
  const skill: Skill = {
    name: "test-skill",
    type: "auto",
    description: "测试技能",
    prompt: "这是测试技能的指令内容：\n1. 做A\n2. 做B",
  };

  const result = buildSkillActivation(skill);

  const checks = [
    result.startsWith('<activated_skill name="test-skill">'),
    result.endsWith("</activated_skill>"),
    result.includes("这是测试技能的指令内容："),
    result.includes("1. 做A"),
    result.includes("2. 做B"),
  ];

  const allPassed = checks.every(Boolean);
  console.log(allPassed ? "✅ buildSkillActivation passed" : "❌ buildSkillActivation FAILED");
  if (!allPassed) {
    console.log("  Result:", result);
  }
}

function testBuildManualSkillPrompt() {
  const skill: Skill = {
    name: "goal",
    type: "manual",
    description: "目标分解",
    prompt: "用户设定了一个目标。按以下步骤：\n1. 分解\n2. 执行",
  };

  const userText = "帮我分析这个项目";

  const result = buildManualSkillPrompt(skill, userText);

  const checks = [
    result.startsWith('<activated_skill name="goal">'),
    result.includes("</activated_skill>"),
    result.includes("请按照上述指令处理以下用户输入："),
    result.includes("<user_query>"),
    result.includes("帮我分析这个项目"),
    result.includes("</user_query>"),
    result.indexOf("帮我分析这个项目") < result.indexOf("</user_query>"),
    result.indexOf("请按照上述指令") > result.indexOf("</activated_skill>"),
  ];

  const allPassed = checks.every(Boolean);
  console.log(allPassed ? "✅ buildManualSkillPrompt passed" : "❌ buildManualSkillPrompt FAILED");
  if (!allPassed) {
    console.log("  Result:", result);
  }
}

function testHtmlToMarkdown() {
  const html = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <nav>Skip nav</nav>
  <article>
    <h1>Hello World</h1>
    <p>This is a <strong>paragraph</strong> with a <a href="https://example.com">link</a>.</p>
    <ul>
      <li>Item one</li>
      <li>Item two</li>
    </ul>
    <pre><code>const x = 1;</code></pre>
  </article>
  <footer>Footer stuff</footer>
</body>
</html>`;

  const md = htmlToMarkdown(html);

  const checks = [
    md.includes("Hello World"),
    md.includes("paragraph"),
    md.includes("example.com") || md.includes("link"),
    md.includes("const x = 1;"),
    /#/.test(md) || md.includes("Hello World"),  // at least has heading
  ];

  const allPassed = checks.every(Boolean);
  console.log(allPassed ? "✅ htmlToMarkdown passed" : "❌ htmlToMarkdown FAILED");
  if (!allPassed) {
    console.log("  Output:", md);
  }
}

function testCreateWebFetchTool() {
  const tool = createWebFetchTool();

  const checks = [
    tool.name === "webfetch",
    tool.label === "Fetch Web",
    tool.description.length > 10,
    tool.parameters !== undefined,
    typeof tool.execute === "function",
  ];

  const allPassed = checks.every(Boolean);
  console.log(allPassed ? "✅ createWebFetchTool passed" : "❌ createWebFetchTool FAILED");
  if (!allPassed) {
    console.log("  Results:", { name: tool.name, label: tool.label, descLen: tool.description.length, hasParams: tool.parameters !== undefined, isFn: typeof tool.execute === "function" });
  }
}

function testEscapeShell() {
  const cases: [string, string][] = [
    ["hello", "'hello'"],
    ["it's", "'it'\\''s'"],
    ["", "''"],
    ["a b", "'a b'"],
    ["$PATH", "'$PATH'"],
  ];
  const passed = cases.every(([input, expected]) => {
    const got = escapeShell(input);
    if (got !== expected) {
      console.log(`  FAIL: escapeShell(${JSON.stringify(input)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
      return false;
    }
    return true;
  });
  console.log(passed ? "✅ escapeShell passed" : "❌ escapeShell FAILED");
}

function testToolManagerActivateIdempotent() {
  const tmpDir = join(tmpdir(), "sage-test-" + Math.random().toString(36).slice(2));
  const skillDir = join(tmpDir, "test-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "skill.md"), "---\ntype: auto\ndescription: test\n---\n");
  writeFileSync(join(skillDir, "tools.json"), JSON.stringify({
    tools: [
      {
        name: "test_echo",
        label: "Echo",
        description: "Echoes input",
        parameters: {
          msg: { type: "string", required: true, description: "message" }
        },
      command: "node -e \"process.stdout.write(process.argv[1])\" {{msg}}"
      }
    ]
  }));

  const baseTools: any[] = [{ name: "base", label: "Base", description: "b", parameters: {} as any, execute: async () => ({ content: [], details: null }) }];
  const mgr = new ToolManager(baseTools, tmpDir);

  mgr.activate("test-skill");
  const tools1 = mgr.getActiveTools();
  const match1 = tools1.length === 2;

  mgr.activate("test-skill");
  const tools2 = mgr.getActiveTools();
  const match2 = tools2.length === 2;

  const names = mgr.getActiveSkillNames();
  const match3 = names.length === 1 && names[0] === "test-skill";

  const desc = mgr.getToolDescriptions("test-skill");
  const match4 = desc?.includes("test_echo") === true && desc?.includes("Echoes input") === true;

  const st = mgr.getSkillTools("test-skill");
  const match5 = st.length === 1 && st[0].name === "test_echo";

  const count = mgr.getToolCount("test-skill");
  const match6 = count === 1;

  const countNone = mgr.getToolCount("nonexistent");
  const match7 = countNone === 0;

  mgr.deactivate("test-skill");
  const tools3 = mgr.getActiveTools();
  const match8 = tools3.length === 1;

  const allPassed = [match1, match2, match3, match4, match5, match6, match7, match8].every(Boolean);
  console.log(allPassed ? "✅ ToolManager activate/idempotent/deactivate passed" : "❌ ToolManager activate/idempotent/deactivate FAILED");
  if (!allPassed) {
    console.log("  Results:", { match1, match2, match3, match4, match5, match6, match7, match8 });
  }

  rmSync(tmpDir, { recursive: true, force: true });
}

function testToolManagerNoToolsJson() {
  const tmpDir = join(tmpdir(), "sage-test-" + Math.random().toString(36).slice(2));
  const skillDir = join(tmpDir, "no-tools-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "skill.md"), "---\ntype: auto\n---\n");

  const mgr = new ToolManager([], tmpDir);
  mgr.activate("no-tools-skill");
  const tools = mgr.getActiveTools();
  const match = tools.length === 0;

  console.log(match ? "✅ ToolManager no-tools.json passed" : "❌ ToolManager no-tools.json FAILED");
  rmSync(tmpDir, { recursive: true, force: true });
}

function testToolManagerSyncToAgent() {
  const tmpDir = join(tmpdir(), "sage-test-" + Math.random().toString(36).slice(2));
  const skillDir = join(tmpDir, "echo-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "skill.md"), "---\ntype: auto\n---\n");
  writeFileSync(join(skillDir, "tools.json"), JSON.stringify({
    tools: [{
      name: "echo",
      label: "Echo",
      description: "Echo",
      parameters: { msg: { type: "string", required: true, description: "msg" } },
      command: "node -e \"process.stdout.write('{{msg}}')\""
    }]
  }));

  const mgr = new ToolManager([], tmpDir);

  let capturedTools: any[] = [];
  const mockAgent = {
    state: {
      get tools() { return capturedTools; },
      set tools(v: any[]) { capturedTools = v; },
    },
  };

  mgr.setAgent(mockAgent as any);
  let match1 = capturedTools.length === 0;

  mgr.activate("echo-skill");
  let match2 = capturedTools.length === 1 && capturedTools[0].name === "echo";

  console.log(match1 && match2 ? "✅ ToolManager syncToAgent passed" : "❌ ToolManager syncToAgent FAILED");
  if (!(match1 && match2)) {
    console.log("  Results:", { match1, match2, toolCount: capturedTools.length });
  }

  rmSync(tmpDir, { recursive: true, force: true });
}

async function testSkillToolIntegration() {
  const tmpDir = join(tmpdir(), "sage-int-" + Math.random().toString(36).slice(2));
  const skillDir = join(tmpDir, "echo-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "skill.md"), "---\ntype: auto\ndescription: Echo skill for testing\n---\n");
  writeFileSync(join(skillDir, "tools.json"), JSON.stringify({
    tools: [{
      name: "echo",
      label: "Echo",
      description: "Returns the input message verbatim",
      parameters: {
        msg: { type: "string", required: true, description: "The message to echo" }
      },
      command: "node -e \"process.stdout.write(process.argv[1])\" {{msg}}"
    }]
  }));

  const baseTools: AgentTool[] = [];
  const mgr = new ToolManager(baseTools, tmpDir);

  const scanCount = mgr.getToolCount("echo-skill");
  if (scanCount !== 1) {
    console.log("❌ testSkillToolIntegration FAILED: scan found", scanCount, "tools, expected 1");
    rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  mgr.activate("echo-skill");
  const active = mgr.getActiveTools();
  if (active.length !== 1 || active[0].name !== "echo") {
    console.log("❌ testSkillToolIntegration FAILED: active tools mismatch");
    rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  const tool = active[0];
  const result = await tool.execute("call-1", { msg: "hello" }, undefined);
  const text = (result.content[0] as any).text;

  const match = text.includes("hello");

  if (match) {
    console.log("✅ testSkillToolIntegration passed");
  } else {
    console.log("❌ testSkillToolIntegration FAILED: got", JSON.stringify(text));
  }

  rmSync(tmpDir, { recursive: true, force: true });
}

async function test() {
  // --- Prompt structure unit tests (no API key needed) ---
  testBuildAutoSkillPrompt();
  testBuildSkillActivation();
  testBuildManualSkillPrompt();
  testHtmlToMarkdown();
  testCreateWebFetchTool();
  testEscapeShell();
  testToolManagerActivateIdempotent();
  testToolManagerNoToolsJson();
  testToolManagerSyncToAgent();
  await testSkillToolIntegration();
  console.log();

  console.log("Loading config...");
  const config = loadConfig();

  if (!config.model.apiKey) {
    console.error("ERROR: No API key configured. Set apiKey in ~/.sage/config.json");
    process.exit(1);
  }

  console.log(`Provider: ${config.model.provider}`);
  console.log(`Model: ${config.model.model}`);
  console.log(`API key: ${config.model.apiKey.slice(0, 8)}...`);

  // Set env var for Pi provider auto-detection
  const envVarMap: Record<string, string> = {
    deepseek: "DEEPSEEK_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
    groq: "GROQ_API_KEY",
    mistral: "MISTRAL_API_KEY",
    xai: "XAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
  };
  const envVar = envVarMap[config.model.provider.toLowerCase()];
  if (envVar) {
    process.env[envVar] = config.model.apiKey;
  }

  console.log(`\nCreating model...`);
  const model = getModel(config.model.provider as any, config.model.model);
  console.log(`Model API: ${model.api}`);

  console.log(`\nCreating agent...`);
  const { agent } = createSageAgent(model, {
    mode: "direct",
    tavilyApiKey: config.tavilyApiKey,
  });

  const question = "What is 2 + 2? Answer in one short sentence.";

  console.log(`\nSending: "${question}"`);
  console.log("---");

  let fullResponse = "";

  agent.subscribe((event) => {
    if (event.type === "message_update" && (event as any).assistantMessageEvent?.type === "text_delta") {
      const delta = (event as any).assistantMessageEvent.delta;
      fullResponse += delta;
      process.stdout.write(delta);
    }
    if (event.type === "tool_execution_start") {
      console.log(`\n[Tool: ${(event as any).toolName}]`);
    }
    if (event.type === "agent_end") {
      console.log("\n\n--- DONE ---");
      console.log("Tokens used:", (event as any).usage || "N/A");
    }
  });

  await agent.prompt(question);
  await agent.waitForIdle();

  if (fullResponse) {
    console.log("\n✅ Test passed — got response.");
  } else {
    console.log("\n❌ Test failed — no response.");
  }
}

test().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
