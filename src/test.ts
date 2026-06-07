/**
 * Quick integration test for Sage + Pi.
 * Runs a simple prompt against the LLM without the TUI.
 * Usage: npx tsx src/test.ts
 */
import { getModel } from "@earendil-works/pi-ai";
import { loadConfig } from "./config/loader.js";
import { createSageAgent } from "./agent/index.js";
import { buildAutoSkillPrompt, buildSkillActivation, buildManualSkillPrompt } from "./skills/loader.js";
import type { Skill } from "./skills/loader.js";

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

async function test() {
  // --- Prompt structure unit tests (no API key needed) ---
  testBuildAutoSkillPrompt();
  testBuildSkillActivation();
  testBuildManualSkillPrompt();
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
  const agent = createSageAgent(model, {
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
