/**
 * Quick integration test for Sage + Pi.
 * Runs a simple prompt against the LLM without the TUI.
 * Usage: npx tsx src/test.ts
 */
import { getModel } from "@earendil-works/pi-ai";
import { loadConfig } from "./config/loader.js";
import { createSageAgent } from "./agent/index.js";

async function test() {
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
    skillNames: [],
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
